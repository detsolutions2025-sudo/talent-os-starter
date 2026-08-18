import { createHash } from "node:crypto";
import type pg from "pg";
import { fingerprint } from "../core/canonical-hash";
import { badRequest, conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, Membership, MembershipRole } from "../core/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresOnboardingRepository } from "../persistence/postgres-onboarding-repository";
import type { OnboardingRepository } from "./repository";
import {
  createOnboardingTransactionRunner,
  type OnboardingTransaction,
  type OnboardingTransactionRunner
} from "./transaction";
import type {
  Onboarding,
  OnboardingAdminReadInput,
  OnboardingApplicationContext,
  OnboardingAssignInput,
  OnboardingCreateInput,
  OnboardingEmploymentLinkInput,
  OnboardingIdempotencyOperation,
  OnboardingReasonInput,
  OnboardingTask,
  OnboardingTaskInput
} from "./types";
import {
  ensureNoProtectedAssignment,
  validateAdminReason,
  validateAssignmentInput,
  validateCreateInput,
  validateEmploymentLinkInput,
  validateIdempotencyKey,
  validateReasonInput,
  validateTaskInput
} from "./validation";

type IdempotentResult<T> = T & { idempotentReplay?: boolean };

export class OnboardingService {
  constructor(
    private readonly core: CoreRepository,
    private readonly onboardings: OnboardingRepository,
    private readonly runTransaction: OnboardingTransactionRunner
  ) {}

  async create(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    input: OnboardingCreateInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = validateCreateInput(input);
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "create",
      applicationId,
      idempotencyKeyRaw,
      { applicationId, ...normalized },
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const application = await service.lockApplication(actor, organizationId, applicationId);
          await service.ensureCanCreate(actor, organizationId, application);
          const existing = await tx.onboardings.findOnboardingByApplication(
            organizationId,
            application.id
          );
          if (existing) {
            throw conflict("onboarding_already_exists", "Onboarding already exists.");
          }
          const now = tx.onboardings.now();
          const userId = requireUserActorId(actor);
          const onboarding: Onboarding = {
            id: tx.onboardings.nextId("onb"),
            organizationId,
            candidateApplicationId: application.id,
            candidateId: application.candidateId,
            status: "draft",
            expectedPersonStartDate: normalized.expectedPersonStartDate,
            employmentId: null,
            createdByUserId: userId,
            startedAt: null,
            startedByUserId: null,
            completedAt: null,
            completedByUserId: null,
            cancelledAt: null,
            cancelledByUserId: null,
            cancellationReason: null,
            createdAt: now,
            updatedAt: now
          };
          await tx.onboardings.createOnboarding(onboarding);
          for (const taskInput of normalized.initialTasks) {
            if (taskInput.assigneeMembershipId) {
              await service.ensureAssignableMembership(
                organizationId,
                taskInput.assigneeMembershipId
              );
            }
            await tx.onboardings.createTask(
              service.buildTask(tx, onboarding, taskInput, userId, now)
            );
          }
          await service.audit(actor, organizationId, "onboarding.created", {
            onboardingId: onboarding.id,
            candidateApplicationId: application.id,
            taskCount: String(normalized.initialTasks.length)
          });
          return service.serializeOwnerAdmin(onboarding);
        })
    );
  }

  async getByApplication(actor: Actor, organizationId: string, applicationId: string) {
    const context = await this.authorizeUser(
      actor,
      organizationId,
      ["owner", "admin", "member"],
      true
    );
    const onboarding = await this.onboardings.findOnboardingByApplication(
      organizationId,
      applicationId
    );
    if (!onboarding) throw notFound("onboarding_not_found", "Onboarding not found.");
    return this.serializeForRole(context.role, context.membership, onboarding);
  }

  async get(actor: Actor, organizationId: string, onboardingId: string) {
    const context = await this.authorizeUser(
      actor,
      organizationId,
      ["owner", "admin", "member"],
      true
    );
    const onboarding = await this.findOnboardingInOrganization(actor, organizationId, onboardingId);
    return this.serializeForRole(context.role, context.membership, onboarding);
  }

  async listTasks(actor: Actor, organizationId: string, onboardingId: string) {
    const context = await this.authorizeUser(
      actor,
      organizationId,
      ["owner", "admin", "member"],
      true
    );
    const onboarding = await this.findOnboardingInOrganization(actor, organizationId, onboardingId);
    const tasks = await this.onboardings.listTasks(organizationId, onboarding.id);
    return context.role === "member"
      ? tasks
          .filter((task) => task.assigneeMembershipId === context.membership.id)
          .map(serializeTask)
      : tasks.map(serializeTask);
  }

  async listMyTasks(actor: Actor, organizationId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["member"], true);
    return (
      await this.onboardings.listTasksForMembership(organizationId, context.membership.id)
    ).map(serializeTask);
  }

  async start(
    actor: Actor,
    organizationId: string,
    onboardingId: string,
    idempotencyKeyRaw: unknown
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "start",
      onboardingId,
      idempotencyKeyRaw,
      { onboardingId },
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const onboarding = await service.lockOnboarding(actor, organizationId, onboardingId);
          await service.lockApplication(actor, organizationId, onboarding.candidateApplicationId);
          if (onboarding.status !== "draft") {
            throw conflict("onboarding_start_invalid_state", "Only draft onboarding can start.");
          }
          const tasks = await tx.onboardings.listTasksForUpdate(organizationId, onboarding.id);
          const missingAssignee = tasks.some(
            (task) => task.isRequired && !task.assigneeMembershipId
          );
          if (missingAssignee) {
            throw conflict(
              "onboarding_required_task_assignee_missing",
              "Required tasks must have an assignee before onboarding starts."
            );
          }
          const now = tx.onboardings.now();
          const updated = {
            ...onboarding,
            status: "in_progress" as const,
            startedAt: now,
            startedByUserId: requireUserActorId(actor),
            updatedAt: now
          };
          await tx.onboardings.updateOnboarding(updated);
          await service.audit(actor, organizationId, "onboarding.started", {
            onboardingId: updated.id
          });
          return service.serializeOwnerAdmin(updated);
        })
    );
  }

  // Fase 26 (SPEC-016 v1.1 s43-s51): vinculo tardio, explicito e imutavel a
  // Employment. Nunca aceito no payload de create (s47.1); nunca cria, ativa,
  // encerra ou cancela Employment (s54); Employment nunca conhece Onboarding.
  async linkEmployment(
    actor: Actor,
    organizationId: string,
    onboardingId: string,
    input: OnboardingEmploymentLinkInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = validateEmploymentLinkInput(input);
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "link_employment",
      onboardingId,
      idempotencyKeyRaw,
      { onboardingId, employmentId: normalized.employmentId },
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const onboarding = await service.lockOnboarding(actor, organizationId, onboardingId);
          if (!["draft", "in_progress"].includes(onboarding.status)) {
            throw conflict("onboarding_final", "Final onboarding cannot be linked to Employment.");
          }
          if (onboarding.employmentId === normalized.employmentId) {
            // Fase 26 (SPEC-016 v1.1 s47.2): mesmo employment_id -> no-op
            // idempotente; nunca executa UPDATE, nunca duplica auditoria.
            return service.serializeOwnerAdmin(onboarding);
          }
          if (onboarding.employmentId) {
            // Fase 26: auditoria de negacao usa `this` (conexao fora da
            // transacao), nunca `service` (tx-scoped) -- do contrario o
            // proprio ROLLBACK que a excecao dispara apagaria a auditoria
            // da tentativa negada junto com a mutacao abortada.
            await this.auditDenied(
              actor,
              organizationId,
              "onboarding.employment_link_conflict",
              "onboarding_employment_link_immutable",
              { onboardingId }
            );
            throw conflict(
              "onboarding_employment_link_immutable",
              "Onboarding is already linked to a different Employment."
            );
          }
          const employment = await tx.onboardings.findEmploymentForLink(
            organizationId,
            normalized.employmentId
          );
          if (!employment) {
            await this.auditDenied(
              actor,
              organizationId,
              "onboarding.employment_link_denied_cross_organization",
              "employment_not_found",
              { onboardingId }
            );
            throw notFound("employment_not_found", "Employment not found.");
          }
          if (!["pending", "active"].includes(employment.status)) {
            await this.auditDenied(
              actor,
              organizationId,
              "onboarding.employment_link_denied_incompatible",
              "employment_not_eligible",
              { onboardingId, employmentId: employment.id }
            );
            throw conflict(
              "onboarding_employment_not_eligible",
              "Employment is not eligible for linking."
            );
          }
          const coherent =
            employment.originCandidateApplicationId === onboarding.candidateApplicationId ||
            employment.organizationPersonOriginCandidateId === onboarding.candidateId;
          if (!coherent) {
            await this.auditDenied(
              actor,
              organizationId,
              "onboarding.employment_link_denied_incompatible",
              "employment_incompatible_provenance",
              { onboardingId, employmentId: employment.id }
            );
            throw conflict(
              "onboarding_employment_incompatible_provenance",
              "Employment provenance is incompatible with this Onboarding."
            );
          }
          const now = tx.onboardings.now();
          const updated = {
            ...onboarding,
            employmentId: employment.id,
            updatedAt: now
          };
          await tx.onboardings.updateOnboarding(updated);
          await service.audit(actor, organizationId, "onboarding.employment_linked", {
            onboardingId: updated.id,
            employmentId: employment.id
          });
          return service.serializeOwnerAdmin(updated);
        })
    );
  }

  async addTask(
    actor: Actor,
    organizationId: string,
    onboardingId: string,
    input: OnboardingTaskInput
  ) {
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const onboarding = await service.lockOnboarding(actor, organizationId, onboardingId);
      const normalized = validateTaskInput(input, onboarding.status === "in_progress");
      if (!["draft", "in_progress"].includes(onboarding.status)) {
        throw conflict("onboarding_final", "Final onboarding cannot receive tasks.");
      }
      if (normalized.assigneeMembershipId) {
        await service.ensureAssignableMembership(organizationId, normalized.assigneeMembershipId);
      }
      const now = tx.onboardings.now();
      const task = service.buildTask(tx, onboarding, normalized, requireUserActorId(actor), now);
      await tx.onboardings.createTask(task);
      await service.audit(actor, organizationId, "onboarding.task_created", {
        onboardingId,
        onboardingTaskId: task.id,
        required: String(task.isRequired)
      });
      return serializeTask(task);
    });
  }

  async assignTask(
    actor: Actor,
    organizationId: string,
    taskId: string,
    input: OnboardingAssignInput
  ) {
    const normalized = validateAssignmentInput(input);
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const task = await service.lockTask(actor, organizationId, taskId);
      await service.lockOnboarding(actor, organizationId, task.onboardingId);
      if (task.status !== "open") {
        throw conflict("onboarding_task_final", "Final task cannot be reassigned.");
      }
      await service.ensureAssignableMembership(organizationId, normalized.assigneeMembershipId);
      const now = tx.onboardings.now();
      const updated = {
        ...task,
        assigneeMembershipId: normalized.assigneeMembershipId,
        updatedAt: now
      };
      await tx.onboardings.updateTask(updated);
      await service.audit(actor, organizationId, "onboarding.task_assigned", {
        onboardingId: task.onboardingId,
        onboardingTaskId: task.id,
        assigneeMembershipId: normalized.assigneeMembershipId
      });
      return serializeTask(updated);
    });
  }

  async completeTask(actor: Actor, organizationId: string, taskId: string) {
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      const context = await service.authorizeUser(actor, organizationId, [
        "owner",
        "admin",
        "member"
      ]);
      const task = await service.lockTask(actor, organizationId, taskId);
      await service.lockOnboarding(actor, organizationId, task.onboardingId);
      if (task.status !== "open") {
        throw conflict("onboarding_task_final", "Final task cannot be completed.");
      }
      const now = tx.onboardings.now();
      let completedByMembershipId: string | null = null;
      let completedByUserId: string | null = null;
      if (context.role === "member") {
        if (task.assigneeMembershipId !== context.membership.id) {
          throw forbidden("permission_denied", "Permission denied.");
        }
        completedByMembershipId = context.membership.id;
      } else {
        completedByUserId = requireUserActorId(actor);
      }
      const updated = {
        ...task,
        status: "completed" as const,
        completedAt: now,
        completedByMembershipId,
        completedByUserId,
        updatedAt: now
      };
      await tx.onboardings.updateTask(updated);
      await service.audit(actor, organizationId, "onboarding.task_completed", {
        onboardingId: task.onboardingId,
        onboardingTaskId: task.id,
        administrative: completedByUserId ? "true" : "false"
      });
      return serializeTask(updated);
    });
  }

  async cancelTask(
    actor: Actor,
    organizationId: string,
    taskId: string,
    input: OnboardingReasonInput
  ) {
    const reason = validateReasonInput(input, "onboarding_task_cancel_reason_required");
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const task = await service.lockTask(actor, organizationId, taskId);
      await service.lockOnboarding(actor, organizationId, task.onboardingId);
      if (task.status !== "open") {
        throw conflict("onboarding_task_final", "Final task cannot be cancelled.");
      }
      const now = tx.onboardings.now();
      const updated = {
        ...task,
        status: "cancelled" as const,
        cancelledAt: now,
        cancelledByUserId: requireUserActorId(actor),
        cancellationReason: reason,
        updatedAt: now
      };
      await tx.onboardings.updateTask(updated);
      await service.audit(actor, organizationId, "onboarding.task_cancelled", {
        onboardingId: task.onboardingId,
        onboardingTaskId: task.id,
        reasonProvided: "true"
      });
      return serializeTask(updated);
    });
  }

  async cancel(
    actor: Actor,
    organizationId: string,
    onboardingId: string,
    input: OnboardingReasonInput,
    idempotencyKeyRaw: unknown
  ) {
    const reason = validateReasonInput(input, "onboarding_cancel_reason_required");
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "cancel",
      onboardingId,
      idempotencyKeyRaw,
      { onboardingId, reason },
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const onboarding = await service.lockOnboarding(actor, organizationId, onboardingId);
          await service.lockApplication(actor, organizationId, onboarding.candidateApplicationId);
          if (!["draft", "in_progress"].includes(onboarding.status)) {
            throw conflict("onboarding_final", "Final onboarding cannot be cancelled.");
          }
          const now = tx.onboardings.now();
          const updated = {
            ...onboarding,
            status: "cancelled" as const,
            cancelledAt: now,
            cancelledByUserId: requireUserActorId(actor),
            cancellationReason: reason,
            updatedAt: now
          };
          await tx.onboardings.updateOnboarding(updated);
          await service.audit(actor, organizationId, "onboarding.cancelled", {
            onboardingId,
            reasonProvided: "true"
          });
          return service.serializeOwnerAdmin(updated);
        })
    );
  }

  async complete(
    actor: Actor,
    organizationId: string,
    onboardingId: string,
    idempotencyKeyRaw: unknown
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "complete",
      onboardingId,
      idempotencyKeyRaw,
      { onboardingId },
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const onboarding = await service.lockOnboarding(actor, organizationId, onboardingId);
          await service.lockApplication(actor, organizationId, onboarding.candidateApplicationId);
          if (onboarding.status !== "in_progress") {
            throw conflict(
              "onboarding_complete_invalid_state",
              "Only in-progress onboarding can complete."
            );
          }
          const tasks = await tx.onboardings.listTasksForUpdate(organizationId, onboarding.id);
          if (tasks.some((task) => task.isRequired && task.status === "open")) {
            throw conflict("onboarding_required_tasks_open", "Required tasks are still open.");
          }
          const now = tx.onboardings.now();
          const updated = {
            ...onboarding,
            status: "completed" as const,
            completedAt: now,
            completedByUserId: requireUserActorId(actor),
            updatedAt: now
          };
          await tx.onboardings.updateOnboarding(updated);
          await service.audit(actor, organizationId, "onboarding.completed", {
            onboardingId,
            requiredTaskCount: String(tasks.filter((task) => task.isRequired).length)
          });
          return service.serializeOwnerAdmin(updated);
        })
    );
  }

  async adminRead(actor: Actor, organizationId: string, input: OnboardingAdminReadInput) {
    const reason = validateAdminReason(input);
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) throw notFound("organization_not_found", "Organization not found.");
    const onboardings = await this.onboardings.listOnboardings(organizationId);
    await this.audit(actor, organizationId, "onboarding.administrative_read", {
      reason,
      onboardingCount: String(onboardings.length)
    });
    return onboardings.map((onboarding) => ({
      id: onboarding.id,
      organizationId: onboarding.organizationId,
      candidateApplicationId: onboarding.candidateApplicationId,
      candidateId: onboarding.candidateId,
      status: onboarding.status,
      createdAt: onboarding.createdAt,
      updatedAt: onboarding.updatedAt
    }));
  }

  private async withIdempotency<T extends { id?: string }>(
    organizationId: string,
    operation: OnboardingIdempotencyOperation,
    scopeId: string | null,
    rawKey: unknown,
    payload: Record<string, unknown>,
    callback: () => Promise<T>
  ): Promise<IdempotentResult<T>> {
    const keyHash = sha256Hex(validateIdempotencyKey(rawKey));
    const requestFingerprint = fingerprint(payload);
    const begin = await this.onboardings.beginIdempotency({
      organizationId,
      operation,
      scopeId,
      keyHash,
      requestFingerprint
    });
    if (!begin.created) {
      const existing = begin.idempotency;
      if (existing.requestFingerprint !== requestFingerprint) {
        throw conflict("onboarding_idempotency_conflict", "Idempotency-Key was used differently.");
      }
      if (existing.status === "pending") {
        throw conflict("onboarding_idempotency_in_progress", "Request is already being processed.");
      }
      if (existing.status === "failed") {
        throw conflict("onboarding_idempotency_failed", "Use a new Idempotency-Key to retry.");
      }
      const resource = existing.resultResourceId
        ? await this.onboardings.findOnboardingById(existing.resultResourceId)
        : null;
      if (!resource) {
        throw conflict(
          "onboarding_idempotency_result_unavailable",
          "Idempotent result is unavailable."
        );
      }
      return {
        ...((await this.serializeOwnerAdmin(resource)) as unknown as T),
        idempotentReplay: true
      };
    }
    try {
      const result = await callback();
      await this.onboardings.markIdempotencyCompleted(begin.idempotency.id, String(result.id));
      return result;
    } catch (error) {
      await this.onboardings.markIdempotencyFailed(begin.idempotency.id, errorCode(error));
      throw error;
    }
  }

  private scoped(tx: OnboardingTransaction) {
    return new OnboardingService(tx.core, tx.onboardings, this.runTransaction);
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
        "onboarding.permission_denied",
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
        "onboarding.permission_denied",
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
        "onboarding.cross_organization_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }
    if (!allowedRoles.includes(membership.role)) {
      await this.auditDenied(
        actor,
        organizationId,
        "onboarding.permission_denied",
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }
    return { role: membership.role, membership };
  }

  private async ensureCanCreate(
    actor: Actor,
    organizationId: string,
    application: OnboardingApplicationContext
  ) {
    if (application.applicationStatus !== "hired") {
      throw conflict("candidate_application_not_hired", "Candidate Application must be hired.");
    }
    const candidate = await this.onboardings.findCandidate(application.candidateId);
    if (!candidate || candidate.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "onboarding.cross_organization_access_denied",
        "candidate_organization_mismatch"
      );
      throw notFound("candidate_not_found", "Candidate not found.");
    }
    if (candidate.status !== "active") {
      throw conflict("candidate_inactive", "Inactive candidate cannot start onboarding.");
    }
    const hiredReference = await this.onboardings.findHiredProposalReference(
      organizationId,
      application.id
    );
    if (hiredReference.conflicting) {
      throw conflict("onboarding_hired_event_inconsistent", "Hired event is inconsistent.");
    }
    if (hiredReference.proposalVersionId) {
      const accepted = await this.onboardings.acceptedProposalVersionExists(
        organizationId,
        application.id,
        hiredReference.proposalVersionId
      );
      if (!accepted) {
        throw conflict("onboarding_proposal_version_invalid", "Proposal version must be accepted.");
      }
    }
  }

  private async lockApplication(actor: Actor, organizationId: string, applicationId: string) {
    const application = await this.onboardings.findApplicationForUpdate(applicationId);
    if (!application || application.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "onboarding.cross_organization_access_denied",
        "candidate_application_organization_mismatch",
        { candidateApplicationId: applicationId }
      );
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    return application;
  }

  private async findOnboardingInOrganization(
    actor: Actor,
    organizationId: string,
    onboardingId: string
  ) {
    const onboarding = await this.onboardings.findOnboardingById(onboardingId);
    if (!onboarding || onboarding.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "onboarding.cross_organization_access_denied",
        "onboarding_organization_mismatch",
        { onboardingId }
      );
      throw notFound("onboarding_not_found", "Onboarding not found.");
    }
    return onboarding;
  }

  private async lockOnboarding(actor: Actor, organizationId: string, onboardingId: string) {
    const onboarding = await this.onboardings.findOnboardingForUpdate(onboardingId);
    if (!onboarding || onboarding.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "onboarding.cross_organization_access_denied",
        "onboarding_organization_mismatch",
        { onboardingId }
      );
      throw notFound("onboarding_not_found", "Onboarding not found.");
    }
    return onboarding;
  }

  private async lockTask(actor: Actor, organizationId: string, taskId: string) {
    const task = await this.onboardings.findTaskForUpdate(taskId);
    if (!task || task.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "onboarding.cross_organization_access_denied",
        "task_organization_mismatch",
        { onboardingTaskId: taskId }
      );
      throw notFound("onboarding_task_not_found", "Onboarding task not found.");
    }
    return task;
  }

  private async ensureAssignableMembership(organizationId: string, membershipId: string) {
    const membership = await this.onboardings.findMembershipForUpdate(membershipId);
    if (
      !membership ||
      membership.organizationId !== organizationId ||
      membership.status !== "active"
    ) {
      throw conflict("onboarding_membership_invalid", "Assignee membership must be active.");
    }
    return membership;
  }

  private buildTask(
    tx: OnboardingTransaction,
    onboarding: Onboarding,
    input: ReturnType<typeof validateTaskInput>,
    userId: string,
    now: string
  ): OnboardingTask {
    return {
      id: tx.onboardings.nextId("onbtask"),
      organizationId: onboarding.organizationId,
      onboardingId: onboarding.id,
      title: input.title,
      description: input.description,
      isRequired: input.isRequired,
      status: "open",
      assigneeMembershipId: input.assigneeMembershipId,
      dueAt: input.dueAt,
      displayOrder: input.displayOrder,
      creationReason: input.creationReason,
      createdByUserId: userId,
      completedAt: null,
      completedByMembershipId: null,
      completedByUserId: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      createdAt: now,
      updatedAt: now
    };
  }

  private async serializeForRole(
    role: MembershipRole,
    membership: Membership,
    onboarding: Onboarding
  ) {
    if (role === "member") {
      const tasks = await this.onboardings.listTasks(onboarding.organizationId, onboarding.id);
      return {
        id: onboarding.id,
        candidateApplicationId: onboarding.candidateApplicationId,
        status: onboarding.status,
        expectedPersonStartDate: onboarding.expectedPersonStartDate,
        progress: progress(tasks),
        tasks: tasks
          .filter((task) => task.assigneeMembershipId === membership.id)
          .map(serializeTask)
      };
    }
    return this.serializeOwnerAdmin(onboarding);
  }

  private async serializeOwnerAdmin(onboarding: Onboarding) {
    const tasks = await this.onboardings.listTasks(onboarding.organizationId, onboarding.id);
    return {
      ...onboarding,
      progress: progress(tasks),
      tasks: tasks.map(serializeTask)
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

export function createPostgresOnboardingService(pool: pg.Pool) {
  return new OnboardingService(
    new PostgresCoreRepository(pool),
    new PostgresOnboardingRepository(pool),
    createOnboardingTransactionRunner(pool)
  );
}

function serializeTask(task: OnboardingTask) {
  return task;
}

function progress(tasks: OnboardingTask[]) {
  const eligible = tasks.filter((task) => task.isRequired && task.status !== "cancelled");
  const denominator = eligible.length;
  const numerator = eligible.filter((task) => task.status === "completed").length;
  return {
    numerator,
    denominator,
    percent: denominator === 0 ? 0 : Math.round((numerator / denominator) * 100)
  };
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
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

void ensureNoProtectedAssignment;
void badRequest;
