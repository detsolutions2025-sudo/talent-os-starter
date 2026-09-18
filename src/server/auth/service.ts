import { createHash } from "node:crypto";
import type pg from "pg";
import type { JWTVerifyGetKey } from "jose";
import { authorize } from "../core/authorization";
import { fingerprint } from "../core/canonical-hash";
import { conflict, forbidden, notFound, tooManyRequests } from "../core/errors";
import { normalizeEmail } from "../core/normalization";
import { RateLimiter, type RateLimitConfig } from "../core/rate-limiter";
import type { RateLimitStore } from "../core/rate-limit-store";
import type { CoreRepository } from "../core/repository";
import { CoreService } from "../core/service";
import type { Actor, AuditEvent } from "../core/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresAuthRepository } from "../persistence/postgres-auth-repository";
import { verifyProviderToken, type ProviderJwtVerifierOptions } from "./jwt";
import type { AuthRepository } from "./repository";
import type { SupabaseAdminPort } from "./supabase-admin-port";
import {
  createAuthTransactionRunner,
  type AuthTransaction,
  type AuthTransactionRunner
} from "./transaction";
import type {
  BootstrapOrganizationInput,
  CreateInvitationInput,
  Invitation,
  InvitationIdempotencyOperation,
  VerifiedProviderClaims
} from "./types";
import {
  validateBootstrapInput,
  validateCreateInvitationInput,
  validateIdempotencyKey,
  validateRevokeSessionInput
} from "./validation";

// Fase 29 (ADR-0026; SPEC-028 v1.0). `AuthService` nunca e chamado por
// `authorize()`/`CoreService` -- e o inverso: este service CHAMA `CoreService` para materializar
// User/Membership/Organization, sempre pelas operacoes atomicas ja existentes e testadas
// (`createUser`, `createMembership`, `createOrganization`), nunca SQL paralelo reimplementando
// RN-006/RBAC/unicidade.
//
// SYSTEM_ACTOR: usado exclusivamente para as tres materializacoes internas do aceite/bootstrap
// (criar User, criar Membership, criar Organization). Nunca client-controlled, nunca exposto por
// nenhuma rota -- e uma constante fixa deste modulo. E seguro porque `platformPermissions`
// (core/authorization.ts) ja concede `platform.user.create`/`membership.create`/
// `membership.manage_owner`/`platform.organization.create` a qualquer Actor{kind:"platform"},
// exatamente as tres operacoes que este fluxo precisa -- a MESMA autoridade que Platform Admin ja
// tem hoje via dev-auth, agora acionada pelo proprio sistema apos verificar criptograficamente um
// evento de confirmacao do provider (nunca por escolha do cliente). Isso nao adiciona nenhuma
// permissao nova a `core/authorization.ts` -- reaproveita a matriz existente, byte a byte.
const SYSTEM_ACTOR: Actor = { kind: "platform", userId: null };

export type AuthServiceDeps = {
  core: CoreRepository;
  auth: AuthRepository;
  runTransaction: AuthTransactionRunner;
  provider: SupabaseAdminPort;
  getKey: JWTVerifyGetKey;
  jwtOptions: ProviderJwtVerifierOptions;
  // Prazo de validade de convites -- SPEC-028 nao fixa um numero exato (s15 "expires_at ...
  // Prazo de validade"); 7 dias e o padrao adotado aqui, consistente com o padrao de convite do
  // proprio Supabase Auth.
  invitationTtlMs?: number;
  // Fase 32 (ADR-0027 s9). Ausente = `RateLimiter` usa seu default in-memory (preserva, sem
  // nenhuma mudanca de comportamento, todo teste existente que constroi `AuthService` sem
  // conhecer este campo); `index.ts` injeta explicitamente `new PostgresRateLimitStore(pool)`
  // em producao.
  rateLimitStore?: RateLimitStore;
};

const DEFAULT_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// SPEC-028 s29: "Criar convite, aceitar convite, bootstrap, revogar sessao de terceiro:
// protegidos pelo RateLimiter in-memory ja existente (core/rate-limiter.ts)... nenhuma nova
// implementacao de rate limiting criada por esta SPEC, apenas reaproveitamento." Mesma classe
// generica ja usada por propostas/avaliacoes/pre-entrevistas/candidatura publica.
//
// Fase 32 (ADR-0027 s9): store agora injetavel (`AuthServiceDeps.rateLimitStore`) -- `index.ts`
// passa `new PostgresRateLimitStore(pool)` em producao, tornando estes seis namespaces
// autoritativos entre instancias (nao mais limitados a um unico processo).
// `failureMode: "closed"` em todos: classe A ("autenticacao/login") -- nunca deixar login/
// gestao de sessao sem protecao alguma quando o store estiver indisponivel (ADR-0027 s9).
//
// `sessionBridge`/`refresh` sao novos nesta Fase -- `/auth/session` e `/auth/refresh`
// (`http/routes.ts`) trocam um token assinado por cookies HttpOnly de sessao e nao tinham
// nenhum rate limit proprio ate aqui (unicas rotas publicas de `auth` sem protecao, achado
// fisico do discovery desta Fase). Chave: IP (nenhum Actor/sessao ainda existe neste ponto).
export const DEFAULT_AUTH_RATE_LIMITS = {
  invitationCreate: {
    limit: 20,
    windowMs: 60_000,
    failureMode: "closed"
  } satisfies RateLimitConfig,
  invitationAccept: {
    limit: 10,
    windowMs: 60_000,
    failureMode: "closed"
  } satisfies RateLimitConfig,
  bootstrap: { limit: 5, windowMs: 60_000, failureMode: "closed" } satisfies RateLimitConfig,
  sessionRevoke: {
    limit: 10,
    windowMs: 60_000,
    failureMode: "closed"
  } satisfies RateLimitConfig,
  sessionBridge: {
    limit: 20,
    windowMs: 60_000,
    failureMode: "closed"
  } satisfies RateLimitConfig,
  refresh: { limit: 30, windowMs: 60_000, failureMode: "closed" } satisfies RateLimitConfig
};
export type AuthRateLimitNamespace = keyof typeof DEFAULT_AUTH_RATE_LIMITS;

export class AuthService {
  private readonly core: CoreRepository;
  private readonly auth: AuthRepository;
  private readonly runTransaction: AuthTransactionRunner;
  private readonly provider: SupabaseAdminPort;
  private readonly getKey: JWTVerifyGetKey;
  private readonly jwtOptions: ProviderJwtVerifierOptions;
  private readonly invitationTtlMs: number;
  private readonly rateLimiter: RateLimiter<AuthRateLimitNamespace>;

  constructor(deps: AuthServiceDeps) {
    this.core = deps.core;
    this.auth = deps.auth;
    this.runTransaction = deps.runTransaction;
    this.provider = deps.provider;
    this.getKey = deps.getKey;
    this.jwtOptions = deps.jwtOptions;
    this.invitationTtlMs = deps.invitationTtlMs ?? DEFAULT_INVITATION_TTL_MS;
    this.rateLimiter = new RateLimiter(DEFAULT_AUTH_RATE_LIMITS, deps.rateLimitStore);
  }

  private async checkRateLimit(namespace: AuthRateLimitNamespace, key: string) {
    const result = await this.rateLimiter.checkAndRecord(namespace, key);
    if (!result.allowed) {
      throw tooManyRequests("auth_rate_limited", "Too many requests.", result.retryAfterSeconds);
    }
  }

  // Fase 32 (ADR-0027 s9). `/auth/session` (`http/routes.ts`) chama isto ANTES de
  // `verifyToken` -- nunca dentro de `verifyToken` em si, que tambem e chamado por toda
  // requisicao autenticada via `SupabaseActorProvider.resolve()` (`http/actor-provider.ts`) e
  // nunca deveria carregar rate limiting de bridge de sessao. Chave: IP (nenhuma sessao/Actor
  // existe ainda neste ponto -- SPEC-028 s9/s13).
  async checkSessionBridgeRateLimit(ip: string): Promise<void> {
    await this.checkRateLimit("sessionBridge", ip || "unknown");
  }

  // Fase 32 (ADR-0027 s9). `/auth/refresh` chama isto ANTES de `refreshSession`, pela mesma
  // razao acima.
  async checkRefreshRateLimit(ip: string): Promise<void> {
    await this.checkRateLimit("refresh", ip || "unknown");
  }

  // ---------------------------------------------------------------------------------------
  // Resolucao de Actor (SPEC-028 s10/s12) -- consumida por http/actor-provider.ts. Le apenas,
  // nunca escreve; nao precisa de transacao.
  // ---------------------------------------------------------------------------------------
  async resolveActor(claims: VerifiedProviderClaims): Promise<Actor> {
    const identity = await this.auth.findAuthIdentityByExternalId("supabase", claims.externalId);
    if (!identity) {
      // INV-09: sessao valida do provider sem vinculo local nunca produz Actor -- so pode
      // ocorrer por inconsistencia operacional, ja que toda AuthIdentity nasce no aceite.
      throw forbidden("auth_identity_not_found", "No local identity for this session.");
    }

    const user = await this.core.findUserById(identity.userId);
    if (!user || user.status !== "active") {
      throw forbidden("user_inactive_or_missing", "Active user is required.");
    }

    const platformAdmin = await this.auth.findPlatformAdmin(user.id);
    if (platformAdmin && platformAdmin.status === "active") {
      return { kind: "platform", userId: user.id };
    }

    return { kind: "user", userId: user.id };
  }

  // Verificacao "fraca" reaproveitada pelo endpoint de aceite (SPEC-028 s10): mesma assinatura,
  // mesmo issuer/audience/exp, mas SEM exigir AuthIdentity existente -- usada apenas por
  // `acceptInvitation` abaixo, nunca por nenhuma rota de negocio comum.
  async verifyToken(rawToken: string): Promise<VerifiedProviderClaims> {
    return verifyProviderToken(rawToken, this.getKey, this.jwtOptions);
  }

  // ---------------------------------------------------------------------------------------
  // Convite -- SPEC-028 s15/s25/s26/s27.
  // ---------------------------------------------------------------------------------------
  async createInvitation(
    actor: Actor,
    organizationId: string,
    input: CreateInvitationInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = validateCreateInvitationInput(input);
    await this.checkRateLimit("invitationCreate", organizationId);
    await this.authorizeInviter(actor, organizationId, normalized.role);

    const existingUser = await this.core.findUserByEmail(normalized.email);
    let resolvedUserId: string | null = null;
    if (existingUser) {
      const existingIdentity = await this.auth.findAuthIdentityByUserId(existingUser.id);
      if (existingIdentity) {
        // SPEC-028 s15 passo 2, primeiro marcador: e-mail ja confirmado -- este fluxo nao se
        // aplica; o convidante deve usar o mecanismo ja existente de adicionar Membership
        // diretamente pelo userId conhecido.
        throw conflict(
          "invitation_email_already_confirmed",
          "This email already belongs to a confirmed account. Add the membership directly instead."
        );
      }
      // User interno sem AuthIdentity ainda (teste/legado) -- vinculado no aceite, nunca cria
      // um segundo User (SPEC-028 s7/s15).
      resolvedUserId = existingUser.id;
    }

    const result = await this.withIdempotency(
      organizationId,
      "invite",
      idempotencyKeyRaw,
      { operation: "invite", organizationId, email: normalized.email, role: normalized.role },
      actor,
      () =>
        this.runTransaction(async (tx) => {
          const pending = await tx.auth.findPendingInvitation(organizationId, normalized.email);
          if (pending) {
            throw conflict(
              "invitation_already_pending",
              "A pending invitation already exists for this email in this organization."
            );
          }

          const now = tx.auth.now();
          const invitation: Invitation = {
            id: tx.auth.nextId("inv"),
            organizationId,
            email: normalized.email,
            role: normalized.role,
            status: "pending",
            createdByUserId: requireUserActorId(actor),
            resolvedUserId,
            expiresAt: new Date(Date.parse(now) + this.invitationTtlMs).toISOString(),
            acceptedAt: null,
            acceptedByUserId: null,
            cancelledAt: null,
            cancelledByUserId: null,
            createdAt: now,
            updatedAt: now,
            // Convite normal (organizationId preenchido): nunca carrega dados pendentes de
            // bootstrap -- mesmo CHECK que impede o payload hibrido (0033).
            organizationName: null,
            organizationSlug: null,
            bootstrapOrganizationId: null
          };

          await tx.auth.createInvitation(invitation);
          await this.auditWith(tx.core, actor, organizationId, "auth.invitation_created", {
            invitationId: invitation.id,
            organizationId,
            role: invitation.role,
            createdByUserId: invitation.createdByUserId
          });
          return invitation;
        })
    );

    // SPEC-028 s27: regra de ordem -- a escrita local ja esta COMMITADA (fora da transacao
    // acima) antes desta chamada externa. Se falhar, o convite local permanece `pending`,
    // inofensivo: nunca foi enviado e-mail, reenvio e uma nova tentativa desta mesma chamada
    // (fora do escopo desta implementacao expor um endpoint de "reenviar" dedicado; o convite
    // pode ser cancelado e recriado enquanto isso nao existir).
    let providerNotified = true;
    if (!result.idempotentReplay) {
      try {
        await this.provider.inviteUserByEmail(normalized.email);
      } catch {
        providerNotified = false;
      }
    }

    return { ...result, providerNotified };
  }

  async listInvitations(actor: Actor, organizationId: string) {
    await this.authorizeReader(actor, organizationId);
    return this.auth.listInvitationsByOrganization(organizationId);
  }

  async cancelInvitation(actor: Actor, organizationId: string, invitationId: string) {
    await this.authorizeReader(actor, organizationId);
    return this.runTransaction(async (tx) => {
      const invitation = await tx.auth.findInvitationForUpdate(invitationId);
      if (!invitation || invitation.organizationId !== organizationId) {
        throw notFound("invitation_not_found", "Invitation not found.");
      }
      if (invitation.status === "cancelled") {
        return invitation; // idempotente
      }
      if (invitation.status !== "pending") {
        throw conflict("invitation_not_pending", "Only a pending invitation can be cancelled.");
      }

      const now = tx.auth.now();
      const cancelled: Invitation = {
        ...invitation,
        status: "cancelled",
        cancelledAt: now,
        cancelledByUserId: requireUserActorId(actor),
        updatedAt: now
      };
      await tx.auth.updateInvitation(cancelled);
      await this.auditWith(tx.core, actor, organizationId, "auth.invitation_cancelled", {
        invitationId: cancelled.id,
        cancelledByUserId: cancelled.cancelledByUserId ?? ""
      });
      return cancelled;
    });
  }

  // SPEC-028 s10/s15/s27: sem Actor previo -- verifica o token, materializa
  // User(novo|existente)+AuthIdentity+Membership numa unica transacao, idempotente por
  // natureza (chave: external_id + invitation.id).
  async acceptInvitation(rawAccessToken: string, invitationId: string) {
    await this.checkRateLimit("invitationAccept", invitationId);
    const claims = await this.verifyToken(rawAccessToken);
    if (!claims.emailVerified) {
      throw forbidden(
        "email_not_verified",
        "Email must be verified before accepting an invitation."
      );
    }

    const result = await this.runTransaction(async (tx) => {
      const invitation = await tx.auth.findInvitationForUpdate(invitationId);
      if (!invitation) {
        throw notFound("invitation_not_found", "Invitation not found.");
      }

      if (invitation.status === "accepted") {
        // Replay idempotente (SPEC-028 s26): reentrada sobre convite ja aceito retorna o mesmo
        // resultado, nunca duplica.
        const identity = await tx.auth.findAuthIdentityByExternalId("supabase", claims.externalId);
        if (!identity || identity.userId !== invitation.acceptedByUserId) {
          throw conflict("invitation_already_accepted", "Invitation was already accepted.");
        }
        // Bootstrap (organizationId sempre NULO, mesmo apos aceito -- 0032 proibe alterar essa
        // coluna) resolve a Organization via `bootstrapOrganizationId` (0033), preenchida na
        // mesma UPDATE que marcou o convite `accepted`.
        const organizationId = invitation.organizationId ?? invitation.bootstrapOrganizationId;
        const membership = organizationId
          ? await tx.core.findMembershipByOrganizationAndUser(organizationId, identity.userId)
          : null;
        return {
          outcome: "accepted" as const,
          userId: identity.userId,
          invitationId: invitation.id,
          membershipId: membership?.id ?? null,
          idempotentReplay: true
        };
      }

      if (invitation.status !== "pending") {
        throw conflict("invitation_not_acceptable", "Invitation is not pending.");
      }

      if (Date.parse(invitation.expiresAt) < Date.now()) {
        // A marcacao `expired` (e sua auditoria) precisa sobreviver mesmo quando este aceite e
        // recusado -- por isso NAO lanca aqui dentro: lancar dentro desta mesma transacao faria o
        // `runTransaction` dar ROLLBACK e desfazer exatamente a gravacao que queremos preservar.
        // O `conflict` real e lancado so depois que a transacao acima ja tiver COMMITado.
        const expired: Invitation = { ...invitation, status: "expired", updatedAt: tx.auth.now() };
        await tx.auth.updateInvitation(expired);
        await this.auditWith(
          tx.core,
          SYSTEM_ACTOR,
          invitation.organizationId,
          "auth.invitation_expired",
          {
            invitationId: invitation.id
          }
        );
        return { outcome: "expired" as const };
      }

      // Defesa em profundidade: o e-mail do token verificado deve corresponder ao convite --
      // protege contra uma sessao valida mas de outra identidade sendo usada sobre este
      // invitationId (o `id` do convite e opaco, mas nunca deve bastar sozinho).
      if (claims.email && normalizeEmail(claims.email) !== invitation.email) {
        throw forbidden(
          "invitation_identity_mismatch",
          "Session does not match the invited email."
        );
      }

      // SPEC-028 s15 "Organization archived antes do aceite": revalidacao dentro da propria
      // transacao, mesmo padrao ja fechado por AccessGrant (Fase 28).
      if (invitation.organizationId) {
        const organization = await tx.core.findOrganizationById(invitation.organizationId);
        if (!organization || organization.status !== "active") {
          throw forbidden(
            "organization_archived",
            "Archived organization cannot be used as context."
          );
        }
      }

      const coreService = new CoreService(tx.core);
      const existingIdentity = await tx.auth.findAuthIdentityByExternalId(
        "supabase",
        claims.externalId
      );
      let userId: string;

      if (existingIdentity) {
        const user = await tx.core.findUserById(existingIdentity.userId);
        if (!user || user.status !== "active") {
          throw forbidden("user_inactive_or_missing", "Active user is required.");
        }
        userId = user.id;
      } else if (invitation.resolvedUserId) {
        const user = await tx.core.findUserById(invitation.resolvedUserId);
        if (!user || user.status !== "active") {
          throw forbidden("user_inactive_or_missing", "Active user is required.");
        }
        userId = user.id;
        await this.materializeAuthIdentity(tx, userId, claims.externalId);
      } else {
        const created = await coreService.createUser(SYSTEM_ACTOR, {
          name: deriveNameFromEmail(invitation.email),
          email: invitation.email,
          status: "active"
        });
        userId = created.id;
        await this.materializeAuthIdentity(tx, userId, claims.externalId);
      }

      let membershipId: string;
      let bootstrapOrganizationId: string | null = null;
      let auditOrganizationId: string | null;

      if (invitation.organizationId === null) {
        // Bootstrap do primeiro tenant (SPEC-028 s16 passo 5; migration 0033). Organization +
        // primeiro Membership `owner` nascem juntos, na MESMA operacao atomica ja existente e
        // testada (`CoreService.createOrganization`, tests/phase1/*), com o `User` real (novo
        // ou `resolvedUserId`) como `initialOwnerUserId`. `organization_id` do convite continua
        // NULO para sempre (0032 proibe alteracao) -- `bootstrap_organization_id` (0033) e quem
        // registra qual Organization resultou deste convite, preenchido nesta MESMA UPDATE que
        // marca `accepted`, nunca antes.
        if (!invitation.organizationName || !invitation.organizationSlug) {
          // Defesa em profundidade: o CHECK fisico `invitations_bootstrap_pending_org_payload_
          // check` (0033) ja garante que todo convite de bootstrap carrega esses dois campos --
          // este branch nao deveria ser alcancavel. Nunca tratado como estado silenciosamente
          // valido.
          throw conflict(
            "bootstrap_invitation_missing_pending_organization_data",
            "Bootstrap invitation is missing pending organization data."
          );
        }
        const created = await coreService.createOrganization(SYSTEM_ACTOR, {
          name: invitation.organizationName,
          slug: invitation.organizationSlug,
          initialOwnerUserId: userId
        });
        membershipId = created.membership.id;
        bootstrapOrganizationId = created.organization.id;
        auditOrganizationId = created.organization.id;
      } else {
        const existingMembership = await tx.core.findMembershipByOrganizationAndUser(
          invitation.organizationId,
          userId
        );
        if (existingMembership) {
          membershipId = existingMembership.id;
        } else {
          const membership = await coreService.createMembership(SYSTEM_ACTOR, {
            organizationId: invitation.organizationId,
            userId,
            role: invitation.role
          });
          membershipId = membership.id;
        }
        auditOrganizationId = invitation.organizationId;
      }

      const now = tx.auth.now();
      const accepted: Invitation = {
        ...invitation,
        status: "accepted",
        resolvedUserId: invitation.resolvedUserId ?? userId,
        acceptedAt: now,
        acceptedByUserId: userId,
        bootstrapOrganizationId: bootstrapOrganizationId ?? invitation.bootstrapOrganizationId,
        updatedAt: now
      };
      await tx.auth.updateInvitation(accepted);
      await this.auditWith(tx.core, SYSTEM_ACTOR, auditOrganizationId, "auth.invitation_accepted", {
        invitationId: accepted.id,
        userId,
        membershipId
      });

      return {
        outcome: "accepted" as const,
        userId,
        invitationId: accepted.id,
        membershipId,
        idempotentReplay: false
      };
    });

    // Fora da transacao: se o convite estava vencido, a marcacao `expired` (e sua auditoria) ja
    // foi COMMITada acima -- so agora recusamos o aceite em si.
    if (result.outcome === "expired") {
      throw conflict("invitation_expired", "Invitation has expired.");
    }
    return {
      userId: result.userId,
      invitationId: result.invitationId,
      membershipId: result.membershipId,
      idempotentReplay: result.idempotentReplay
    };
  }

  private async materializeAuthIdentity(tx: AuthTransaction, userId: string, externalId: string) {
    const now = tx.auth.now();
    await tx.auth.createAuthIdentity({
      id: tx.auth.nextId("authid"),
      userId,
      provider: "supabase",
      externalId,
      createdAt: now,
      updatedAt: now
    });
  }

  // ---------------------------------------------------------------------------------------
  // Bootstrap do primeiro tenant -- SPEC-028 s16.
  // Caminho A (e-mail ja pertence a um User com AuthIdentity confirmada, SPEC-028 s16 passo 6):
  // identidade ja provada, Organization + primeiro owner nascem atomicamente, sem convite.
  // Caminho B (e-mail ainda nao confirmado -- User existente sem AuthIdentity, ou nenhum User,
  // SPEC-028 s16 passos 2-3; migration 0033): grava um convite de bootstrap com os dados
  // pendentes da Organization e chama `inviteUserByEmail`; a materializacao real (Organization +
  // primeiro owner) so ocorre no aceite (`acceptInvitation` acima), nunca aqui.
  // ---------------------------------------------------------------------------------------
  async bootstrapOrganization(
    actor: Actor,
    input: BootstrapOrganizationInput,
    idempotencyKeyRaw?: unknown
  ) {
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Only Platform Admin can bootstrap an Organization.");
    }
    await this.checkRateLimit("bootstrap", actor.userId ?? "unknown");
    const normalized = validateBootstrapInput(input);
    const existingUser = await this.core.findUserByEmail(normalized.ownerEmail);
    const existingIdentity = existingUser
      ? await this.auth.findAuthIdentityByUserId(existingUser.id)
      : null;

    if (existingUser && existingIdentity) {
      const coreService = new CoreService(this.core);
      const result = await coreService.createOrganization(actor, {
        name: normalized.organizationName,
        slug: normalized.organizationSlug,
        initialOwnerUserId: existingUser.id
      });
      await this.audit(actor, result.organization.id, "auth.bootstrap_organization_requested", {
        createdByUserId: actor.userId
      });
      return result;
    }

    // Caminho B. `created_by_user_id` (NOT NULL, referencia `users`) exige um Platform Admin
    // com `userId` resolvivel -- sempre verdadeiro em producao real (`resolveActor()` so retorna
    // `kind:"platform"` a partir de um `User` ja resolvido); so pode faltar num Actor sintetico
    // de desenvolvimento (`x-dev-platform-admin` sem `x-dev-user-id`), recusado aqui em vez de
    // propagar como erro de constraint do banco.
    if (!actor.userId) {
      throw forbidden("permission_denied", "Platform Admin must have a resolvable user id.");
    }
    const resolvedUserId = existingUser?.id ?? null;
    const createdByUserId = actor.userId;

    const result = await this.withIdempotency(
      null,
      "bootstrap",
      idempotencyKeyRaw,
      {
        operation: "bootstrap",
        organizationName: normalized.organizationName,
        organizationSlug: normalized.organizationSlug,
        ownerEmail: normalized.ownerEmail
      },
      actor,
      () =>
        this.runTransaction(async (tx) => {
          const pending = await tx.auth.findPendingInvitation(null, normalized.ownerEmail);
          if (pending) {
            throw conflict(
              "bootstrap_already_pending",
              "A pending bootstrap invitation already exists for this email."
            );
          }

          const now = tx.auth.now();
          const invitation: Invitation = {
            id: tx.auth.nextId("inv"),
            organizationId: null,
            email: normalized.ownerEmail,
            role: "owner",
            status: "pending",
            createdByUserId,
            resolvedUserId,
            expiresAt: new Date(Date.parse(now) + this.invitationTtlMs).toISOString(),
            acceptedAt: null,
            acceptedByUserId: null,
            cancelledAt: null,
            cancelledByUserId: null,
            createdAt: now,
            updatedAt: now,
            organizationName: normalized.organizationName,
            organizationSlug: normalized.organizationSlug,
            bootstrapOrganizationId: null
          };

          await tx.auth.createInvitation(invitation);
          await this.auditWith(tx.core, actor, null, "auth.bootstrap_organization_requested", {
            invitationId: invitation.id,
            createdByUserId
          });
          return invitation;
        })
    );

    // SPEC-028 s27: mesma regra de ordem ja aplicada por `createInvitation` -- a escrita local
    // ja esta COMMITADA antes desta chamada externa. Se falhar, o convite local permanece
    // `pending`, inofensivo (nunca foi enviado e-mail; reenvio e uma nova tentativa desta mesma
    // chamada).
    let providerNotified = true;
    if (!result.idempotentReplay) {
      try {
        await this.provider.inviteUserByEmail(normalized.ownerEmail);
      } catch {
        providerNotified = false;
      }
    }

    return { ...result, providerNotified };
  }

  // ---------------------------------------------------------------------------------------
  // Sessao -- SPEC-028 s9/s25. Sem escrita em `invitations`/`auth_identities`; apenas
  // orquestra o provider.
  // ---------------------------------------------------------------------------------------
  async refreshSession(refreshToken: string) {
    return this.provider.refreshSession(refreshToken);
  }

  // `actor` e deliberadamente nullable: revogar o refresh token no provider (a parte que
  // realmente importa para SPEC-028 s9, "invalida o refresh token") nunca deve depender de
  // Actor ser resolvivel -- um access token ja expirado, ou uma AuthIdentity removida por
  // inconsistencia operacional, ainda assim deve permitir invalidar o refresh token
  // apresentado. Achado corrigido nesta tarefa: a primeira versao acoplava as duas coisas (o
  // route handler so chamava este metodo se `actorProvider.resolve()` tivesse sucesso),
  // fazendo com que qualquer falha de resolucao de Actor silenciosamente pulasse a revogacao
  // no provider -- corrigido chamando este metodo com `actor: null` quando a resolucao falha
  // (ver `http/routes.ts`, rota `/auth/logout`).
  async logout(actor: Actor | null, refreshToken: string | null) {
    if (refreshToken) {
      try {
        await this.provider.revokeRefreshToken(refreshToken);
      } catch {
        // Logout local sempre limpa os cookies do lado do servidor independentemente do
        // provider responder -- SPEC-028 s9 trata a limpeza local como suficiente para a
        // sessao do navegador; a notificacao ao provider e defesa adicional, nao bloqueante.
      }
    }
    if (actor) {
      await this.audit(actor, null, "auth.logout", { userId: actor.userId });
    }
  }

  async revokeSessionForUser(actor: Actor, targetUserId: string, input: unknown) {
    const normalized = validateRevokeSessionInput((input ?? {}) as { reason?: unknown });
    const isSelf = actor.kind === "user" && actor.userId === targetUserId;
    if (!isSelf && actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    await this.checkRateLimit("sessionRevoke", targetUserId);
    const identity = await this.auth.findAuthIdentityByUserId(targetUserId);
    if (!identity) {
      throw notFound("auth_identity_not_found", "No identity for this user.");
    }
    await this.provider.signOutAllSessions(identity.externalId);
    await this.audit(actor, null, "auth.session_revoked", {
      userId: targetUserId,
      revokedByUserId: actor.userId,
      reason: normalized.reason
    });
  }

  // ---------------------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------------------

  // SPEC-028 s25: RBAC espelha exatamente a matriz ja existente de SPEC-004 para
  // `membership.create`/`membership.manage_owner` -- reaproveitada, nunca reimplementada.
  // Convite de `member` usa `membership.create`; convite de `admin` usa
  // `membership.manage_owner` (admin nunca cria convite de admin/owner, mesma restricao ja
  // aplicada a `CoreService.createMembership`).
  private async authorizeInviter(actor: Actor, organizationId: string, role: "admin" | "member") {
    const authorization = await authorize(this.core, {
      actor,
      organizationId,
      permission: role === "admin" ? "membership.manage_owner" : "membership.create"
    });
    if (authorization.role === "admin" && role !== "member") {
      throw forbidden("permission_denied", "Admin can only invite members.");
    }
    return authorization;
  }

  private async authorizeReader(actor: Actor, organizationId: string) {
    return authorize(this.core, { actor, organizationId, permission: "membership.read" });
  }

  private async withIdempotency<T extends { id?: string }>(
    organizationId: string | null,
    operation: InvitationIdempotencyOperation,
    rawKey: unknown,
    payload: Record<string, unknown>,
    actor: Actor,
    callback: () => Promise<T>
  ): Promise<T & { idempotentReplay?: boolean }> {
    const keyHash = createHash("sha256").update(validateIdempotencyKey(rawKey)).digest("hex");
    const requestFingerprint = fingerprint(payload);
    const begin = await this.auth.beginIdempotency({
      organizationId,
      operation,
      keyHash,
      requestFingerprint
    });

    if (!begin.created) {
      const existing = begin.idempotency;
      if (existing.requestFingerprint !== requestFingerprint) {
        throw conflict("auth_idempotency_conflict", "Idempotency-Key was used differently.");
      }
      if (existing.status === "pending") {
        throw conflict("auth_idempotency_in_progress", "Request is already being processed.");
      }
      if (existing.status === "failed") {
        throw conflict("auth_idempotency_failed", "Use a new Idempotency-Key to retry.");
      }
      const resource = existing.resultResourceId
        ? await this.auth.findInvitationById(existing.resultResourceId)
        : null;
      if (!resource) {
        throw conflict("auth_idempotency_result_unavailable", "Idempotent result is unavailable.");
      }
      return { ...(resource as unknown as T), idempotentReplay: true };
    }

    try {
      const result = await callback();
      await this.auth.markIdempotencyCompleted(begin.idempotency.id, String(result.id));
      return result;
    } catch (error) {
      await this.auth.markIdempotencyFailed(begin.idempotency.id, errorCode(error));
      throw error;
    }
  }

  private async audit(
    actor: Actor,
    organizationId: string | null,
    action: string,
    metadata: AuditEvent["metadata"] = {}
  ) {
    await this.auditWith(this.core, actor, organizationId, action, metadata);
  }

  private async auditWith(
    core: CoreRepository,
    actor: Actor,
    organizationId: string | null,
    action: string,
    metadata: AuditEvent["metadata"] = {}
  ) {
    await core.addAuditEvent({
      id: core.nextId("aud"),
      organizationId,
      actorUserId: actor.userId,
      action,
      result: "allowed",
      reason: null,
      metadata,
      createdAt: core.now()
    });
  }
}

export function createPostgresAuthService(
  pool: pg.Pool,
  deps: {
    provider: SupabaseAdminPort;
    getKey: JWTVerifyGetKey;
    jwtOptions: ProviderJwtVerifierOptions;
    // Fase 32 (ADR-0027 s9). Ausente = default in-memory (dev/test); `index.ts` passa
    // `new PostgresRateLimitStore(pool)`.
    rateLimitStore?: RateLimitStore;
  }
) {
  return new AuthService({
    core: new PostgresCoreRepository(pool),
    auth: new PostgresAuthRepository(pool),
    runTransaction: createAuthTransactionRunner(pool),
    provider: deps.provider,
    getKey: deps.getKey,
    jwtOptions: deps.jwtOptions,
    rateLimitStore: deps.rateLimitStore
  });
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }
  return actor.userId;
}

function deriveNameFromEmail(email: string) {
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._-]+/g, " ").trim() || email;
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "unexpected_error";
}
