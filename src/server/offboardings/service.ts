import { createHash } from "node:crypto";
import type pg from "pg";
import { fingerprint } from "../core/canonical-hash";
import { conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, Membership, MembershipRole } from "../core/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresOffboardingRepository } from "../persistence/postgres-offboarding-repository";
import type { OffboardingRepository } from "./repository";
import {
  createOffboardingTransactionRunner,
  type OffboardingTransaction,
  type OffboardingTransactionRunner
} from "./transaction";
import type {
  Offboarding,
  OffboardingAdminReadInput,
  OffboardingAssignInput,
  OffboardingCreateInput,
  OffboardingIdempotencyOperation,
  OffboardingReasonInput,
  OffboardingTask,
  OffboardingTaskInput
} from "./types";
import {
  validateAdminReason,
  validateAssignmentInput,
  validateCreateInput,
  validateIdempotencyKey,
  validateReasonInput,
  validateTaskInput
} from "./validation";

type IdempotentResult<T> = T & { idempotentReplay?: boolean };

// Fase 27 (SPEC-026 v1.0). Employment continua sendo o aggregate root operacional EXTERNO
// (SPEC-025 permanece autoridade exclusiva de seu lifecycle). Offboarding e um aggregate
// PROPRIO, pendurado em Employment por `employment_id`, seguindo o mesmo padrao ja aprovado
// para DevelopmentPlan (SPEC-017).
//
// GATE CRITICO P-01 (SPEC-026 s15): este service NUNCA chama `core.updateMembership`,
// `core.addUser` ou qualquer outra mutacao de User/Membership. `core: CoreRepository` e usado
// SOMENTE para leitura (findUserById, findOrganizationById, findMembershipByOrganizationAndUser)
// e para auditoria (addAuditEvent, nextId, now). Uma OffboardingTask pode conter, como texto
// minimizado, um item como "confirmar revogacao de acesso" -- mas conclui-la nunca executa,
// dispara ou automatiza nenhuma mutacao real de acesso. Ver
// tests/phase27/offboarding-destructive-postgres.test.ts para o teste de codigo-fonte que
// falha caso essa fronteira seja violada no futuro.
export class OffboardingService {
  constructor(
    private readonly core: CoreRepository,
    private readonly offboardings: OffboardingRepository,
    private readonly runTransaction: OffboardingTransactionRunner
  ) {}

  async create(
    actor: Actor,
    organizationId: string,
    employmentId: string,
    input: OffboardingCreateInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = validateCreateInput(input);
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "create",
      employmentId,
      idempotencyKeyRaw,
      {
        operation: "create",
        employmentId,
        exitCategory: normalized.exitCategory,
        expectedLastDay: normalized.expectedLastDay
      },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const employment = await service.requireEligibleEmployment(
            actor,
            organizationId,
            employmentId
          );
          await tx.offboardings.listOffboardingsForEmployment(organizationId, employment.id);
          const now = tx.offboardings.now();
          const userId = requireUserActorId(actor);
          const offboarding: Offboarding = {
            id: tx.offboardings.nextId("offb"),
            organizationId,
            employmentId: employment.id,
            status: "draft",
            exitCategory: normalized.exitCategory,
            expectedLastDay: normalized.expectedLastDay,
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
          await tx.offboardings.createOffboarding(offboarding);
          await service.audit(actor, organizationId, "offboarding.created", {
            offboardingId: offboarding.id,
            employmentId: employment.id
          });
          return service.serializeOwnerAdmin(offboarding);
        })
    );
  }

  async get(actor: Actor, organizationId: string, offboardingId: string) {
    const context = await this.authorizeUser(
      actor,
      organizationId,
      ["owner", "admin", "member"],
      true
    );
    const offboarding = await this.findOffboardingInOrganization(
      actor,
      organizationId,
      offboardingId
    );
    return this.serializeForRole(context.role, context.membership, offboarding);
  }

  async listForEmployment(actor: Actor, organizationId: string, employmentId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"], true);
    const offboardings = await this.offboardings.listOffboardingsForEmployment(
      organizationId,
      employmentId
    );
    return offboardings.map((offboarding) => this.serializeOwnerAdmin(offboarding));
  }

  async listTasks(actor: Actor, organizationId: string, offboardingId: string) {
    const context = await this.authorizeUser(
      actor,
      organizationId,
      ["owner", "admin", "member"],
      true
    );
    const offboarding = await this.findOffboardingInOrganization(
      actor,
      organizationId,
      offboardingId
    );
    const tasks = await this.offboardings.listTasks(organizationId, offboarding.id);
    return context.role === "member"
      ? tasks
          .filter((task) => task.assigneeMembershipId === context.membership.id)
          .map(serializeTask)
      : tasks.map(serializeTask);
  }

  async listMyTasks(actor: Actor, organizationId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["member"], true);
    return (
      await this.offboardings.listTasksForMembership(organizationId, context.membership.id)
    ).map(serializeTask);
  }

  async start(
    actor: Actor,
    organizationId: string,
    offboardingId: string,
    idempotencyKeyRaw: unknown
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "start",
      offboardingId,
      idempotencyKeyRaw,
      { operation: "start", offboardingId },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const offboarding = await service.lockOffboarding(actor, organizationId, offboardingId);
          if (offboarding.status !== "draft") {
            throw conflict("offboarding_start_invalid_state", "Only draft offboarding can start.");
          }
          const tasks = await tx.offboardings.listTasksForUpdate(organizationId, offboarding.id);
          // Revisao destrutiva (Fase 27): uma task obrigatoria ja `cancelled` nao deve bloquear
          // o inicio -- ela ja saiu do denominador de progresso (SPEC-026 s11) e um cancelamento
          // valido nao exige responsavel retroativo. Sem o filtro por `status === "open"`, um
          // teste real (offboarding-flow-postgres.test.ts) expunha 409 mesmo com a unica task
          // obrigatoria elegivel ja atribuida.
          const missingAssignee = tasks.some(
            (task) => task.isRequired && task.status === "open" && !task.assigneeMembershipId
          );
          if (missingAssignee) {
            throw conflict(
              "offboarding_required_task_assignee_missing",
              "Required tasks must have an assignee before offboarding starts."
            );
          }
          const now = tx.offboardings.now();
          const updated: Offboarding = {
            ...offboarding,
            status: "in_progress",
            startedAt: now,
            startedByUserId: requireUserActorId(actor),
            updatedAt: now
          };
          await tx.offboardings.updateOffboarding(updated);
          await service.audit(actor, organizationId, "offboarding.started", {
            offboardingId: updated.id
          });
          return service.serializeOwnerAdmin(updated);
        })
    );
  }

  async addTask(
    actor: Actor,
    organizationId: string,
    offboardingId: string,
    input: OffboardingTaskInput,
    idempotencyKeyRaw: unknown
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "add_task",
      offboardingId,
      idempotencyKeyRaw,
      { operation: "add_task", offboardingId, ...input },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const offboarding = await service.lockOffboarding(actor, organizationId, offboardingId);
          const normalized = validateTaskInput(input, offboarding.status === "in_progress");
          if (!["draft", "in_progress"].includes(offboarding.status)) {
            throw conflict("offboarding_final", "Final offboarding cannot receive tasks.");
          }
          if (normalized.assigneeMembershipId) {
            await service.ensureAssignableMembership(
              organizationId,
              normalized.assigneeMembershipId
            );
          }
          const now = tx.offboardings.now();
          const task = service.buildTask(
            tx,
            offboarding,
            normalized,
            requireUserActorId(actor),
            now
          );
          await tx.offboardings.createTask(task);
          await service.audit(actor, organizationId, "offboarding.task_added", {
            offboardingId,
            offboardingTaskId: task.id,
            required: String(task.isRequired)
          });
          return serializeTask(task);
        })
    );
  }

  async assignTask(
    actor: Actor,
    organizationId: string,
    taskId: string,
    input: OffboardingAssignInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = validateAssignmentInput(input);
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "assign",
      taskId,
      idempotencyKeyRaw,
      { operation: "assign", taskId, assigneeMembershipId: normalized.assigneeMembershipId },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const task = await service.lockTask(actor, organizationId, taskId);
          await service.lockOffboarding(actor, organizationId, task.offboardingId);
          if (task.status !== "open") {
            throw conflict("offboarding_task_final", "Final task cannot be reassigned.");
          }
          await service.ensureAssignableMembership(organizationId, normalized.assigneeMembershipId);
          const now = tx.offboardings.now();
          const updated: OffboardingTask = {
            ...task,
            assigneeMembershipId: normalized.assigneeMembershipId,
            updatedAt: now
          };
          await tx.offboardings.updateTask(updated);
          await service.audit(actor, organizationId, "offboarding.task_assigned", {
            offboardingId: task.offboardingId,
            offboardingTaskId: task.id,
            assigneeMembershipId: normalized.assigneeMembershipId
          });
          return serializeTask(updated);
        })
    );
  }

  async completeTask(
    actor: Actor,
    organizationId: string,
    taskId: string,
    idempotencyKeyRaw: unknown
  ) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    return this.withIdempotency(
      organizationId,
      "task_complete",
      taskId,
      idempotencyKeyRaw,
      { operation: "task_complete", taskId, actorMembershipId: context.membership.id },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const task = await service.lockTask(actor, organizationId, taskId);
          await service.lockOffboarding(actor, organizationId, task.offboardingId);
          if (task.status !== "open") {
            throw conflict("offboarding_task_final", "Final task cannot be completed.");
          }
          const now = tx.offboardings.now();
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
          const updated: OffboardingTask = {
            ...task,
            status: "completed",
            completedAt: now,
            completedByMembershipId,
            completedByUserId,
            updatedAt: now
          };
          await tx.offboardings.updateTask(updated);
          await service.audit(actor, organizationId, "offboarding.task_completed", {
            offboardingId: task.offboardingId,
            offboardingTaskId: task.id,
            administrative: completedByUserId ? "true" : "false"
          });
          return serializeTask(updated);
        })
    );
  }

  async cancelTask(
    actor: Actor,
    organizationId: string,
    taskId: string,
    input: OffboardingReasonInput,
    idempotencyKeyRaw: unknown
  ) {
    const reason = validateReasonInput(input, "offboarding_task_cancel_reason_required");
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "task_cancel",
      taskId,
      idempotencyKeyRaw,
      { operation: "task_cancel", taskId, reason },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const task = await service.lockTask(actor, organizationId, taskId);
          await service.lockOffboarding(actor, organizationId, task.offboardingId);
          if (task.status !== "open") {
            throw conflict("offboarding_task_final", "Final task cannot be cancelled.");
          }
          const now = tx.offboardings.now();
          const updated: OffboardingTask = {
            ...task,
            status: "cancelled",
            cancelledAt: now,
            cancelledByUserId: requireUserActorId(actor),
            cancellationReason: reason,
            updatedAt: now
          };
          await tx.offboardings.updateTask(updated);
          await service.audit(actor, organizationId, "offboarding.task_cancelled", {
            offboardingId: task.offboardingId,
            offboardingTaskId: task.id,
            reasonProvided: "true"
          });
          return serializeTask(updated);
        })
    );
  }

  async complete(
    actor: Actor,
    organizationId: string,
    offboardingId: string,
    idempotencyKeyRaw: unknown
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "complete",
      offboardingId,
      idempotencyKeyRaw,
      { operation: "complete", offboardingId },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const offboarding = await service.lockOffboarding(actor, organizationId, offboardingId);
          if (offboarding.status !== "in_progress") {
            throw conflict(
              "offboarding_complete_invalid_state",
              "Only in-progress offboarding can complete."
            );
          }
          const tasks = await tx.offboardings.listTasksForUpdate(organizationId, offboarding.id);
          if (tasks.some((task) => task.isRequired && task.status === "open")) {
            throw conflict("offboarding_required_tasks_open", "Required tasks are still open.");
          }
          const now = tx.offboardings.now();
          const updated: Offboarding = {
            ...offboarding,
            status: "completed",
            completedAt: now,
            completedByUserId: requireUserActorId(actor),
            updatedAt: now
          };
          await tx.offboardings.updateOffboarding(updated);
          await service.audit(actor, organizationId, "offboarding.completed", {
            offboardingId,
            requiredTaskCount: String(tasks.filter((task) => task.isRequired).length)
          });
          return service.serializeOwnerAdmin(updated);
        })
    );
  }

  async cancel(
    actor: Actor,
    organizationId: string,
    offboardingId: string,
    input: OffboardingReasonInput,
    idempotencyKeyRaw: unknown
  ) {
    const reason = validateReasonInput(input, "offboarding_cancel_reason_required");
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.withIdempotency(
      organizationId,
      "cancel",
      offboardingId,
      idempotencyKeyRaw,
      { operation: "cancel", offboardingId, reason },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const offboarding = await service.lockOffboarding(actor, organizationId, offboardingId);
          if (!["draft", "in_progress"].includes(offboarding.status)) {
            throw conflict("offboarding_final", "Final offboarding cannot be cancelled.");
          }
          const now = tx.offboardings.now();
          const updated: Offboarding = {
            ...offboarding,
            status: "cancelled",
            cancelledAt: now,
            cancelledByUserId: requireUserActorId(actor),
            cancellationReason: reason,
            updatedAt: now
          };
          await tx.offboardings.updateOffboarding(updated);
          await service.audit(actor, organizationId, "offboarding.cancelled", {
            offboardingId,
            reasonProvided: "true"
          });
          return service.serializeOwnerAdmin(updated);
        })
    );
  }

  async adminRead(actor: Actor, organizationId: string, input: OffboardingAdminReadInput) {
    const reason = validateAdminReason(input);
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) throw notFound("organization_not_found", "Organization not found.");
    const offboardings = await this.offboardings.listOffboardings(organizationId);
    await this.audit(actor, organizationId, "offboarding.administrative_read", {
      reason,
      offboardingCount: String(offboardings.length)
    });
    return offboardings.map((offboarding) => ({
      id: offboarding.id,
      organizationId: offboarding.organizationId,
      employmentId: offboarding.employmentId,
      status: offboarding.status,
      createdAt: offboarding.createdAt,
      updatedAt: offboarding.updatedAt
    }));
  }

  private async requireEligibleEmployment(
    actor: Actor,
    organizationId: string,
    employmentId: string
  ) {
    const employment = await this.offboardings.findEmploymentForEligibility(employmentId);
    if (!employment || employment.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "offboarding.cross_organization_access_denied",
        "employment_organization_mismatch",
        { employmentId }
      );
      throw notFound("employment_not_found", "Employment not found.");
    }
    // SPEC-026 s8: somente `active` ou `ended` sao elegiveis para criar Offboarding. `pending`
    // nunca comecou operacionalmente; `cancelled` nunca chegou a existir operacionalmente.
    if (employment.status !== "active" && employment.status !== "ended") {
      throw conflict(
        "offboarding_employment_not_eligible",
        "Employment must be active or ended to create an Offboarding."
      );
    }
    return employment;
  }

  private async withIdempotency<T extends { id?: string }>(
    organizationId: string,
    operation: OffboardingIdempotencyOperation,
    scopeId: string | null,
    rawKey: unknown,
    payload: Record<string, unknown>,
    actor: Actor,
    callback: () => Promise<T>
  ): Promise<IdempotentResult<T>> {
    const keyHash = createHash("sha256").update(validateIdempotencyKey(rawKey)).digest("hex");
    const requestFingerprint = fingerprint(payload);
    const begin = await this.offboardings.beginIdempotency({
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
          "offboarding.idempotency_conflict",
          "fingerprint_conflict"
        );
        throw conflict("offboarding_idempotency_conflict", "Idempotency-Key was used differently.");
      }
      if (existing.status === "pending") {
        throw conflict(
          "offboarding_idempotency_in_progress",
          "Request is already being processed."
        );
      }
      if (existing.status === "failed") {
        throw conflict("offboarding_idempotency_failed", "Use a new Idempotency-Key to retry.");
      }
      const resource = existing.resultResourceId
        ? await this.resourceByOperation(operation, existing.resultResourceId)
        : null;
      if (!resource) {
        throw conflict(
          "offboarding_idempotency_result_unavailable",
          "Idempotent result is unavailable."
        );
      }
      return { ...(resource as unknown as T), idempotentReplay: true };
    }
    try {
      const result = await callback();
      await this.offboardings.markIdempotencyCompleted(begin.idempotency.id, String(result.id));
      return result;
    } catch (error) {
      await this.offboardings.markIdempotencyFailed(begin.idempotency.id, errorCode(error));
      // SPEC-026 s24/s26: negacao/conflito por corrida real de banco deve ser auditada FORA da
      // transacao ja abortada (ROLLBACK ja ocorreu neste ponto) -- mesmo padrao ja comprovado em
      // employments/service.ts e onboardings/service.ts. `this.auditDenied` usa `this.core`
      // (conexao fora da transacao), nunca uma instancia `scoped(tx)`.
      if (errorCode(error) === "offboarding_concurrent_change") {
        await this.auditDenied(
          actor,
          organizationId,
          "offboarding.concurrent_operation_conflict",
          "concurrent_operation_conflict"
        );
      }
      throw error;
    }
  }

  private async resourceByOperation(
    operation: OffboardingIdempotencyOperation,
    resourceId: string
  ) {
    if (
      operation === "add_task" ||
      operation === "assign" ||
      operation === "task_complete" ||
      operation === "task_cancel"
    ) {
      const task = await this.offboardings.findTaskForUpdate(resourceId);
      return task ? serializeTask(task) : null;
    }
    const offboarding = await this.offboardings.findOffboardingById(resourceId);
    return offboarding ? this.serializeOwnerAdmin(offboarding) : null;
  }

  private scoped(tx: OffboardingTransaction) {
    return new OffboardingService(tx.core, tx.offboardings, this.runTransaction);
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
        "offboarding.permission_denied",
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
        "offboarding.permission_denied",
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
        "offboarding.cross_organization_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }
    if (!allowedRoles.includes(membership.role)) {
      await this.auditDenied(
        actor,
        organizationId,
        "offboarding.permission_denied",
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }
    return { role: membership.role, membership };
  }

  private async findOffboardingInOrganization(
    actor: Actor,
    organizationId: string,
    offboardingId: string
  ) {
    const offboarding = await this.offboardings.findOffboardingById(offboardingId);
    if (!offboarding || offboarding.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "offboarding.cross_organization_access_denied",
        "offboarding_organization_mismatch",
        { offboardingId }
      );
      throw notFound("offboarding_not_found", "Offboarding not found.");
    }
    return offboarding;
  }

  private async lockOffboarding(actor: Actor, organizationId: string, offboardingId: string) {
    const offboarding = await this.offboardings.findOffboardingForUpdate(offboardingId);
    if (!offboarding || offboarding.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "offboarding.cross_organization_access_denied",
        "offboarding_organization_mismatch",
        { offboardingId }
      );
      throw notFound("offboarding_not_found", "Offboarding not found.");
    }
    return offboarding;
  }

  private async lockTask(actor: Actor, organizationId: string, taskId: string) {
    const task = await this.offboardings.findTaskForUpdate(taskId);
    if (!task || task.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "offboarding.cross_organization_access_denied",
        "task_organization_mismatch",
        { offboardingTaskId: taskId }
      );
      throw notFound("offboarding_task_not_found", "Offboarding task not found.");
    }
    return task;
  }

  private async ensureAssignableMembership(organizationId: string, membershipId: string) {
    const membership = await this.offboardings.findMembershipForUpdate(membershipId);
    if (
      !membership ||
      membership.organizationId !== organizationId ||
      membership.status !== "active"
    ) {
      throw conflict("offboarding_membership_invalid", "Assignee membership must be active.");
    }
    return membership;
  }

  private buildTask(
    tx: OffboardingTransaction,
    offboarding: Offboarding,
    input: ReturnType<typeof validateTaskInput>,
    userId: string,
    now: string
  ): OffboardingTask {
    return {
      id: tx.offboardings.nextId("offbtask"),
      organizationId: offboarding.organizationId,
      offboardingId: offboarding.id,
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
    offboarding: Offboarding
  ) {
    if (role === "member") {
      const tasks = await this.offboardings.listTasks(offboarding.organizationId, offboarding.id);
      return {
        id: offboarding.id,
        employmentId: offboarding.employmentId,
        status: offboarding.status,
        progress: progress(tasks),
        tasks: tasks
          .filter((task) => task.assigneeMembershipId === membership.id)
          .map(serializeTask)
      };
    }
    return this.serializeOwnerAdmin(offboarding);
  }

  private async serializeOwnerAdmin(offboarding: Offboarding) {
    const tasks = await this.offboardings.listTasks(offboarding.organizationId, offboarding.id);
    return {
      ...offboarding,
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

export function createPostgresOffboardingService(pool: pg.Pool) {
  return new OffboardingService(
    new PostgresCoreRepository(pool),
    new PostgresOffboardingRepository(pool),
    createOffboardingTransactionRunner(pool)
  );
}

function serializeTask(task: OffboardingTask) {
  return task;
}

function progress(tasks: OffboardingTask[]) {
  const eligible = tasks.filter((task) => task.isRequired && task.status !== "cancelled");
  const denominator = eligible.length;
  const numerator = eligible.filter((task) => task.status === "completed").length;
  return {
    numerator,
    denominator,
    percent: denominator === 0 ? 0 : Math.round((numerator / denominator) * 100)
  };
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
