import { createHash } from "node:crypto";
import type pg from "pg";
import { fingerprint } from "../core/canonical-hash";
import { conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import { CoreService } from "../core/service";
import type { Actor, AuditEvent, MembershipRole } from "../core/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresAccessGrantRepository } from "../persistence/postgres-access-grant-repository";
import type { AccessGrantRepository } from "./repository";
import {
  createAccessGrantTransactionRunner,
  type AccessGrantTransaction,
  type AccessGrantTransactionRunner
} from "./transaction";
import type {
  AccessGrant,
  AccessGrantAdminReadInput,
  AccessGrantCreateInput,
  AccessGrantIdempotencyOperation,
  AccessGrantRevokeInput
} from "./types";
import {
  validateAdminReason,
  validateCreateInput,
  validateIdempotencyKey,
  validateRevokeInput
} from "./validation";

type IdempotentResult<T> = T & { idempotentReplay?: boolean };

// Fase 28 (ADR-0025; SPEC-027 v1.0). `AccessGrant` e proveniencia/governanca sobre um
// `Membership` ja existente -- nunca uma segunda fonte de verdade de autorizacao. `Membership`
// continua sendo, sozinha, suficiente para `authorize()`; este service nunca e chamado por
// nenhuma rota/middleware de autenticacao.
//
// GATE CRITICO da Fase 28 (SPEC-027 s13/s29): `revoke` e a UNICA operacao deste dominio
// autorizada a mutar `Membership`, e faz isso por DELEGACAO explicita a
// `CoreService.updateMembership` (SPEC-003), nunca reimplementando RBAC, protecao do ultimo
// owner (RN-006) ou auditoria de `Membership`. A chamada usa `new CoreService(tx.core)`, onde
// `tx.core` e o `PostgresCoreRepository` com `inTransaction=true` do MESMO client fisico desta
// transacao -- a mutacao de `Membership` roda na mesma transacao real de `revoke`, sem nested
// transaction (ver `access-grants/transaction.ts`). Nenhuma outra operacao deste service chama
// `core.updateMembership`/`core.addUser`/qualquer outra mutacao de User/Membership.
export class AccessGrantService {
  constructor(
    private readonly core: CoreRepository,
    private readonly accessGrants: AccessGrantRepository,
    private readonly runTransaction: AccessGrantTransactionRunner
  ) {}

  async grant(
    actor: Actor,
    organizationId: string,
    input: AccessGrantCreateInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = validateCreateInput(input);
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "grant",
      normalized.membershipId,
      idempotencyKeyRaw,
      {
        operation: "grant",
        organizationPersonId: normalized.organizationPersonId,
        membershipId: normalized.membershipId,
        provenanceType: normalized.provenanceType,
        employmentId: normalized.employmentId
      },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const userId = requireUserActorId(actor);

          // SPEC-027 s24/s26: `authorizeUser` acima ja checou Organization ativa, mas isso
          // aconteceu ANTES desta transacao abrir (conexao propria, sem lock) -- uma
          // Organization pode arquivar entre esse check e este ponto. Revalidar aqui, como
          // primeira instrucao da transacao (READ COMMITTED le o estado ja commitado mais
          // recente), fecha essa janela: se o arquivamento confirmar primeiro, `grant` falha
          // aqui em vez de criar um `AccessGrant` para uma Organization ja arquivada.
          await service.requireActiveOrganization(organizationId);

          const membership = await tx.accessGrants.findMembershipForUpdate(normalized.membershipId);
          if (!membership || membership.organizationId !== organizationId) {
            await service.auditDenied(
              actor,
              organizationId,
              "access_grant.cross_organization_access_denied",
              "membership_organization_mismatch",
              { membershipId: normalized.membershipId }
            );
            throw notFound("membership_not_found", "Membership not found.");
          }
          if (membership.status !== "active") {
            throw conflict(
              "access_grant_membership_not_active",
              "Membership must be active to grant AccessGrant."
            );
          }

          const person = await tx.accessGrants.findOrganizationPersonForEligibility(
            normalized.organizationPersonId
          );
          if (!person || person.organizationId !== organizationId) {
            await service.auditDenied(
              actor,
              organizationId,
              "access_grant.cross_organization_access_denied",
              "organization_person_organization_mismatch",
              { organizationPersonId: normalized.organizationPersonId }
            );
            throw notFound("organization_person_not_found", "OrganizationPerson not found.");
          }

          if (normalized.employmentId) {
            const employment = await tx.accessGrants.findEmploymentForEligibility(
              normalized.employmentId
            );
            if (!employment || employment.organizationId !== organizationId) {
              await service.auditDenied(
                actor,
                organizationId,
                "access_grant.cross_organization_access_denied",
                "employment_organization_mismatch",
                { employmentId: normalized.employmentId }
              );
              throw notFound("employment_not_found", "Employment not found.");
            }
            if (employment.organizationPersonId !== normalized.organizationPersonId) {
              throw conflict(
                "access_grant_employment_person_mismatch",
                "Employment does not belong to the given OrganizationPerson."
              );
            }
            // SPEC-027 s8: somente `active`/`ended` sao elegiveis como proveniencia -- `pending`
            // nunca comecou operacionalmente, `cancelled` nunca chegou a existir
            // operacionalmente. Mesmo criterio ja fechado por SPEC-026 s8 para Offboarding.
            if (employment.status !== "active" && employment.status !== "ended") {
              throw conflict(
                "access_grant_employment_not_eligible",
                "Employment must be active or ended to be used as provenance."
              );
            }
          }

          // SPEC-027 s7: no maximo um AccessGrant `active` por Membership. Esta leitura previa
          // devolve um erro de negocio legivel; o indice parcial unico
          // (`idx_access_grants_one_active_per_membership`) e a defesa fisica final contra
          // corrida real (ver `access-grants/transaction.ts`).
          const existingActive = await tx.accessGrants.findActiveGrantForMembership(
            organizationId,
            normalized.membershipId
          );
          if (existingActive) {
            throw conflict(
              "access_grant_already_active",
              "An active AccessGrant already exists for this Membership."
            );
          }

          const now = tx.accessGrants.now();
          const accessGrant: AccessGrant = {
            id: tx.accessGrants.nextId("agrant"),
            organizationId,
            organizationPersonId: normalized.organizationPersonId,
            membershipId: normalized.membershipId,
            employmentId: normalized.employmentId,
            provenanceType: normalized.provenanceType,
            grantReason: normalized.grantReason,
            status: "active",
            createdByUserId: userId,
            createdAt: now,
            updatedAt: now,
            revokedAt: null,
            revokedByUserId: null,
            revocationReasonCategory: null
          };
          await tx.accessGrants.createAccessGrant(accessGrant);
          await service.audit(actor, organizationId, "access_grant.created", {
            accessGrantId: accessGrant.id,
            organizationPersonId: accessGrant.organizationPersonId,
            membershipId: accessGrant.membershipId,
            provenanceType: accessGrant.provenanceType
          });
          return serialize(accessGrant);
        })
    );
  }

  async revoke(
    actor: Actor,
    organizationId: string,
    accessGrantId: string,
    input: AccessGrantRevokeInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = validateRevokeInput(input);
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "revoke",
      accessGrantId,
      idempotencyKeyRaw,
      {
        operation: "revoke",
        accessGrantId,
        revocationReasonCategory: normalized.revocationReasonCategory
      },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const userId = requireUserActorId(actor);

          // SPEC-027 s24/s26: mesma revalidacao de `grant` -- fecha a janela entre o check de
          // `authorizeUser` (fora da transacao) e esta transacao. No caminho em que
          // `Membership` ja esta `inactive` (linha ~247), `CoreService.updateMembership` nunca
          // e chamado e portanto nunca revalidaria a Organization por delegacao -- este check
          // explicito cobre exatamente esse caso.
          await service.requireActiveOrganization(organizationId);

          // Trava a linha de AccessGrant primeiro. Nota de correcao (Fase 28, gate de
          // concorrencia): esta ordem diverge do texto conceitual de SPEC-027 s27 ("travar
          // Membership antes de AccessGrant"), que nao antecipava que travar Membership
          // diretamente ANTES da propria delegacao a `CoreService.updateMembership` (que ja
          // trava Membership organization-wide por conta propria) criaria uma segunda superficie
          // de deadlock contra chamadas concorrentes e independentes ao Core (ver o achado
          // documentado abaixo, no lookup de Membership). Nenhum outro dominio deste projeto
          // trava linhas de `access_grants`, entao travar esta linha primeiro nao introduz
          // nenhum ciclo novo -- e a ordem que sobrevive fisicamente ao gate de concorrencia.
          // Revisao textual de SPEC-027 s27 fica para tarefa normativa propria (fora do escopo
          // desta tarefa, que so pode alterar codigo/migration/testes).
          const accessGrant = await tx.accessGrants.findAccessGrantForUpdate(accessGrantId);
          if (!accessGrant || accessGrant.organizationId !== organizationId) {
            await service.auditDenied(
              actor,
              organizationId,
              "access_grant.cross_organization_access_denied",
              "access_grant_organization_mismatch",
              { accessGrantId }
            );
            throw notFound("access_grant_not_found", "AccessGrant not found.");
          }
          if (accessGrant.status !== "active") {
            throw conflict("access_grant_not_active", "AccessGrant is not active.");
          }

          // Leitura NAO travada (`tx.core.findMembershipById`, nao
          // `tx.accessGrants.findMembershipForUpdate`) -- deliberado. Achado de concorrencia
          // real (Fase 28, gate de concorrencia): travar esta linha aqui, ANTES de
          // `CoreService.updateMembership` tambem travar (org-wide,
          // `lockMembershipsByOrganization`) mais abaixo na MESMA transacao, produzia um
          // deadlock genuino e reproduzivel (40P01) contra uma chamada CONCORRENTE e
          // INDEPENDENTE de `CoreService.updateMembership` (por exemplo, `PATCH
          // /memberships/:id` direto) -- as duas transacoes acabavam travando linhas da mesma
          // tabela em ordens cruzadas. `CoreService.updateMembership`, chamado logo abaixo,
          // ja revalida e trava a linha da forma canonica (RN-006 exige o lock org-wide de
          // qualquer forma); repetir o lock aqui so duplicava a superficie de deadlock, sem
          // nenhum ganho de correcao. Se esta leitura nao travada estiver desatualizada no
          // instante em que `CoreService.updateMembership` adquire seu proprio lock (corrida
          // rara), o pior caso e uma chamada redundante ao Core sobre uma Membership ja
          // `inactive` -- mesma categoria de nao-invariante ja aceita e documentada para
          // `revoke x Membership deactivate direta`, nunca um estado corrompido.
          const membership = await tx.core.findMembershipById(accessGrant.membershipId);
          if (!membership || membership.organizationId !== organizationId) {
            throw notFound("membership_not_found", "Membership not found.");
          }

          // SPEC-027 s13, passo 3/4: delega a `CoreService.updateMembership` SOMENTE se ainda
          // ha mutacao real a fazer. Se `Membership` ja estiver `inactive` por outro caminho,
          // chamar `updateMembership` mesmo assim produziria um `membership.deactivated`
          // espurio na trilha de auditoria de outro dominio -- nunca chamado neste caso.
          //
          // SPEC-027 s14: se `CoreService` recusar (por exemplo, ultimo owner ativo), a
          // excecao propaga sem tratamento local -- o runner faz ROLLBACK integral (AccessGrant
          // permanece `active`, Membership permanece inalterada) e o `.catch` externo deste
          // metodo audita `access_grant.conflict` fora da transacao ja abortada. `CoreService`
          // ja audita sua propria negacao (`membership.last_owner_change_denied`) dentro da
          // mesma transacao, preservada inalterada.
          if (membership.status === "active") {
            const coreService = new CoreService(tx.core);
            await coreService.updateMembership(actor, membership.id, { status: "inactive" });
          }

          const now = tx.accessGrants.now();
          const revoked: AccessGrant = {
            ...accessGrant,
            status: "revoked",
            updatedAt: now,
            revokedAt: now,
            revokedByUserId: userId,
            revocationReasonCategory: normalized.revocationReasonCategory
          };
          await tx.accessGrants.updateAccessGrant(revoked);
          await service.audit(actor, organizationId, "access_grant.revoked", {
            accessGrantId: revoked.id,
            membershipId: revoked.membershipId,
            revocationReasonCategory: revoked.revocationReasonCategory ?? ""
          });
          return serialize(revoked);
        })
    ).catch(async (error) => {
      // SPEC-027 s14/s28: eventos de negacao/conflito precisam sobreviver ao ROLLBACK ja
      // ocorrido -- auditados FORA da transacao abortada, usando `this.core`/`this.accessGrants`
      // (conexao nao-transacional), nunca uma instancia `scoped(tx)`. Mesmo padrao ja comprovado
      // em `offboardings/service.ts`.
      if (errorCode(error) === "last_owner_required") {
        await this.audit(actor, organizationId, "access_grant.conflict", {
          accessGrantId,
          reason: "last_owner_protected"
        });
      }
      throw error;
    });
  }

  async get(actor: Actor, organizationId: string, accessGrantId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"], true);
    const accessGrant = await this.findAccessGrantInOrganization(
      actor,
      organizationId,
      accessGrantId
    );
    return serialize(accessGrant);
  }

  async list(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"], true);
    return (await this.accessGrants.listAccessGrantsByOrganization(organizationId)).map(serialize);
  }

  async listByPerson(actor: Actor, organizationId: string, organizationPersonId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"], true);
    return (
      await this.accessGrants.listAccessGrantsByPerson(organizationId, organizationPersonId)
    ).map(serialize);
  }

  async listByMembership(actor: Actor, organizationId: string, membershipId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"], true);
    return (await this.accessGrants.listAccessGrantsByMembership(organizationId, membershipId)).map(
      serialize
    );
  }

  async listByEmployment(actor: Actor, organizationId: string, employmentId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"], true);
    return (await this.accessGrants.listAccessGrantsByEmployment(organizationId, employmentId)).map(
      serialize
    );
  }

  async adminRead(actor: Actor, organizationId: string, input: AccessGrantAdminReadInput) {
    const reason = validateAdminReason(input);
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) throw notFound("organization_not_found", "Organization not found.");
    const accessGrants = await this.accessGrants.listAccessGrantsByOrganization(organizationId);
    await this.audit(actor, organizationId, "access_grant.administrative_read", {
      reason,
      accessGrantCount: String(accessGrants.length)
    });
    // Leitura administrativa minimizada (mesmo padrao de `OffboardingService.adminRead`): exclui
    // `grantReason`/`revocationReasonCategory` -- texto/motivo administrativo nao e necessario
    // para o proposito de auditoria de governanca do Platform Admin.
    return accessGrants.map((accessGrant) => ({
      id: accessGrant.id,
      organizationId: accessGrant.organizationId,
      organizationPersonId: accessGrant.organizationPersonId,
      membershipId: accessGrant.membershipId,
      employmentId: accessGrant.employmentId,
      provenanceType: accessGrant.provenanceType,
      status: accessGrant.status,
      createdAt: accessGrant.createdAt,
      updatedAt: accessGrant.updatedAt
    }));
  }

  // SPEC-027 s24/s26. Chamado como primeira instrucao dentro da transacao de `grant`/`revoke`
  // (nunca fora dela) -- ver os dois pontos de chamada para o raciocinio completo de janela de
  // corrida com `Organization.archive`.
  private async requireActiveOrganization(organizationId: string) {
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization || organization.status !== "active") {
      throw forbidden("organization_archived", "Archived organization cannot be used as context.");
    }
  }

  private async findAccessGrantInOrganization(
    actor: Actor,
    organizationId: string,
    accessGrantId: string
  ) {
    const accessGrant = await this.accessGrants.findAccessGrantById(accessGrantId);
    if (!accessGrant || accessGrant.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "access_grant.cross_organization_access_denied",
        "access_grant_organization_mismatch",
        { accessGrantId }
      );
      throw notFound("access_grant_not_found", "AccessGrant not found.");
    }
    return accessGrant;
  }

  private async withIdempotency<T extends { id?: string }>(
    organizationId: string,
    operation: AccessGrantIdempotencyOperation,
    scopeId: string | null,
    rawKey: unknown,
    payload: Record<string, unknown>,
    actor: Actor,
    callback: () => Promise<T>
  ): Promise<IdempotentResult<T>> {
    const keyHash = createHash("sha256").update(validateIdempotencyKey(rawKey)).digest("hex");
    const requestFingerprint = fingerprint(payload);
    const begin = await this.accessGrants.beginIdempotency({
      organizationId,
      operation,
      scopeId,
      keyHash,
      requestFingerprint
    });
    if (!begin.created) {
      const existing = begin.idempotency;
      if (existing.requestFingerprint !== requestFingerprint) {
        await this.auditDenied(
          actor,
          organizationId,
          "access_grant.conflict",
          "idempotency_fingerprint_conflict"
        );
        throw conflict(
          "access_grant_idempotency_conflict",
          "Idempotency-Key was used differently."
        );
      }
      if (existing.status === "pending") {
        throw conflict(
          "access_grant_idempotency_in_progress",
          "Request is already being processed."
        );
      }
      if (existing.status === "failed") {
        throw conflict("access_grant_idempotency_failed", "Use a new Idempotency-Key to retry.");
      }
      const resource = existing.resultResourceId
        ? await this.resourceByOperation(operation, existing.resultResourceId)
        : null;
      if (!resource) {
        throw conflict(
          "access_grant_idempotency_result_unavailable",
          "Idempotent result is unavailable."
        );
      }
      return { ...(resource as unknown as T), idempotentReplay: true };
    }
    try {
      const result = await callback();
      await this.accessGrants.markIdempotencyCompleted(begin.idempotency.id, String(result.id));
      return result;
    } catch (error) {
      await this.accessGrants.markIdempotencyFailed(begin.idempotency.id, errorCode(error));
      if (errorCode(error) === "access_grant_concurrent_change") {
        await this.auditDenied(
          actor,
          organizationId,
          "access_grant.conflict",
          "concurrent_operation_conflict"
        );
      }
      throw error;
    }
  }

  private async resourceByOperation(
    operation: AccessGrantIdempotencyOperation,
    resourceId: string
  ) {
    const accessGrant = await this.accessGrants.findAccessGrantById(resourceId);
    return accessGrant ? serialize(accessGrant) : null;
  }

  private scoped(tx: AccessGrantTransaction) {
    return new AccessGrantService(tx.core, tx.accessGrants, this.runTransaction);
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[],
    allowArchivedRead = false
  ) {
    if (actor.kind === "platform") {
      await this.auditDenied(
        actor,
        organizationId,
        "access_grant.permission_denied",
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }
    const user = await this.core.findUserById(actor.userId);
    if (!user || user.status !== "active") {
      throw forbidden("user_inactive_or_missing", "Active user is required.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) throw notFound("organization_not_found", "Organization not found.");
    if (organization.status !== "active" && !allowArchivedRead) {
      await this.auditDenied(
        actor,
        organizationId,
        "access_grant.permission_denied",
        "organization_archived"
      );
      throw forbidden("organization_archived", "Archived organization cannot be used as context.");
    }
    const membership = await this.core.findMembershipByOrganizationAndUser(
      organizationId,
      actor.userId
    );
    if (!membership || membership.status !== "active") {
      await this.auditDenied(
        actor,
        organizationId,
        "access_grant.cross_organization_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }
    if (!allowedRoles.includes(membership.role)) {
      await this.auditDenied(
        actor,
        organizationId,
        "access_grant.permission_denied",
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }
    return { role: membership.role, membership };
  }

  private async audit(
    actor: Actor,
    organizationId: string | null,
    action: string,
    metadata: AuditEvent["metadata"] = {}
  ) {
    await this.core.addAuditEvent({
      id: this.core.nextId("aud"),
      organizationId,
      actorUserId: actor.userId,
      action,
      result: "allowed",
      reason: null,
      metadata,
      createdAt: this.core.now()
    });
  }

  private async auditDenied(
    actor: Actor,
    organizationId: string | null,
    action: string,
    reason: string,
    metadata: AuditEvent["metadata"] = {}
  ) {
    await this.core.addAuditEvent({
      id: this.core.nextId("aud"),
      organizationId,
      actorUserId: actor.userId,
      action,
      result: "denied",
      reason,
      metadata,
      createdAt: this.core.now()
    });
  }
}

export function createPostgresAccessGrantService(pool: pg.Pool) {
  return new AccessGrantService(
    new PostgresCoreRepository(pool),
    new PostgresAccessGrantRepository(pool),
    createAccessGrantTransactionRunner(pool)
  );
}

function serialize(accessGrant: AccessGrant) {
  return accessGrant;
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }
  return actor.userId;
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "unexpected_error";
}
