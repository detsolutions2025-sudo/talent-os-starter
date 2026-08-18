import { createHash } from "node:crypto";
import type pg from "pg";
import { fingerprint } from "../core/canonical-hash";
import { conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, Membership, MembershipRole } from "../core/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresDevelopmentRetentionRepository } from "../persistence/postgres-development-retention-repository";
import type { DevelopmentRetentionRepository } from "./repository";
import {
  createDevelopmentRetentionTransactionRunner,
  type DevelopmentRetentionTransaction,
  type DevelopmentRetentionTransactionRunner
} from "./transaction";
import type {
  DevelopmentCheckIn,
  DevelopmentCheckInCreateInput,
  DevelopmentGoal,
  DevelopmentGoalCancelInput,
  DevelopmentGoalCreateInput,
  DevelopmentPlan,
  DevelopmentPlanCancelInput,
  DevelopmentPlanCreateInput,
  DevelopmentRetentionAdminReadInput,
  DevelopmentRetentionIdempotencyOperation,
  RetentionAction,
  RetentionActionCancelInput,
  RetentionActionCreateInput,
  RetentionConcern,
  RetentionConcernCancelInput,
  RetentionConcernCreateInput,
  RetentionConcernResolveInput
} from "./types";
import {
  reasonHash,
  validateAdminReason,
  validateCancelActionInput,
  validateCancelConcernInput,
  validateCancelGoalInput,
  validateCancelPlanInput,
  validateCreateActionInput,
  validateCreateCheckInInput,
  validateCreateConcernInput,
  validateCreateGoalInput,
  validateCreatePlanInput,
  validateIdempotencyKey,
  validateResolveConcernInput
} from "./validation";

type IdempotentResult<T> = T & { idempotentReplay?: boolean };

// Fase 25 (SPEC-017 v1.0). Employment e o aggregate root operacional obrigatorio -- nenhuma
// entidade desta classe existe, e nenhuma mutacao ocorre, sem revalidar Employment `active`
// dentro da mesma transacao (SPEC-017 s4). Este service nunca ativa, encerra, cancela ou
// reabre Employment -- essa fronteira pertence exclusivamente a Fase 24 (SPEC-025).
export class DevelopmentRetentionService {
  constructor(
    private readonly core: CoreRepository,
    private readonly repo: DevelopmentRetentionRepository,
    private readonly runTransaction: DevelopmentRetentionTransactionRunner
  ) {}

  // -----------------------------------------------------------------------------------
  // DevelopmentPlan
  // -----------------------------------------------------------------------------------

  async createPlan(
    actor: Actor,
    organizationId: string,
    employmentId: string,
    input: DevelopmentPlanCreateInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = await this.validateOrAuditMassAssignment(actor, organizationId, () =>
      validateCreatePlanInput(input)
    );
    const { membership } = await this.authorizeManage(actor, organizationId);
    return this.withIdempotency(
      organizationId,
      "create_plan",
      employmentId,
      idempotencyKeyRaw,
      {
        operation: "create_plan",
        employmentId,
        titleHash: sha256Hex(normalized.title),
        purposeHash: sha256Hex(normalized.purpose),
        assigneeMembershipId: normalized.assigneeMembershipId
      },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const employment = await service.requireActiveEmployment(organizationId, employmentId);
          await service.repo.listPlans(organizationId, employment.id);
          if (normalized.assigneeMembershipId) {
            await service.requireMembershipInOrganization(
              organizationId,
              normalized.assigneeMembershipId
            );
          }
          const now = service.repo.now();
          const plan: DevelopmentPlan = {
            id: service.repo.nextId("devplan"),
            organizationId,
            employmentId: employment.id,
            title: normalized.title,
            purpose: normalized.purpose,
            status: "draft",
            assigneeMembershipId: normalized.assigneeMembershipId,
            createdByMembershipId: membership.id,
            activatedByMembershipId: null,
            completedByMembershipId: null,
            cancelledByMembershipId: null,
            createdAt: now,
            activatedAt: null,
            completedAt: null,
            cancelledAt: null,
            cancelReason: null,
            updatedAt: now
          };
          await service.repo.createPlan(plan);
          await service.audit(actor, organizationId, "development_plan.created", {
            developmentPlanId: plan.id,
            employmentId: plan.employmentId
          });
          return plan;
        })
    );
  }

  async activatePlan(
    actor: Actor,
    organizationId: string,
    planId: string,
    idempotencyKeyRaw: unknown
  ) {
    const { membership } = await this.authorizeManage(actor, organizationId);
    return this.withIdempotency(
      organizationId,
      "activate_plan",
      planId,
      idempotencyKeyRaw,
      { operation: "activate_plan", planId },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const plan = await service.lockPlan(organizationId, planId);
          await service.requireActiveEmployment(organizationId, plan.employmentId);
          if (plan.status !== "draft") {
            throw conflict(
              "development_plan_activate_invalid_state",
              "Only draft plan can activate."
            );
          }
          const now = service.repo.now();
          const updated: DevelopmentPlan = {
            ...plan,
            status: "active",
            activatedAt: now,
            activatedByMembershipId: membership.id,
            updatedAt: now
          };
          await service.repo.updatePlan(updated);
          await service.audit(actor, organizationId, "development_plan.activated", {
            developmentPlanId: updated.id
          });
          return updated;
        })
    );
  }

  async completePlan(
    actor: Actor,
    organizationId: string,
    planId: string,
    idempotencyKeyRaw: unknown
  ) {
    const { membership } = await this.authorizeManage(actor, organizationId);
    return this.withIdempotency(
      organizationId,
      "complete_plan",
      planId,
      idempotencyKeyRaw,
      { operation: "complete_plan", planId },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const plan = await service.lockPlan(organizationId, planId);
          await service.requireActiveEmployment(organizationId, plan.employmentId);
          if (plan.status !== "active") {
            throw conflict(
              "development_plan_complete_invalid_state",
              "Only active plan can complete."
            );
          }
          const goals = await service.repo.listGoalsForPlanForUpdate(organizationId, plan.id);
          if (goals.some((goal) => goal.status === "open")) {
            throw conflict(
              "development_plan_complete_open_goals",
              "All goals must be in a final state before completing the plan."
            );
          }
          const now = service.repo.now();
          const updated: DevelopmentPlan = {
            ...plan,
            status: "completed",
            completedAt: now,
            completedByMembershipId: membership.id,
            updatedAt: now
          };
          await service.repo.updatePlan(updated);
          await service.audit(actor, organizationId, "development_plan.completed", {
            developmentPlanId: updated.id
          });
          return updated;
        })
    );
  }

  async cancelPlan(
    actor: Actor,
    organizationId: string,
    planId: string,
    input: DevelopmentPlanCancelInput,
    idempotencyKeyRaw: unknown
  ) {
    const reason = await this.validateOrAuditMassAssignment(actor, organizationId, () =>
      validateCancelPlanInput(input)
    );
    const { membership } = await this.authorizeManage(actor, organizationId);
    return this.withIdempotency(
      organizationId,
      "cancel_plan",
      planId,
      idempotencyKeyRaw,
      { operation: "cancel_plan", planId, reasonHash: reasonHash(reason) },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const plan = await service.lockPlan(organizationId, planId);
          await service.requireActiveEmployment(organizationId, plan.employmentId);
          if (plan.status !== "draft" && plan.status !== "active") {
            throw conflict(
              "development_plan_cancel_invalid_state",
              "Only a non-final plan can cancel."
            );
          }
          const now = service.repo.now();
          const updated: DevelopmentPlan = {
            ...plan,
            status: "cancelled",
            cancelledAt: now,
            cancelledByMembershipId: membership.id,
            cancelReason: reason,
            updatedAt: now
          };
          await service.repo.updatePlan(updated);
          await service.audit(actor, organizationId, "development_plan.cancelled", {
            developmentPlanId: updated.id
          });
          return updated;
        })
    );
  }

  async getPlan(actor: Actor, organizationId: string, planId: string) {
    const { role, membership } = await this.authorizeRead(actor, organizationId);
    const plan = await this.findPlanInOrganization(actor, organizationId, planId);
    this.assertPlanReadable(role, membership, plan);
    const goals = await this.repo.listGoalsForPlan(organizationId, plan.id);
    const checkIns = await this.repo.listCheckInsForPlan(organizationId, plan.id);
    // check-ins tem visibilidade propria (SPEC-017 s8): owner/admin sempre veem tudo; member
    // (ja confirmado como assignee do plano por assertPlanReadable) so ve os marcados
    // explicitamente como visiveis para o assignee.
    const visibleCheckIns =
      role === "owner" || role === "admin"
        ? checkIns
        : checkIns.filter((checkIn) => checkIn.visibility === "owner_admin_and_assignee");
    return { ...plan, goals, checkIns: visibleCheckIns };
  }

  async listPlans(actor: Actor, organizationId: string, employmentId?: string) {
    const { role, membership } = await this.authorizeRead(actor, organizationId);
    const plans = await this.repo.listPlans(organizationId, employmentId);
    return plans.filter((plan) => this.canRoleReadPlan(role, membership, plan));
  }

  // -----------------------------------------------------------------------------------
  // DevelopmentGoal
  // -----------------------------------------------------------------------------------

  async createGoal(
    actor: Actor,
    organizationId: string,
    planId: string,
    input: DevelopmentGoalCreateInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = await this.validateOrAuditMassAssignment(actor, organizationId, () =>
      validateCreateGoalInput(input)
    );
    const { role, membership } = await this.authorizeMutateAsManagerOrMember(actor, organizationId);
    const plan = await this.findPlanInOrganization(actor, organizationId, planId);
    this.assertManageOrPlanAssignee(role, membership, plan);
    return this.withIdempotency(
      organizationId,
      "create_goal",
      planId,
      idempotencyKeyRaw,
      {
        operation: "create_goal",
        planId,
        titleHash: sha256Hex(normalized.title),
        descriptionHash: sha256Hex(normalized.description),
        dueDate: normalized.dueDate
      },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const lockedPlan = await service.lockPlan(organizationId, planId);
          await service.requireActiveEmployment(organizationId, lockedPlan.employmentId);
          if (lockedPlan.status !== "draft" && lockedPlan.status !== "active") {
            throw conflict("development_goal_plan_final", "Plan is no longer open for goals.");
          }
          const now = service.repo.now();
          const goal: DevelopmentGoal = {
            id: service.repo.nextId("devgoal"),
            organizationId,
            employmentId: lockedPlan.employmentId,
            developmentPlanId: lockedPlan.id,
            title: normalized.title,
            description: normalized.description,
            dueDate: normalized.dueDate,
            status: "open",
            createdByMembershipId: membership.id,
            completedByMembershipId: null,
            cancelledByMembershipId: null,
            cancelReason: null,
            createdAt: now,
            completedAt: null,
            cancelledAt: null,
            updatedAt: now
          };
          await service.repo.createGoal(goal);
          await service.audit(actor, organizationId, "development_goal.created", {
            developmentGoalId: goal.id,
            developmentPlanId: goal.developmentPlanId
          });
          return goal;
        })
    );
  }

  async completeGoal(
    actor: Actor,
    organizationId: string,
    goalId: string,
    idempotencyKeyRaw: unknown
  ) {
    const { role, membership } = await this.authorizeMutateAsManagerOrMember(actor, organizationId);
    const goal = await this.findGoalInOrganization(actor, organizationId, goalId);
    const plan = await this.findPlanInOrganization(actor, organizationId, goal.developmentPlanId);
    this.assertManageOrPlanAssignee(role, membership, plan);
    return this.withIdempotency(
      organizationId,
      "complete_goal",
      goalId,
      idempotencyKeyRaw,
      { operation: "complete_goal", goalId },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const lockedGoal = await service.lockGoal(organizationId, goalId);
          await service.requireActiveEmployment(organizationId, lockedGoal.employmentId);
          if (lockedGoal.status !== "open") {
            throw conflict(
              "development_goal_complete_invalid_state",
              "Only open goal can complete."
            );
          }
          const now = service.repo.now();
          const updated: DevelopmentGoal = {
            ...lockedGoal,
            status: "completed",
            completedAt: now,
            completedByMembershipId: membership.id,
            updatedAt: now
          };
          await service.repo.updateGoal(updated);
          await service.audit(actor, organizationId, "development_goal.completed", {
            developmentGoalId: updated.id
          });
          return updated;
        })
    );
  }

  async cancelGoal(
    actor: Actor,
    organizationId: string,
    goalId: string,
    input: DevelopmentGoalCancelInput,
    idempotencyKeyRaw: unknown
  ) {
    const reason = await this.validateOrAuditMassAssignment(actor, organizationId, () =>
      validateCancelGoalInput(input)
    );
    const { role, membership } = await this.authorizeMutateAsManagerOrMember(actor, organizationId);
    const goal = await this.findGoalInOrganization(actor, organizationId, goalId);
    const plan = await this.findPlanInOrganization(actor, organizationId, goal.developmentPlanId);
    this.assertManageOrPlanAssignee(role, membership, plan);
    return this.withIdempotency(
      organizationId,
      "cancel_goal",
      goalId,
      idempotencyKeyRaw,
      { operation: "cancel_goal", goalId, reasonHash: reasonHash(reason) },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const lockedGoal = await service.lockGoal(organizationId, goalId);
          await service.requireActiveEmployment(organizationId, lockedGoal.employmentId);
          if (lockedGoal.status !== "open") {
            throw conflict("development_goal_cancel_invalid_state", "Only open goal can cancel.");
          }
          const now = service.repo.now();
          const updated: DevelopmentGoal = {
            ...lockedGoal,
            status: "cancelled",
            cancelledAt: now,
            cancelledByMembershipId: membership.id,
            cancelReason: reason,
            updatedAt: now
          };
          await service.repo.updateGoal(updated);
          await service.audit(actor, organizationId, "development_goal.cancelled", {
            developmentGoalId: updated.id
          });
          return updated;
        })
    );
  }

  // -----------------------------------------------------------------------------------
  // DevelopmentCheckIn (append-only; nunca editado apos submissao)
  // -----------------------------------------------------------------------------------

  async createCheckIn(
    actor: Actor,
    organizationId: string,
    planId: string,
    input: DevelopmentCheckInCreateInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = await this.validateOrAuditMassAssignment(actor, organizationId, () =>
      validateCreateCheckInInput(input)
    );
    const { role, membership } = await this.authorizeMutateAsManagerOrMember(actor, organizationId);
    const plan = await this.findPlanInOrganization(actor, organizationId, planId);
    this.assertManageOrPlanAssignee(role, membership, plan);
    return this.withIdempotency(
      organizationId,
      "create_checkin",
      planId,
      idempotencyKeyRaw,
      {
        operation: "create_checkin",
        planId,
        summaryHash: sha256Hex(normalized.summary),
        visibility: normalized.visibility
      },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const lockedPlan = await service.lockPlan(organizationId, planId);
          await service.requireActiveEmployment(organizationId, lockedPlan.employmentId);
          if (lockedPlan.status !== "active") {
            throw conflict(
              "development_checkin_plan_not_active",
              "Plan must be active for a check-in."
            );
          }
          const now = service.repo.now();
          const checkIn: DevelopmentCheckIn = {
            id: service.repo.nextId("devcheckin"),
            organizationId,
            employmentId: lockedPlan.employmentId,
            developmentPlanId: lockedPlan.id,
            summary: normalized.summary,
            visibility: normalized.visibility,
            submittedByMembershipId: membership.id,
            submittedAt: now,
            createdAt: now
          };
          await service.repo.createCheckIn(checkIn);
          await service.audit(actor, organizationId, "development_checkin.created", {
            developmentCheckinId: checkIn.id,
            developmentPlanId: checkIn.developmentPlanId
          });
          return checkIn;
        })
    );
  }

  // -----------------------------------------------------------------------------------
  // RetentionConcern (somente owner/admin -- nunca automatico, nunca member)
  // -----------------------------------------------------------------------------------

  async createConcern(
    actor: Actor,
    organizationId: string,
    employmentId: string,
    input: RetentionConcernCreateInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = await this.validateOrAuditMassAssignment(actor, organizationId, () =>
      validateCreateConcernInput(input)
    );
    const { membership } = await this.authorizeManage(actor, organizationId);
    return this.withIdempotency(
      organizationId,
      "create_concern",
      employmentId,
      idempotencyKeyRaw,
      {
        operation: "create_concern",
        employmentId,
        source: normalized.source,
        category: normalized.category,
        descriptionHash: sha256Hex(normalized.description),
        visibility: normalized.visibility
      },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const employment = await service.requireActiveEmployment(organizationId, employmentId);
          const now = service.repo.now();
          const concern: RetentionConcern = {
            id: service.repo.nextId("retconcern"),
            organizationId,
            employmentId: employment.id,
            source: normalized.source,
            category: normalized.category,
            description: normalized.description,
            status: "open",
            visibility: normalized.visibility,
            createdByMembershipId: membership.id,
            resolvedByMembershipId: null,
            cancelledByMembershipId: null,
            resolutionSummary: null,
            cancelReason: null,
            createdAt: now,
            resolvedAt: null,
            cancelledAt: null,
            updatedAt: now
          };
          await service.repo.createConcern(concern);
          await service.audit(actor, organizationId, "retention_concern.created", {
            retentionConcernId: concern.id,
            employmentId: concern.employmentId,
            source: concern.source,
            category: concern.category
          });
          return concern;
        })
    );
  }

  async resolveConcern(
    actor: Actor,
    organizationId: string,
    concernId: string,
    input: RetentionConcernResolveInput,
    idempotencyKeyRaw: unknown
  ) {
    const resolutionSummary = await this.validateOrAuditMassAssignment(actor, organizationId, () =>
      validateResolveConcernInput(input)
    );
    const { membership } = await this.authorizeManage(actor, organizationId);
    return this.withIdempotency(
      organizationId,
      "resolve_concern",
      concernId,
      idempotencyKeyRaw,
      {
        operation: "resolve_concern",
        concernId,
        resolutionSummaryHash: reasonHash(resolutionSummary)
      },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const concern = await service.lockConcern(organizationId, concernId);
          if (concern.status !== "open") {
            throw conflict(
              "retention_concern_resolve_invalid_state",
              "Only open concern can resolve."
            );
          }
          const now = service.repo.now();
          const updated: RetentionConcern = {
            ...concern,
            status: "resolved",
            resolvedAt: now,
            resolvedByMembershipId: membership.id,
            resolutionSummary,
            updatedAt: now
          };
          await service.repo.updateConcern(updated);
          await service.audit(actor, organizationId, "retention_concern.resolved", {
            retentionConcernId: updated.id
          });
          return updated;
        })
    );
  }

  async cancelConcern(
    actor: Actor,
    organizationId: string,
    concernId: string,
    input: RetentionConcernCancelInput,
    idempotencyKeyRaw: unknown
  ) {
    const reason = await this.validateOrAuditMassAssignment(actor, organizationId, () =>
      validateCancelConcernInput(input)
    );
    const { membership } = await this.authorizeManage(actor, organizationId);
    return this.withIdempotency(
      organizationId,
      "cancel_concern",
      concernId,
      idempotencyKeyRaw,
      { operation: "cancel_concern", concernId, reasonHash: reasonHash(reason) },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const concern = await service.lockConcern(organizationId, concernId);
          if (concern.status !== "open") {
            throw conflict(
              "retention_concern_cancel_invalid_state",
              "Only open concern can cancel."
            );
          }
          const now = service.repo.now();
          const updated: RetentionConcern = {
            ...concern,
            status: "cancelled",
            cancelledAt: now,
            cancelledByMembershipId: membership.id,
            cancelReason: reason,
            updatedAt: now
          };
          await service.repo.updateConcern(updated);
          await service.audit(actor, organizationId, "retention_concern.cancelled", {
            retentionConcernId: updated.id
          });
          return updated;
        })
    );
  }

  async listConcerns(actor: Actor, organizationId: string, employmentId?: string) {
    await this.authorizeManageRead(actor, organizationId);
    return this.repo.listConcerns(organizationId, employmentId);
  }

  // -----------------------------------------------------------------------------------
  // RetentionAction (somente owner/admin)
  // -----------------------------------------------------------------------------------

  async createAction(
    actor: Actor,
    organizationId: string,
    employmentId: string,
    input: RetentionActionCreateInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = await this.validateOrAuditMassAssignment(actor, organizationId, () =>
      validateCreateActionInput(input)
    );
    const { membership } = await this.authorizeManage(actor, organizationId);
    return this.withIdempotency(
      organizationId,
      "create_action",
      normalized.retentionConcernId ?? employmentId,
      idempotencyKeyRaw,
      {
        operation: "create_action",
        employmentId,
        retentionConcernId: normalized.retentionConcernId,
        actionType: normalized.actionType,
        descriptionHash: sha256Hex(normalized.description)
      },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const employment = await service.requireActiveEmployment(organizationId, employmentId);
          if (normalized.retentionConcernId) {
            const concern = await service.repo.findConcernForUpdate(normalized.retentionConcernId);
            if (
              !concern ||
              concern.organizationId !== organizationId ||
              concern.employmentId !== employment.id
            ) {
              await service.auditDenied(
                actor,
                organizationId,
                "development_retention.cross_tenant_access_denied",
                "retention_concern_mismatch",
                { retentionConcernId: normalized.retentionConcernId }
              );
              throw notFound("retention_concern_not_found", "Retention concern not found.");
            }
            if (concern.status !== "open") {
              throw conflict("retention_action_concern_final", "Concern is no longer open.");
            }
          }
          const now = service.repo.now();
          const action: RetentionAction = {
            id: service.repo.nextId("retaction"),
            organizationId,
            employmentId: employment.id,
            retentionConcernId: normalized.retentionConcernId,
            actionType: normalized.actionType,
            description: normalized.description,
            status: "open",
            createdByMembershipId: membership.id,
            completedByMembershipId: null,
            cancelledByMembershipId: null,
            cancelReason: null,
            createdAt: now,
            completedAt: null,
            cancelledAt: null,
            updatedAt: now
          };
          await service.repo.createAction(action);
          await service.audit(actor, organizationId, "retention_action.created", {
            retentionActionId: action.id,
            employmentId: action.employmentId,
            actionType: action.actionType,
            hasConcern: String(Boolean(action.retentionConcernId))
          });
          return action;
        })
    );
  }

  async completeAction(
    actor: Actor,
    organizationId: string,
    actionId: string,
    idempotencyKeyRaw: unknown
  ) {
    const { membership } = await this.authorizeManage(actor, organizationId);
    return this.withIdempotency(
      organizationId,
      "complete_action",
      actionId,
      idempotencyKeyRaw,
      { operation: "complete_action", actionId },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const action = await service.lockAction(organizationId, actionId);
          if (action.status !== "open") {
            throw conflict(
              "retention_action_complete_invalid_state",
              "Only open action can complete."
            );
          }
          const now = service.repo.now();
          const updated: RetentionAction = {
            ...action,
            status: "completed",
            completedAt: now,
            completedByMembershipId: membership.id,
            updatedAt: now
          };
          await service.repo.updateAction(updated);
          await service.audit(actor, organizationId, "retention_action.completed", {
            retentionActionId: updated.id
          });
          return updated;
        })
    );
  }

  async cancelAction(
    actor: Actor,
    organizationId: string,
    actionId: string,
    input: RetentionActionCancelInput,
    idempotencyKeyRaw: unknown
  ) {
    const reason = await this.validateOrAuditMassAssignment(actor, organizationId, () =>
      validateCancelActionInput(input)
    );
    const { membership } = await this.authorizeManage(actor, organizationId);
    return this.withIdempotency(
      organizationId,
      "cancel_action",
      actionId,
      idempotencyKeyRaw,
      { operation: "cancel_action", actionId, reasonHash: reasonHash(reason) },
      actor,
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          const action = await service.lockAction(organizationId, actionId);
          if (action.status !== "open") {
            throw conflict("retention_action_cancel_invalid_state", "Only open action can cancel.");
          }
          const now = service.repo.now();
          const updated: RetentionAction = {
            ...action,
            status: "cancelled",
            cancelledAt: now,
            cancelledByMembershipId: membership.id,
            cancelReason: reason,
            updatedAt: now
          };
          await service.repo.updateAction(updated);
          await service.audit(actor, organizationId, "retention_action.cancelled", {
            retentionActionId: updated.id
          });
          return updated;
        })
    );
  }

  async listActions(actor: Actor, organizationId: string, employmentId?: string) {
    await this.authorizeManageRead(actor, organizationId);
    return this.repo.listActions(organizationId, employmentId);
  }

  // -----------------------------------------------------------------------------------
  // Platform Admin admin-read (minimizado, motivo obrigatorio, zero mutacao)
  // -----------------------------------------------------------------------------------

  async adminRead(actor: Actor, organizationId: string, input: DevelopmentRetentionAdminReadInput) {
    const reason = await this.validateOrAuditMassAssignment(actor, organizationId, () =>
      validateAdminReason(input)
    );
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) throw notFound("organization_not_found", "Organization not found.");
    const [plans, concerns, actions] = await Promise.all([
      this.repo.listPlans(organizationId),
      this.repo.listConcerns(organizationId),
      this.repo.listActions(organizationId)
    ]);
    await this.audit(actor, organizationId, "development_retention.admin_read", {
      reason,
      planCount: String(plans.length),
      concernCount: String(concerns.length),
      actionCount: String(actions.length)
    });
    return {
      plans: plans.map((plan) => ({
        id: plan.id,
        organizationId: plan.organizationId,
        employmentId: plan.employmentId,
        status: plan.status,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt
      })),
      concerns: concerns.map((concern) => ({
        id: concern.id,
        organizationId: concern.organizationId,
        employmentId: concern.employmentId,
        status: concern.status,
        createdAt: concern.createdAt,
        updatedAt: concern.updatedAt
      })),
      actions: actions.map((action) => ({
        id: action.id,
        organizationId: action.organizationId,
        employmentId: action.employmentId,
        status: action.status,
        createdAt: action.createdAt,
        updatedAt: action.updatedAt
      }))
    };
  }

  // -----------------------------------------------------------------------------------
  // Idempotencia (mesmo padrao de src/server/employments/service.ts)
  // -----------------------------------------------------------------------------------

  private async withIdempotency<T extends { id?: string }>(
    organizationId: string,
    operation: DevelopmentRetentionIdempotencyOperation,
    scopeId: string | null,
    rawKey: unknown,
    payload: Record<string, unknown>,
    actor: Actor,
    callback: () => Promise<T>
  ): Promise<IdempotentResult<T>> {
    const keyHash = createHash("sha256").update(validateIdempotencyKey(rawKey)).digest("hex");
    const requestFingerprint = fingerprint(payload);
    const begin = await this.repo.beginIdempotency({
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
          "development_retention.idempotency_conflict",
          "fingerprint_conflict"
        );
        throw conflict(
          "development_retention_idempotency_conflict",
          "Idempotency-Key was used differently."
        );
      }
      if (existing.status === "pending") {
        throw conflict(
          "development_retention_idempotency_in_progress",
          "Request is already being processed."
        );
      }
      if (existing.status === "failed") {
        throw conflict(
          "development_retention_idempotency_failed",
          "Use a new Idempotency-Key to retry."
        );
      }
      const resource = existing.resultResourceId
        ? await this.resourceByOperation(operation, existing.resultResourceId)
        : null;
      if (!resource) {
        throw conflict(
          "development_retention_idempotency_result_unavailable",
          "Idempotent result is unavailable."
        );
      }
      return { ...(resource as unknown as T), idempotentReplay: true };
    }
    try {
      const result = await callback();
      await this.repo.markIdempotencyCompleted(begin.idempotency.id, String(result.id));
      return result;
    } catch (error) {
      await this.repo.markIdempotencyFailed(begin.idempotency.id, errorCode(error));
      // SPEC-017 s25/s26 (via correcao ja aplicada na Fase 24): corrida real de banco
      // (deadlock, serializacao, lock ou unique violation relevante, ver transaction.ts)
      // deve ser auditada como concurrent_operation_conflict, nunca apenas convertida em 409
      // silenciosamente.
      if (errorCode(error) === "development_retention_concurrent_change") {
        await this.auditDenied(
          actor,
          organizationId,
          "development_retention.concurrent_operation_conflict",
          "concurrent_operation_conflict"
        );
      }
      throw error;
    }
  }

  private async resourceByOperation(
    operation: DevelopmentRetentionIdempotencyOperation,
    resourceId: string
  ) {
    switch (operation) {
      case "create_plan":
      case "activate_plan":
      case "complete_plan":
      case "cancel_plan":
        return this.repo.findPlanById(resourceId);
      case "create_goal":
      case "complete_goal":
      case "cancel_goal":
        return this.repo.findGoalById(resourceId);
      case "create_checkin":
        return this.repo.findCheckInById(resourceId);
      case "create_concern":
      case "resolve_concern":
      case "cancel_concern":
        return this.repo.findConcernById(resourceId);
      case "create_action":
      case "complete_action":
      case "cancel_action":
        return this.repo.findActionById(resourceId);
      default:
        return null;
    }
  }

  // -----------------------------------------------------------------------------------
  // Employment eligibility (SPEC-017 s4): revalidado dentro de toda transacao de mutacao.
  // FOR SHARE -- nunca escreve Employment, apenas impede que ele mude de status por baixo
  // desta transacao (ver transaction.ts / plano tecnico "lock order").
  // -----------------------------------------------------------------------------------

  private async requireActiveEmployment(organizationId: string, employmentId: string) {
    const employment = await this.repo.findEmploymentForEligibility(employmentId);
    if (!employment || employment.organizationId !== organizationId) {
      throw notFound("employment_not_found", "Employment not found.");
    }
    if (employment.status !== "active") {
      throw conflict(
        "development_retention_employment_not_active",
        "Employment must be active for this operation."
      );
    }
    return employment;
  }

  private async requireMembershipInOrganization(organizationId: string, membershipId: string) {
    const membership = await this.core.findMembershipById(membershipId);
    if (
      !membership ||
      membership.organizationId !== organizationId ||
      membership.status !== "active"
    ) {
      throw notFound("membership_not_found", "Membership not found.");
    }
    return membership;
  }

  // -----------------------------------------------------------------------------------
  // RBAC
  // -----------------------------------------------------------------------------------

  // owner/admin apenas, bloqueia Organization archived -- usado por toda mutacao de
  // Plan/Concern/Action.
  private async authorizeManage(actor: Actor, organizationId: string) {
    return this.authorize(actor, organizationId, ["owner", "admin"], false);
  }

  // owner/admin apenas, permite leitura mesmo com Organization archived (SPEC-017 s19) --
  // usado por listagens administrativas (listConcerns/listActions).
  private async authorizeManageRead(actor: Actor, organizationId: string) {
    return this.authorize(actor, organizationId, ["owner", "admin"], true);
  }

  // owner/admin/member, permite leitura mesmo com Organization archived -- usado apenas por
  // leituras genuinas (getPlan/listPlans). A distincao fina entre member autorizado e nao
  // autorizado e feita depois, por assertPlanReadable, comparando com
  // development_plans.assignee_membership_id.
  private async authorizeRead(actor: Actor, organizationId: string) {
    return this.authorize(actor, organizationId, ["owner", "admin", "member"], true);
  }

  // owner/admin/member, bloqueia Organization archived -- usado como porta de entrada das
  // mutacoes de Goal/CheckIn, cuja autorizacao fina (owner/admin ou assignee do plano) e
  // aplicada depois por assertManageOrPlanAssignee.
  private async authorizeMutateAsManagerOrMember(actor: Actor, organizationId: string) {
    return this.authorize(actor, organizationId, ["owner", "admin", "member"], false);
  }

  private async authorize(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[],
    allowArchivedRead: boolean
  ) {
    if (actor.kind === "platform") {
      await this.auditDenied(
        actor,
        organizationId,
        "development_retention.permission_denied",
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
        "development_retention.permission_denied",
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
        "development_retention.cross_tenant_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }
    if (!allowedRoles.includes(membership.role)) {
      await this.auditDenied(
        actor,
        organizationId,
        "development_retention.permission_denied",
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }
    return { role: membership.role, membership };
  }

  private assertManageOrPlanAssignee(
    role: MembershipRole,
    membership: Membership,
    plan: DevelopmentPlan
  ) {
    if (role === "owner" || role === "admin") return;
    if (role === "member" && plan.assigneeMembershipId === membership.id) return;
    throw forbidden("permission_denied", "Permission denied.");
  }

  private canRoleReadPlan(role: MembershipRole, membership: Membership, plan: DevelopmentPlan) {
    if (role === "owner" || role === "admin") return true;
    return role === "member" && plan.assigneeMembershipId === membership.id;
  }

  private assertPlanReadable(role: MembershipRole, membership: Membership, plan: DevelopmentPlan) {
    if (!this.canRoleReadPlan(role, membership, plan)) {
      throw forbidden("permission_denied", "Permission denied.");
    }
  }

  // -----------------------------------------------------------------------------------
  // Lookups (IDOR: encontrar por id sem filtro de organizacao e depois validar posse --
  // mesmo padrao de src/server/employments/service.ts, erro sempre generico 404).
  // -----------------------------------------------------------------------------------

  private async findPlanInOrganization(actor: Actor, organizationId: string, planId: string) {
    const plan = await this.repo.findPlanById(planId);
    if (!plan || plan.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "development_retention.cross_tenant_access_denied",
        "development_plan_mismatch",
        { developmentPlanId: planId }
      );
      throw notFound("development_plan_not_found", "Development plan not found.");
    }
    return plan;
  }

  private async findGoalInOrganization(actor: Actor, organizationId: string, goalId: string) {
    const goal = await this.repo.findGoalById(goalId);
    if (!goal || goal.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "development_retention.cross_tenant_access_denied",
        "development_goal_mismatch",
        { developmentGoalId: goalId }
      );
      throw notFound("development_goal_not_found", "Development goal not found.");
    }
    return goal;
  }

  private async lockPlan(organizationId: string, planId: string) {
    const plan = await this.repo.findPlanForUpdate(planId);
    if (!plan || plan.organizationId !== organizationId) {
      throw notFound("development_plan_not_found", "Development plan not found.");
    }
    return plan;
  }

  private async lockGoal(organizationId: string, goalId: string) {
    const goal = await this.repo.findGoalForUpdate(goalId);
    if (!goal || goal.organizationId !== organizationId) {
      throw notFound("development_goal_not_found", "Development goal not found.");
    }
    return goal;
  }

  private async lockConcern(organizationId: string, concernId: string) {
    const concern = await this.repo.findConcernForUpdate(concernId);
    if (!concern || concern.organizationId !== organizationId) {
      throw notFound("retention_concern_not_found", "Retention concern not found.");
    }
    return concern;
  }

  private async lockAction(organizationId: string, actionId: string) {
    const action = await this.repo.findActionForUpdate(actionId);
    if (!action || action.organizationId !== organizationId) {
      throw notFound("retention_action_not_found", "Retention action not found.");
    }
    return action;
  }

  private scoped(tx: DevelopmentRetentionTransaction) {
    return new DevelopmentRetentionService(tx.core, tx.developmentRetention, this.runTransaction);
  }

  // SPEC-017 s28: `development_retention.mass_assignment_denied` e evento de auditoria
  // obrigatorio -- a rejeicao em si ja acontece em validation.ts (`ensureAllowedKeys`, 400 antes
  // de qualquer logica de negocio), mas esse ponto de entrada nunca tinha acesso a `core` para
  // auditar. Este wrapper envolve cada `validateXInput(input)` de payload, audita quando o
  // motivo e exatamente campo desconhecido, e sempre relanca o erro original inalterado.
  private async validateOrAuditMassAssignment<T>(
    actor: Actor,
    organizationId: string,
    validate: () => T
  ): Promise<T> {
    try {
      return validate();
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "development_retention_unknown_field"
      ) {
        await this.auditDenied(
          actor,
          organizationId,
          "development_retention.mass_assignment_denied",
          "unknown_field"
        );
      }
      throw error;
    }
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

export function createPostgresDevelopmentRetentionService(pool: pg.Pool) {
  return new DevelopmentRetentionService(
    new PostgresCoreRepository(pool),
    new PostgresDevelopmentRetentionRepository(pool),
    createDevelopmentRetentionTransactionRunner(pool)
  );
}

function sha256Hex(value: string | null) {
  return value === null ? null : createHash("sha256").update(value).digest("hex");
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "unexpected_error";
}
