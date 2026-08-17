import { createHash } from "node:crypto";
import type pg from "pg";
import { fingerprint } from "../core/canonical-hash";
import { conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, MembershipRole } from "../core/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresEmploymentRepository } from "../persistence/postgres-employment-repository";
import type { EmploymentRepository } from "./repository";
import {
  createEmploymentTransactionRunner,
  type EmploymentTransaction,
  type EmploymentTransactionRunner
} from "./transaction";
import type {
  Employment,
  EmploymentActivationInput,
  EmploymentAdminReadInput,
  EmploymentCreateInput,
  EmploymentIdempotencyOperation,
  EmploymentReasonInput,
  OrganizationPerson,
  OrganizationPersonInput
} from "./types";
import {
  reasonHash,
  validateActivationInput,
  validateAdminReason,
  validateCancelInput,
  validateCreateEmploymentInput,
  validateCreatePersonInput,
  validateEndInput,
  validateIdempotencyKey
} from "./validation";

type IdempotentResult<T> = T & { idempotentReplay?: boolean };

export class EmploymentService {
  constructor(
    private readonly core: CoreRepository,
    private readonly employments: EmploymentRepository,
    private readonly runTransaction: EmploymentTransactionRunner
  ) {}

  async createPerson(
    actor: Actor,
    organizationId: string,
    input: OrganizationPersonInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = validateCreatePersonInput(input);
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "create_person",
      normalized.originCandidateId ?? "organization",
      idempotencyKeyRaw,
      {
        operation: "create_person",
        originCandidateId: normalized.originCandidateId,
        displayNameHash: sha256Hex(normalized.displayName),
        preferredNameHash: sha256Hex(normalized.preferredName),
        primaryEmailHash: sha256Hex(normalized.primaryEmail)
      },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          if (normalized.originCandidateId) {
            const existing = await tx.employments.findPersonByOriginCandidateForUpdate(
              organizationId,
              normalized.originCandidateId
            );
            if (existing) {
              await service.audit(actor, organizationId, "organization_person.reused", {
                organizationPersonId: existing.id,
                originCandidateId: normalized.originCandidateId
              });
              return service.serializePerson(existing);
            }
            await service.ensureCandidateInOrganization(
              actor,
              organizationId,
              normalized.originCandidateId
            );
          }
          const now = tx.employments.now();
          const person: OrganizationPerson = {
            id: tx.employments.nextId("operson"),
            organizationId,
            displayName: normalized.displayName,
            preferredName: normalized.preferredName,
            primaryEmail: normalized.primaryEmail,
            originCandidateId: normalized.originCandidateId,
            createdByUserId: requireUserActorId(actor),
            updatedByUserId: null,
            createdAt: now,
            updatedAt: now
          };
          await tx.employments.createPerson(person);
          await service.audit(actor, organizationId, "organization_person.created", {
            organizationPersonId: person.id,
            hasOriginCandidate: String(Boolean(person.originCandidateId))
          });
          return service.serializePerson(person);
        })
    );
  }

  async createEmployment(
    actor: Actor,
    organizationId: string,
    input: EmploymentCreateInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = validateCreateEmploymentInput(input);
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const operation: EmploymentIdempotencyOperation = normalized.organizationPersonId
      ? "create_employment"
      : "create_person_and_employment";
    return this.withIdempotency(
      organizationId,
      operation,
      normalized.organizationPersonId ?? normalized.candidateApplicationId ?? "organization",
      idempotencyKeyRaw,
      {
        operation,
        organizationPersonId: normalized.organizationPersonId,
        originType: normalized.originType,
        originReasonHash: reasonHash(normalized.originReason),
        originCandidateId: normalized.originCandidateId,
        candidateApplicationId: normalized.candidateApplicationId,
        proposalVersionId: normalized.proposalVersionId,
        decisionAt: normalized.decisionAt,
        effectiveStartDate: normalized.effectiveStartDate,
        displayNameHash: sha256Hex(normalized.displayName),
        preferredNameHash: sha256Hex(normalized.preferredName),
        primaryEmailHash: sha256Hex(normalized.primaryEmail)
      },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const context = await service.resolveCreationContext(actor, organizationId, normalized);
          await tx.employments.listEmploymentsForPersonForUpdate(organizationId, context.person.id);
          const now = tx.employments.now();
          const employment: Employment = {
            id: tx.employments.nextId("empl"),
            organizationId,
            organizationPersonId: context.person.id,
            status: "pending",
            originType: normalized.originType,
            originReason: normalized.originReason,
            originCandidateId: context.originCandidateId,
            originCandidateApplicationId: context.originCandidateApplicationId,
            originProposalVersionId: normalized.proposalVersionId,
            originJobOpeningId: context.originJobOpeningId,
            originJobOpeningVersionId: context.originJobOpeningVersionId,
            decisionAt: normalized.decisionAt ?? context.decisionAt,
            effectiveStartDate: normalized.effectiveStartDate,
            startedAt: null,
            endDate: null,
            endedAt: null,
            endReason: null,
            cancelledAt: null,
            cancellationReason: null,
            createdByUserId: requireUserActorId(actor),
            activatedByUserId: null,
            endedByUserId: null,
            cancelledByUserId: null,
            createdAt: now,
            updatedAt: now
          };
          await tx.employments.createEmployment(employment);
          await service.audit(actor, organizationId, "employment.created", {
            employmentId: employment.id,
            organizationPersonId: context.person.id,
            originType: employment.originType,
            hasProposalVersion: String(Boolean(employment.originProposalVersionId))
          });
          return service.serializeEmployment(employment, context.person);
        })
    );
  }

  // SPEC-025 v1.0 s20 (matriz RBAC): "Consultar OrganizationPerson completo" e "Consultar lista
  // minima" sao Sim apenas para owner/admin; member e explicitamente "Nao" / "Nao por padrao".
  // Member nao recebe permissao implicita -- uma leitura minimizada para member exigiria regra
  // positiva propria de um modulo consumidor futuro, que nao existe nesta v1.
  async getPerson(actor: Actor, organizationId: string, personId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"], true);
    const person = await this.findPersonInOrganization(actor, organizationId, personId);
    const employments = await this.employments.listEmployments(organizationId, person.id);
    return {
      ...this.serializePerson(person),
      employments: employments.map((employment) => this.serializeEmployment(employment, person))
    };
  }

  async listPeople(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"], true);
    const people = await this.employments.listPeople(organizationId);
    return people.map((person) => this.serializePerson(person));
  }

  async listEmployments(actor: Actor, organizationId: string, personId?: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"], true);
    if (personId) {
      await this.findPersonInOrganization(actor, organizationId, personId);
    }
    const employments = await this.employments.listEmployments(organizationId, personId);
    return employments.map((employment) => this.serializeEmployment(employment));
  }

  async activate(
    actor: Actor,
    organizationId: string,
    employmentId: string,
    input: EmploymentActivationInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = validateActivationInput(input);
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.transitionWithIdempotency(
      actor,
      organizationId,
      employmentId,
      "activate",
      { operation: "activate", employmentId, reasonHash: normalized.reasonHash },
      idempotencyKeyRaw,
      (employment, now) => {
        if (employment.status !== "pending") {
          throw conflict(
            "employment_activate_invalid_state",
            "Only pending employment can activate."
          );
        }
        return {
          ...employment,
          status: "active" as const,
          startedAt: now,
          activatedByUserId: requireUserActorId(actor),
          updatedAt: now
        };
      },
      "employment.activated"
    );
  }

  async cancel(
    actor: Actor,
    organizationId: string,
    employmentId: string,
    input: EmploymentReasonInput,
    idempotencyKeyRaw: unknown
  ) {
    const reason = validateCancelInput(input);
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.transitionWithIdempotency(
      actor,
      organizationId,
      employmentId,
      "cancel",
      { operation: "cancel", employmentId, reasonHash: reasonHash(reason) },
      idempotencyKeyRaw,
      (employment, now) => {
        if (employment.status !== "pending") {
          throw conflict("employment_cancel_invalid_state", "Only pending employment can cancel.");
        }
        return {
          ...employment,
          status: "cancelled" as const,
          cancelledAt: now,
          cancelledByUserId: requireUserActorId(actor),
          cancellationReason: reason,
          updatedAt: now
        };
      },
      "employment.cancelled"
    );
  }

  async end(
    actor: Actor,
    organizationId: string,
    employmentId: string,
    input: EmploymentReasonInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = validateEndInput(input);
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.transitionWithIdempotency(
      actor,
      organizationId,
      employmentId,
      "end",
      {
        operation: "end",
        employmentId,
        endDate: normalized.endDate,
        reasonHash: reasonHash(normalized.reason)
      },
      idempotencyKeyRaw,
      (employment, now) => {
        if (employment.status !== "active") {
          throw conflict("employment_end_invalid_state", "Only active employment can end.");
        }
        return {
          ...employment,
          status: "ended" as const,
          endDate: normalized.endDate,
          endedAt: now,
          endedByUserId: requireUserActorId(actor),
          endReason: normalized.reason,
          updatedAt: now
        };
      },
      "employment.ended"
    );
  }

  async adminRead(actor: Actor, organizationId: string, input: EmploymentAdminReadInput) {
    const reason = validateAdminReason(input);
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) throw notFound("organization_not_found", "Organization not found.");
    const people = await this.employments.listPeople(organizationId);
    const employments = await this.employments.listEmployments(organizationId);
    await this.audit(actor, organizationId, "employment.administrative_read", {
      reason,
      organizationPersonCount: String(people.length),
      employmentCount: String(employments.length)
    });
    return {
      people: people.map((person) => ({
        id: person.id,
        organizationId: person.organizationId,
        createdAt: person.createdAt,
        updatedAt: person.updatedAt
      })),
      employments: employments.map((employment) => ({
        id: employment.id,
        organizationId: employment.organizationId,
        organizationPersonId: employment.organizationPersonId,
        status: employment.status,
        originType: employment.originType,
        effectiveStartDate: employment.effectiveStartDate,
        createdAt: employment.createdAt,
        updatedAt: employment.updatedAt
      }))
    };
  }

  private async transitionWithIdempotency(
    actor: Actor,
    organizationId: string,
    employmentId: string,
    operation: Extract<EmploymentIdempotencyOperation, "activate" | "cancel" | "end">,
    payload: Record<string, unknown>,
    idempotencyKeyRaw: unknown,
    transition: (employment: Employment, now: string) => Employment,
    auditAction: string
  ) {
    return this.withIdempotency(
      organizationId,
      operation,
      employmentId,
      idempotencyKeyRaw,
      payload,
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const employment = await service.lockEmployment(actor, organizationId, employmentId);
          await tx.employments.findPersonForUpdate(employment.organizationPersonId);
          await tx.employments.listEmploymentsForPersonForUpdate(
            organizationId,
            employment.organizationPersonId
          );
          const updated = transition(employment, tx.employments.now());
          await tx.employments.updateEmployment(updated);
          await service.audit(actor, organizationId, auditAction, {
            employmentId: updated.id,
            organizationPersonId: updated.organizationPersonId
          });
          return service.serializeEmployment(updated);
        })
    );
  }

  private async resolveCreationContext(
    actor: Actor,
    organizationId: string,
    normalized: ReturnType<typeof validateCreateEmploymentInput>
  ) {
    if (normalized.originType === "administrative") {
      if (
        normalized.originCandidateId ||
        normalized.candidateApplicationId ||
        normalized.proposalVersionId
      ) {
        throw conflict("administrative_origin_must_not_reference_recruitment", "Invalid origin.");
      }
      const person = await this.resolveOrCreatePerson(actor, organizationId, normalized, null);
      return {
        person,
        originCandidateId: null,
        originCandidateApplicationId: null,
        originJobOpeningId: null,
        originJobOpeningVersionId: null,
        decisionAt: normalized.decisionAt
      };
    }

    if (!normalized.candidateApplicationId) {
      throw conflict("candidate_application_required", "Candidate Application is required.");
    }
    const application = await this.employments.findApplicationForUpdate(
      normalized.candidateApplicationId
    );
    if (!application || application.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "employment.cross_organization_access_denied",
        "candidate_application_organization_mismatch",
        { candidateApplicationId: normalized.candidateApplicationId }
      );
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    if (application.applicationStatus !== "hired") {
      throw conflict("candidate_application_not_hired", "Candidate Application must be hired.");
    }
    if (normalized.originCandidateId && normalized.originCandidateId !== application.candidateId) {
      throw conflict("origin_candidate_mismatch", "Origin candidate is inconsistent.");
    }
    const candidate = await this.ensureCandidateInOrganization(
      actor,
      organizationId,
      application.candidateId
    );
    if (normalized.proposalVersionId) {
      const proposal = await this.employments.findProposalVersionForUpdate(
        normalized.proposalVersionId
      );
      if (
        !proposal ||
        proposal.organizationId !== organizationId ||
        proposal.candidateApplicationId !== application.id ||
        proposal.candidateId !== application.candidateId ||
        proposal.status !== "accepted"
      ) {
        throw conflict("proposal_version_invalid", "Proposal version must be accepted.");
      }
    }
    const person = await this.resolveOrCreatePerson(actor, organizationId, normalized, candidate);
    return {
      person,
      originCandidateId: application.candidateId,
      originCandidateApplicationId: application.id,
      originJobOpeningId: application.jobOpeningId,
      originJobOpeningVersionId: application.jobOpeningVersionId,
      decisionAt: application.finalizedAt
    };
  }

  private async resolveOrCreatePerson(
    actor: Actor,
    organizationId: string,
    normalized: ReturnType<typeof validateCreateEmploymentInput>,
    candidate: {
      id: string;
      fullName: string;
      preferredName: string | null;
      email: string | null;
    } | null
  ) {
    if (normalized.organizationPersonId) {
      const person = await this.employments.findPersonForUpdate(normalized.organizationPersonId);
      if (!person || person.organizationId !== organizationId) {
        await this.auditDenied(
          actor,
          organizationId,
          "employment.cross_organization_access_denied",
          "organization_person_mismatch",
          { organizationPersonId: normalized.organizationPersonId }
        );
        throw notFound("organization_person_not_found", "Organization person not found.");
      }
      if (candidate && person.originCandidateId && person.originCandidateId !== candidate.id) {
        throw conflict(
          "organization_person_origin_mismatch",
          "Organization person is inconsistent."
        );
      }
      await this.audit(actor, organizationId, "organization_person.reused", {
        organizationPersonId: person.id,
        explicit: "true"
      });
      return person;
    }

    if (candidate) {
      const existing = await this.employments.findPersonByOriginCandidateForUpdate(
        organizationId,
        candidate.id
      );
      if (existing) {
        await this.audit(actor, organizationId, "organization_person.reused", {
          organizationPersonId: existing.id,
          originCandidateId: candidate.id
        });
        return existing;
      }
    }

    const now = this.employments.now();
    const person: OrganizationPerson = {
      id: this.employments.nextId("operson"),
      organizationId,
      displayName: normalized.displayName ?? candidate?.fullName ?? "",
      preferredName: normalized.preferredName ?? candidate?.preferredName ?? null,
      primaryEmail: normalized.primaryEmail ?? candidate?.email ?? null,
      originCandidateId: candidate?.id ?? normalized.originCandidateId,
      createdByUserId: requireUserActorId(actor),
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now
    };
    if (!person.displayName) {
      throw conflict("organization_person_display_name_required", "Display name is required.");
    }
    await this.employments.createPerson(person);
    await this.audit(actor, organizationId, "organization_person.created", {
      organizationPersonId: person.id,
      hasOriginCandidate: String(Boolean(person.originCandidateId))
    });
    return person;
  }

  private async withIdempotency<T extends { id?: string }>(
    organizationId: string,
    operation: EmploymentIdempotencyOperation,
    scopeId: string | null,
    rawKey: unknown,
    payload: Record<string, unknown>,
    actor: Actor,
    callback: () => Promise<T>
  ): Promise<IdempotentResult<T>> {
    const keyHash = createHash("sha256").update(validateIdempotencyKey(rawKey)).digest("hex");
    const requestFingerprint = fingerprint(payload);
    const begin = await this.employments.beginIdempotency({
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
          "employment.idempotency_conflict",
          "fingerprint_conflict"
        );
        throw conflict("employment_idempotency_conflict", "Idempotency-Key was used differently.");
      }
      if (existing.status === "pending") {
        throw conflict("employment_idempotency_in_progress", "Request is already being processed.");
      }
      if (existing.status === "failed") {
        throw conflict("employment_idempotency_failed", "Use a new Idempotency-Key to retry.");
      }
      const resource = existing.resultResourceId
        ? await this.resourceByOperation(operation, existing.resultResourceId)
        : null;
      if (!resource) {
        throw conflict(
          "employment_idempotency_result_unavailable",
          "Idempotent result is unavailable."
        );
      }
      return { ...(resource as unknown as T), idempotentReplay: true };
    }
    try {
      const result = await callback();
      await this.employments.markIdempotencyCompleted(begin.idempotency.id, String(result.id));
      return result;
    } catch (error) {
      await this.employments.markIdempotencyFailed(begin.idempotency.id, errorCode(error));
      // SPEC-025 s25 (eventos minimos): `employment.concurrent_operation_conflict` deve ser
      // auditado quando uma corrida real de banco (deadlock, serializacao, lock ou unique
      // violation relevante) e detectada por `isPostgresConcurrentConflict` e convertida em
      // conflito seguro por `createEmploymentTransactionRunner`. A transacao original ja fez
      // ROLLBACK nesse ponto, entao esta auditoria roda fora dela, via `this.core` direto.
      if (errorCode(error) === "employment_concurrent_change") {
        await this.auditDenied(
          actor,
          organizationId,
          "employment.concurrent_operation_conflict",
          "concurrent_operation_conflict"
        );
      }
      throw error;
    }
  }

  private async resourceByOperation(operation: EmploymentIdempotencyOperation, resourceId: string) {
    if (operation === "create_person") {
      const person = await this.employments.findPersonById(resourceId);
      return person ? this.serializePerson(person) : null;
    }
    const employment = await this.employments.findEmploymentById(resourceId);
    return employment ? this.serializeEmployment(employment) : null;
  }

  private scoped(tx: EmploymentTransaction) {
    return new EmploymentService(tx.core, tx.employments, this.runTransaction);
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
        "employment.permission_denied",
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
        "employment.permission_denied",
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
        "employment.cross_organization_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }
    if (!allowedRoles.includes(membership.role)) {
      await this.auditDenied(
        actor,
        organizationId,
        "employment.permission_denied",
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }
    return { role: membership.role, membership };
  }

  private async ensureCandidateInOrganization(
    actor: Actor,
    organizationId: string,
    candidateId: string
  ) {
    const candidate = await this.employments.findCandidate(candidateId);
    if (!candidate || candidate.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "employment.cross_organization_access_denied",
        "candidate_organization_mismatch",
        { candidateId }
      );
      throw notFound("candidate_not_found", "Candidate not found.");
    }
    return candidate;
  }

  private async findPersonInOrganization(actor: Actor, organizationId: string, personId: string) {
    const person = await this.employments.findPersonById(personId);
    if (!person || person.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "employment.cross_organization_access_denied",
        "organization_person_mismatch",
        { organizationPersonId: personId }
      );
      throw notFound("organization_person_not_found", "Organization person not found.");
    }
    return person;
  }

  private async lockEmployment(actor: Actor, organizationId: string, employmentId: string) {
    const employment = await this.employments.findEmploymentForUpdate(employmentId);
    if (!employment || employment.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "employment.cross_organization_access_denied",
        "employment_organization_mismatch",
        { employmentId }
      );
      throw notFound("employment_not_found", "Employment not found.");
    }
    return employment;
  }

  private serializePerson(person: OrganizationPerson) {
    return person;
  }

  private serializeEmployment(employment: Employment, person?: OrganizationPerson) {
    return {
      ...employment,
      organizationPerson: person ? this.serializePerson(person) : undefined
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

export function createPostgresEmploymentService(pool: pg.Pool) {
  return new EmploymentService(
    new PostgresCoreRepository(pool),
    new PostgresEmploymentRepository(pool),
    createEmploymentTransactionRunner(pool)
  );
}

function sha256Hex(value: string | null) {
  return value === null ? null : createHash("sha256").update(value).digest("hex");
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
