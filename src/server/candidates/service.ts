import type pg from "pg";
import { badRequest, conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, MembershipRole } from "../core/types";
import { PostgresCandidateRepository } from "../persistence/postgres-candidate-repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import type { CandidateRepository } from "./repository";
import type {
  Candidate,
  CandidateAdminReadInput,
  CandidateConsent,
  CandidateConsentInput,
  CandidateInput,
  CandidateInternalNote,
  CandidatePatchInput
} from "./types";
import {
  normalizeCandidateEmail,
  requireAdminReason,
  validateConsentInput,
  validateCreateCandidate,
  validateCreateCandidateWithoutConsent,
  validateEmail,
  validateInternalNote,
  validateUpdateCandidate
} from "./validation";

// Exportado para que o orquestrador da candidatura publica (Fase 17,
// `src/server/public-applications/service.ts`) possa abrir sua PROPRIA transacao (um unico
// `PoolClient` cobrindo Candidate + CandidateConsent + CandidateApplication, SPEC-020 v1.1,
// secao 12) e passar o mesmo par `{core, candidates}` para os metodos publicos abaixo, em vez
// de cada modulo abrir sua propria transacao isolada.
export type CandidateTransaction = {
  core: CoreRepository;
  candidates: CandidateRepository;
};

type CandidateTransactionRunner = <T>(
  callback: (transaction: CandidateTransaction) => Promise<T>
) => Promise<T>;

export class CandidateService {
  constructor(
    private readonly core: CoreRepository,
    private readonly candidates: CandidateRepository,
    private readonly runTransaction: CandidateTransactionRunner
  ) {}

  async createCandidate(actor: Actor, organizationId: string, input: CandidateInput) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      service.ensureNoOrganizationChange(organizationId, input.organizationId);
      service.ensureNoProtectedAssignment(input, ["email", "consent"]);
      const normalized = validateCreateCandidate(input);
      await transaction.candidates.lockCandidates(organizationId);
      await service.ensureEmailAvailable(organizationId, normalized.normalizedEmail, null);
      const now = transaction.candidates.now();
      const userId = requireUserActorId(actor);
      const candidate: Candidate = {
        id: transaction.candidates.nextId("cand"),
        organizationId,
        fullName: normalized.fullName,
        preferredName: normalized.preferredName,
        email: normalized.email,
        normalizedEmail: normalized.normalizedEmail,
        phone: normalized.phone,
        secondaryPhone: normalized.secondaryPhone,
        status: "active",
        source: normalized.source,
        sourceDetails: normalized.sourceDetails,
        professionalSummary: normalized.professionalSummary,
        location: normalized.location,
        experiences: normalized.experiences,
        education: normalized.education,
        certifications: normalized.certifications,
        languages: normalized.languages,
        professionalLinks: normalized.professionalLinks,
        declaredCompetencies: normalized.declaredCompetencies,
        availability: normalized.availability,
        workAuthorization: normalized.workAuthorization,
        salaryExpectation: normalized.salaryExpectation,
        creationOrigin: "internal_user",
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now,
        inactivatedAt: null
      };
      const consent = toConsent(
        transaction.candidates,
        organizationId,
        candidate.id,
        userId,
        normalized.consent,
        now
      );
      try {
        await transaction.candidates.createCandidate(candidate);
        await transaction.candidates.addConsent(consent);
      } catch (error) {
        if (isUniqueViolation(error, "candidates_organization_id_normalized_email_key")) {
          throw conflict("candidate_email_duplicate", "Candidate email exists.");
        }
        throw error;
      }
      await service.audit(actor, organizationId, "candidate.created", {
        candidateId: candidate.id,
        creationOrigin: candidate.creationOrigin
      });
      return service.serializeOwnerAdmin(candidate);
    });
  }

  // Criacao publica (SPEC-011 v1.2, secao 6.1.2; SPEC-020 v1.1) -- sem Actor, sem Membership.
  // Chamada exclusivamente pelo orquestrador `PublicApplicationService`, dentro de uma
  // transacao ja aberta por ele (`transaction`). Reutiliza a mesma validacao de negocio do
  // fluxo interno (`validateCreateCandidateWithoutConsent`) e o mesmo indice de unicidade de
  // e-mail por Organization -- a unica diferenca e a ausencia de autorizacao de User e a
  // origem de criacao resultante. Nunca escreve auditoria (responsabilidade do orquestrador,
  // que possui o contexto completo de Vaga/Organization exigido pela SPEC-020, secao 24).
  // Retorna `created: false` quando uma submissao concorrente ja havia inserido o mesmo
  // e-mail primeiro -- nesse caso, `candidate` e o registro vencedor real (relido dentro da
  // MESMA transacao, que permanece utilizavel porque `createCandidateIfAbsent` nunca lanca
  // 23505 -- revisao destrutiva, item 15). O chamador nunca precisa capturar
  // `candidate_email_duplicate` para este caminho.
  async createCandidateFromPublicApplication(
    transaction: CandidateTransaction,
    organizationId: string,
    input: CandidateInput
  ): Promise<{ candidate: Candidate; created: boolean }> {
    this.ensureNoProtectedAssignment(input, ["email"]);
    const normalized = validateCreateCandidateWithoutConsent(input);
    const now = transaction.candidates.now();
    const candidate: Candidate = {
      id: transaction.candidates.nextId("cand"),
      organizationId,
      fullName: normalized.fullName,
      preferredName: normalized.preferredName,
      email: normalized.email,
      normalizedEmail: normalized.normalizedEmail,
      phone: normalized.phone,
      secondaryPhone: normalized.secondaryPhone,
      status: "active",
      source: normalized.source,
      sourceDetails: normalized.sourceDetails,
      professionalSummary: normalized.professionalSummary,
      location: normalized.location,
      experiences: normalized.experiences,
      education: normalized.education,
      certifications: normalized.certifications,
      languages: normalized.languages,
      professionalLinks: normalized.professionalLinks,
      declaredCompetencies: normalized.declaredCompetencies,
      availability: normalized.availability,
      workAuthorization: normalized.workAuthorization,
      salaryExpectation: normalized.salaryExpectation,
      creationOrigin: "public_application",
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now,
      inactivatedAt: null
    };
    const created = await transaction.candidates.createCandidateIfAbsent(candidate);
    if (created) {
      return { candidate, created: true };
    }
    const winner = await transaction.candidates.findCandidateByNormalizedEmail(
      organizationId,
      normalized.normalizedEmail
    );
    if (!winner) {
      // Estado pratica e teoricamente inalcancavel (o INSERT so nao insere quando o conflito
      // ja existe), mas nunca inventa um Candidate nem falha silenciosamente.
      throw conflict("candidate_email_duplicate", "Candidate email exists.");
    }
    return { candidate: winner, created: false };
  }

  // Consentimento manifestado diretamente pelo visitante no fluxo publico (SPEC-011 v1.2,
  // secao 8.14.1, RN-061 a RN-065). Reutiliza o mesmo campo `source` e o mesmo
  // `validateConsentInput` do fluxo interno -- a unica diferenca e `created_by_user_id` nulo,
  // coerente com `source = public_application`.
  async addPublicConsent(
    transaction: CandidateTransaction,
    organizationId: string,
    candidateId: string,
    input: CandidateConsentInput
  ): Promise<CandidateConsent> {
    const now = transaction.candidates.now();
    const consent = toConsent(
      transaction.candidates,
      organizationId,
      candidateId,
      null,
      // Unico chamador autorizado a fornecer `source = public_application` -- `input` aqui e
      // sempre construido pelo servidor (`PublicApplicationService`), nunca o body bruto do
      // cliente (correcao pontual, revisao final).
      validateConsentInput(input, { allowPublicOrigin: true }),
      now
    );
    await transaction.candidates.addConsent(consent);
    return consent;
  }

  async listActive(actor: Actor, organizationId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const candidates = await this.candidates.listCandidates(organizationId, ["active"]);
    return candidates.map((candidate) =>
      context.role === "member"
        ? this.serializeMember(candidate)
        : this.serializeOwnerAdmin(candidate)
    );
  }

  async listInactive(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return (await this.candidates.listCandidates(organizationId, ["inactive"])).map((candidate) =>
      this.serializeOwnerAdmin(candidate)
    );
  }

  async getCandidate(actor: Actor, organizationId: string, candidateId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const candidate = await this.findCandidateInOrganization(actor, organizationId, candidateId);
    if (context.role === "member" && candidate.status !== "active") {
      throw notFound("candidate_not_found", "Candidate not found.");
    }
    return context.role === "member"
      ? this.serializeMember(candidate)
      : this.serializeOwnerAdmin(candidate, {
          consents: await this.candidates.listConsents(candidateId),
          internalNotes: await this.candidates.listInternalNotes(candidateId),
          operationalConsent: await this.candidates.latestOperationalConsent(candidateId)
        });
  }

  async updateCandidate(
    actor: Actor,
    organizationId: string,
    candidateId: string,
    input: CandidatePatchInput
  ) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      service.ensureNoOrganizationChange(organizationId, input.organizationId);
      service.ensureNoProtectedAssignment(input, []);
      const candidate = await service.findCandidateInOrganization(
        actor,
        organizationId,
        candidateId
      );
      const patch = validateUpdateCandidate(input);
      const updated: Candidate = {
        ...candidate,
        ...definedPatch(patch),
        updatedByUserId: requireUserActorId(actor),
        updatedAt: transaction.candidates.now()
      };
      await transaction.candidates.updateCandidate(updated);
      await service.audit(actor, organizationId, "candidate.updated", { candidateId });
      return service.serializeOwnerAdmin(updated);
    });
  }

  async changeEmail(actor: Actor, organizationId: string, candidateId: string, input: unknown) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const entry = normalizeInputObject(input);
      service.ensureNoOrganizationChange(
        organizationId,
        entry.organizationId as string | undefined
      );
      service.ensureNoProtectedAssignment(entry, ["email"]);
      const email = validateEmail(entry.email);
      const normalizedEmail = normalizeCandidateEmail(email);
      await transaction.candidates.lockCandidates(organizationId);
      const candidate = await service.findCandidateInOrganization(
        actor,
        organizationId,
        candidateId
      );
      await service.ensureEmailAvailable(organizationId, normalizedEmail, candidateId);
      const updated = {
        ...candidate,
        email,
        normalizedEmail,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: transaction.candidates.now()
      };
      await transaction.candidates.updateCandidate(updated);
      await service.audit(actor, organizationId, "candidate.email_changed", { candidateId });
      return service.serializeOwnerAdmin(updated);
    });
  }

  async setStatus(
    actor: Actor,
    organizationId: string,
    candidateId: string,
    status: Candidate["status"]
  ) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const candidate = await service.findCandidateInOrganization(
        actor,
        organizationId,
        candidateId
      );
      const now = transaction.candidates.now();
      const updated = {
        ...candidate,
        status,
        inactivatedAt: status === "inactive" ? now : null,
        updatedAt: now,
        updatedByUserId: requireUserActorId(actor)
      };
      await transaction.candidates.updateCandidate(updated);
      await service.audit(actor, organizationId, "candidate.status_changed", { candidateId });
      await service.audit(
        actor,
        organizationId,
        status === "inactive" ? "candidate.inactivated" : "candidate.reactivated",
        { candidateId }
      );
      return service.serializeOwnerAdmin(updated);
    });
  }

  async addConsent(
    actor: Actor,
    organizationId: string,
    candidateId: string,
    input: CandidateConsentInput
  ) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await service.findCandidateInOrganization(actor, organizationId, candidateId);
      const now = transaction.candidates.now();
      const consent = toConsent(
        transaction.candidates,
        organizationId,
        candidateId,
        requireUserActorId(actor),
        validateConsentInput(input),
        now
      );
      await transaction.candidates.addConsent(consent);
      await service.audit(actor, organizationId, "candidate.consent_changed", {
        candidateId,
        consentStatus: consent.status
      });
      return consent;
    });
  }

  async revokeConsent(actor: Actor, organizationId: string, candidateId: string) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await service.findCandidateInOrganization(actor, organizationId, candidateId);
      const now = transaction.candidates.now();
      const consent = toConsent(
        transaction.candidates,
        organizationId,
        candidateId,
        requireUserActorId(actor),
        validateConsentInput({
          status: "revoked",
          consentAt: now,
          source: "manual",
          termsVersion: "revocation",
          purpose: "Revocation"
        }),
        now
      );
      await transaction.candidates.addConsent(consent);
      await service.audit(actor, organizationId, "candidate.consent_changed", {
        candidateId,
        consentStatus: consent.status
      });
      await service.audit(actor, organizationId, "candidate.consent_revoked", { candidateId });
      return consent;
    });
  }

  async addInternalNote(actor: Actor, organizationId: string, candidateId: string, input: unknown) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await service.findCandidateInOrganization(actor, organizationId, candidateId);
      const entry = normalizeInputObject(input);
      const now = transaction.candidates.now();
      const note: CandidateInternalNote = {
        id: transaction.candidates.nextId("cnot"),
        organizationId,
        candidateId,
        content: validateInternalNote(entry.content),
        createdByUserId: requireUserActorId(actor),
        updatedByUserId: requireUserActorId(actor),
        createdAt: now,
        updatedAt: now
      };
      await transaction.candidates.addInternalNote(note);
      await service.audit(actor, organizationId, "candidate.updated", {
        candidateId,
        internalNoteId: note.id
      });
      return note;
    });
  }

  async history(actor: Actor, organizationId: string, candidateId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    await this.findCandidateInOrganization(actor, organizationId, candidateId);
    return (await this.core.listAuditEvents()).filter(
      (event) =>
        event.organizationId === organizationId && event.metadata.candidateId === candidateId
    );
  }

  async adminRead(actor: Actor, organizationId: string, input: CandidateAdminReadInput) {
    const reason = requireAdminReason(input.reason);
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }
    const candidates = await this.candidates.listCandidates(organizationId, ["active", "inactive"]);
    await this.audit(actor, organizationId, "candidate.administrative_read", {
      reason,
      candidateCount: String(candidates.length)
    });
    return candidates.map((candidate) => this.serializeAdministrative(candidate));
  }

  async ensureOperationalUseAllowed(actor: Actor, organizationId: string, candidateId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const candidate = await this.findCandidateInOrganization(actor, organizationId, candidateId);
    if (candidate.status !== "active") {
      throw conflict("candidate_inactive", "Inactive candidate cannot be used operationally.");
    }
    const consent = await this.candidates.latestOperationalConsent(candidateId);
    if (!consent || consent.status !== "granted") {
      throw conflict("candidate_consent_invalid", "Candidate consent blocks operational use.");
    }
    if (consent.expiresAt && new Date(consent.expiresAt).getTime() <= Date.now()) {
      throw conflict("candidate_consent_expired", "Candidate consent blocks operational use.");
    }
  }

  private scoped(transaction: CandidateTransaction) {
    return new CandidateService(transaction.core, transaction.candidates, this.runTransaction);
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[],
    deniedAction = "candidate.permission_denied"
  ) {
    if (actor.kind === "platform") {
      await this.auditDenied(actor, organizationId, deniedAction, "permission_denied");
      throw forbidden("permission_denied", "Permission denied.");
    }
    const user = await this.core.findUserById(actor.userId);
    if (!user || user.status !== "active") {
      throw forbidden("user_inactive_or_missing", "Active user is required.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }
    if (organization.status !== "active") {
      await this.auditDenied(actor, organizationId, deniedAction, "organization_archived");
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
        "candidate.cross_organization_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }
    if (!allowedRoles.includes(membership.role)) {
      await this.auditDenied(actor, organizationId, deniedAction, "permission_denied");
      throw forbidden("permission_denied", "Permission denied.");
    }
    return { actor, organization, role: membership.role };
  }

  private ensureNoOrganizationChange(
    organizationId: string,
    inputOrganizationId: string | undefined
  ) {
    if (inputOrganizationId !== undefined && inputOrganizationId !== organizationId) {
      throw badRequest("candidate_organization_immutable", "Candidate cannot change Organization.");
    }
  }

  private ensureNoProtectedAssignment(input: unknown, allowedKeys: string[]) {
    const entry = normalizeInputObject(input);
    const allowed = new Set(allowedKeys);
    const protectedKeys = [
      "id",
      "organization_id",
      "status",
      "email",
      "consent",
      "internalNote",
      "internal_note",
      "creationOrigin",
      "creation_origin",
      "createdByUserId",
      "created_by_user_id",
      "updatedByUserId",
      "updated_by_user_id",
      "createdAt",
      "created_at",
      "updatedAt",
      "updated_at",
      "inactivatedAt",
      "inactivated_at"
    ];
    for (const key of protectedKeys) {
      if (!allowed.has(key) && entry[key] !== undefined) {
        throw badRequest(
          "candidate_mass_assignment_denied",
          "Candidate protected fields cannot be assigned by client."
        );
      }
    }
  }

  private async ensureEmailAvailable(
    organizationId: string,
    normalizedEmail: string,
    currentId: string | null
  ) {
    const existing = await this.candidates.findCandidateByNormalizedEmail(
      organizationId,
      normalizedEmail
    );
    if (existing && existing.id !== currentId) {
      throw conflict("candidate_email_duplicate", "Candidate email exists.");
    }
  }

  private async findCandidateInOrganization(
    actor: Actor,
    organizationId: string,
    candidateId: string
  ) {
    const candidate = await this.candidates.findCandidateById(candidateId);
    if (!candidate || candidate.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "candidate.cross_organization_access_denied",
        "candidate_organization_mismatch",
        { candidateId }
      );
      throw notFound("candidate_not_found", "Candidate not found.");
    }
    return candidate;
  }

  private serializeOwnerAdmin(
    candidate: Candidate,
    extras: {
      consents?: CandidateConsent[];
      internalNotes?: CandidateInternalNote[];
      operationalConsent?: CandidateConsent | null;
    } = {}
  ) {
    return {
      ...candidate,
      consents: extras.consents,
      internalNotes: extras.internalNotes,
      operationalConsent: extras.operationalConsent
    };
  }

  private serializeMember(candidate: Candidate) {
    return {
      id: candidate.id,
      fullName: candidate.fullName,
      preferredName: candidate.preferredName,
      city: candidate.location.city,
      state: candidate.location.state,
      professionalSummary: candidate.professionalSummary,
      experiences: candidate.experiences,
      education: candidate.education,
      certifications: candidate.certifications,
      languages: candidate.languages,
      declaredCompetencies: candidate.declaredCompetencies,
      professionalLinks: candidate.professionalLinks,
      status: candidate.status,
      source: candidate.source
    };
  }

  private serializeAdministrative(candidate: Candidate) {
    return {
      id: candidate.id,
      organizationId: candidate.organizationId,
      fullName: candidate.fullName,
      preferredName: candidate.preferredName,
      normalizedEmail: candidate.normalizedEmail,
      status: candidate.status,
      source: candidate.source,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt
    };
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

export function createPostgresCandidateService(pool: pg.Pool) {
  const core = new PostgresCoreRepository(pool);
  const candidates = new PostgresCandidateRepository(pool);
  const runTransaction: CandidateTransactionRunner = async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        candidates: new PostgresCandidateRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  return new CandidateService(core, candidates, runTransaction);
}

function toConsent(
  repository: CandidateRepository,
  organizationId: string,
  candidateId: string,
  userId: string | null,
  input: ReturnType<typeof validateConsentInput>,
  now: string
): CandidateConsent {
  const status = input.status as CandidateConsent["status"];
  return {
    id: repository.nextId("ccon"),
    organizationId,
    candidateId,
    status,
    consentAt: String(input.consentAt),
    source: String(input.source),
    termsVersion: String(input.termsVersion),
    purpose: String(input.purpose),
    expiresAt: input.expiresAt ? String(input.expiresAt) : null,
    revokedAt: status === "revoked" ? now : null,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now
  };
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }
  return actor.userId;
}

function normalizeInputObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("candidate_input_invalid", "Candidate input is invalid.");
  }
  return value as Record<string, unknown>;
}

function definedPatch<T extends Record<string, unknown>>(patch: T) {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function isUniqueViolation(error: unknown, constraint: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "constraint" in error &&
    (error as { code?: string; constraint?: string }).code === "23505" &&
    (error as { code?: string; constraint?: string }).constraint === constraint
  );
}
