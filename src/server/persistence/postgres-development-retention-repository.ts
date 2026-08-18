import { randomUUID } from "node:crypto";
import type pg from "pg";
import type {
  BeginDevelopmentRetentionIdempotencyInput,
  DevelopmentRetentionRepository
} from "../development-retention/repository";
import type {
  DevelopmentCheckIn,
  DevelopmentGoal,
  DevelopmentPlan,
  DevelopmentRetentionIdempotencyKey,
  EmploymentEligibilityContext,
  RetentionAction,
  RetentionConcern
} from "../development-retention/types";

export class PostgresDevelopmentRetentionRepository implements DevelopmentRetentionRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async beginIdempotency(input: BeginDevelopmentRetentionIdempotencyInput) {
    const id = this.nextId("devretidem");
    const now = this.now();
    const inserted = await this.connection.query(
      `
        INSERT INTO development_retention_idempotency_keys (
          id, organization_id, operation, scope_id, key_hash, request_fingerprint, status,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
        ON CONFLICT (organization_id, operation, scope_id, key_hash) DO NOTHING
        RETURNING *
      `,
      [
        id,
        input.organizationId,
        input.operation,
        input.scopeId,
        input.keyHash,
        input.requestFingerprint,
        now
      ]
    );
    if (inserted.rows[0]) {
      return { created: true, idempotency: mapIdempotency(inserted.rows[0]) };
    }
    const existing = await this.connection.query(
      `
        SELECT *
        FROM development_retention_idempotency_keys
        WHERE organization_id = $1
          AND operation = $2
          AND scope_id IS NOT DISTINCT FROM $3
          AND key_hash = $4
        FOR UPDATE
      `,
      [input.organizationId, input.operation, input.scopeId, input.keyHash]
    );
    return { created: false, idempotency: mapIdempotency(existing.rows[0]) };
  }

  async markIdempotencyCompleted(id: string, resultResourceId: string) {
    await this.connection.query(
      `
        UPDATE development_retention_idempotency_keys
        SET status = 'completed', result_resource_id = $2, completed_at = $3
        WHERE id = $1
      `,
      [id, resultResourceId, this.now()]
    );
  }

  async markIdempotencyFailed(id: string, errorCategory: string) {
    await this.connection.query(
      `
        UPDATE development_retention_idempotency_keys
        SET status = 'failed', error_category = $2, failed_at = $3
        WHERE id = $1
      `,
      [id, errorCategory.slice(0, 100), this.now()]
    );
  }

  async findEmploymentForEligibility(employmentId: string) {
    const result = await this.connection.query(
      "SELECT id, organization_id, status FROM employments WHERE id = $1 FOR SHARE",
      [employmentId]
    );
    return result.rows[0] ? mapEmploymentEligibility(result.rows[0]) : null;
  }

  async findPlanById(planId: string) {
    const result = await this.connection.query("SELECT * FROM development_plans WHERE id = $1", [
      planId
    ]);
    return result.rows[0] ? mapPlan(result.rows[0]) : null;
  }

  async findPlanForUpdate(planId: string) {
    const result = await this.connection.query(
      "SELECT * FROM development_plans WHERE id = $1 FOR UPDATE",
      [planId]
    );
    return result.rows[0] ? mapPlan(result.rows[0]) : null;
  }

  async listPlans(organizationId: string, employmentId?: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM development_plans
        WHERE organization_id = $1
          AND ($2::text IS NULL OR employment_id = $2)
        ORDER BY created_at DESC, id DESC
      `,
      [organizationId, employmentId ?? null]
    );
    return result.rows.map(mapPlan);
  }

  async createPlan(plan: DevelopmentPlan) {
    await this.connection.query(
      `
        INSERT INTO development_plans (
          id, organization_id, employment_id, title, purpose, status,
          assignee_membership_id, created_by_membership_id, activated_by_membership_id,
          completed_by_membership_id, cancelled_by_membership_id, created_at, activated_at,
          completed_at, cancelled_at, cancel_reason, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `,
      planParams(plan)
    );
  }

  async updatePlan(plan: DevelopmentPlan) {
    await this.connection.query(
      `
        UPDATE development_plans
        SET status = $6,
            activated_by_membership_id = $9,
            completed_by_membership_id = $10,
            cancelled_by_membership_id = $11,
            activated_at = $13,
            completed_at = $14,
            cancelled_at = $15,
            cancel_reason = $16,
            updated_at = $17
        WHERE id = $1
          AND organization_id = $2
          AND employment_id = $3
          AND title = $4
          AND purpose IS NOT DISTINCT FROM $5
          AND assignee_membership_id IS NOT DISTINCT FROM $7
          AND created_by_membership_id = $8
          AND created_at = $12
      `,
      planParams(plan)
    );
  }

  async findGoalById(goalId: string) {
    const result = await this.connection.query("SELECT * FROM development_goals WHERE id = $1", [
      goalId
    ]);
    return result.rows[0] ? mapGoal(result.rows[0]) : null;
  }

  async findGoalForUpdate(goalId: string) {
    const result = await this.connection.query(
      "SELECT * FROM development_goals WHERE id = $1 FOR UPDATE",
      [goalId]
    );
    return result.rows[0] ? mapGoal(result.rows[0]) : null;
  }

  async listGoalsForPlan(organizationId: string, planId: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM development_goals
        WHERE organization_id = $1 AND development_plan_id = $2
        ORDER BY created_at ASC, id ASC
      `,
      [organizationId, planId]
    );
    return result.rows.map(mapGoal);
  }

  async listGoalsForPlanForUpdate(organizationId: string, planId: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM development_goals
        WHERE organization_id = $1 AND development_plan_id = $2
        ORDER BY id ASC
        FOR UPDATE
      `,
      [organizationId, planId]
    );
    return result.rows.map(mapGoal);
  }

  async createGoal(goal: DevelopmentGoal) {
    await this.connection.query(
      `
        INSERT INTO development_goals (
          id, organization_id, employment_id, development_plan_id, title, description,
          due_date, status, created_by_membership_id, completed_by_membership_id,
          cancelled_by_membership_id, cancel_reason, created_at, completed_at, cancelled_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `,
      goalParams(goal)
    );
  }

  async updateGoal(goal: DevelopmentGoal) {
    await this.connection.query(
      `
        UPDATE development_goals
        SET status = $8,
            completed_by_membership_id = $10,
            cancelled_by_membership_id = $11,
            cancel_reason = $12,
            completed_at = $14,
            cancelled_at = $15,
            updated_at = $16
        WHERE id = $1
          AND organization_id = $2
          AND employment_id = $3
          AND development_plan_id = $4
          AND title = $5
          AND description IS NOT DISTINCT FROM $6
          AND due_date IS NOT DISTINCT FROM $7
          AND created_by_membership_id = $9
          AND created_at = $13
      `,
      goalParams(goal)
    );
  }

  async findCheckInById(checkInId: string) {
    const result = await this.connection.query("SELECT * FROM development_checkins WHERE id = $1", [
      checkInId
    ]);
    return result.rows[0] ? mapCheckIn(result.rows[0]) : null;
  }

  async listCheckInsForPlan(organizationId: string, planId: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM development_checkins
        WHERE organization_id = $1 AND development_plan_id = $2
        ORDER BY submitted_at ASC
      `,
      [organizationId, planId]
    );
    return result.rows.map(mapCheckIn);
  }

  async createCheckIn(checkIn: DevelopmentCheckIn) {
    await this.connection.query(
      `
        INSERT INTO development_checkins (
          id, organization_id, employment_id, development_plan_id, summary, visibility,
          submitted_by_membership_id, submitted_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        checkIn.id,
        checkIn.organizationId,
        checkIn.employmentId,
        checkIn.developmentPlanId,
        checkIn.summary,
        checkIn.visibility,
        checkIn.submittedByMembershipId,
        checkIn.submittedAt,
        checkIn.createdAt
      ]
    );
  }

  async findConcernById(concernId: string) {
    const result = await this.connection.query("SELECT * FROM retention_concerns WHERE id = $1", [
      concernId
    ]);
    return result.rows[0] ? mapConcern(result.rows[0]) : null;
  }

  async findConcernForUpdate(concernId: string) {
    const result = await this.connection.query(
      "SELECT * FROM retention_concerns WHERE id = $1 FOR UPDATE",
      [concernId]
    );
    return result.rows[0] ? mapConcern(result.rows[0]) : null;
  }

  async listConcerns(organizationId: string, employmentId?: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM retention_concerns
        WHERE organization_id = $1
          AND ($2::text IS NULL OR employment_id = $2)
        ORDER BY created_at DESC, id DESC
      `,
      [organizationId, employmentId ?? null]
    );
    return result.rows.map(mapConcern);
  }

  async createConcern(concern: RetentionConcern) {
    await this.connection.query(
      `
        INSERT INTO retention_concerns (
          id, organization_id, employment_id, source, category, description, status,
          visibility, created_by_membership_id, resolved_by_membership_id,
          cancelled_by_membership_id, resolution_summary, cancel_reason, created_at,
          resolved_at, cancelled_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `,
      concernParams(concern)
    );
  }

  async updateConcern(concern: RetentionConcern) {
    await this.connection.query(
      `
        UPDATE retention_concerns
        SET status = $7,
            resolved_by_membership_id = $10,
            cancelled_by_membership_id = $11,
            resolution_summary = $12,
            cancel_reason = $13,
            resolved_at = $15,
            cancelled_at = $16,
            updated_at = $17
        WHERE id = $1
          AND organization_id = $2
          AND employment_id = $3
          AND source = $4
          AND category = $5
          AND description = $6
          AND visibility = $8
          AND created_by_membership_id = $9
          AND created_at = $14
      `,
      concernParams(concern)
    );
  }

  async findActionById(actionId: string) {
    const result = await this.connection.query("SELECT * FROM retention_actions WHERE id = $1", [
      actionId
    ]);
    return result.rows[0] ? mapAction(result.rows[0]) : null;
  }

  async findActionForUpdate(actionId: string) {
    const result = await this.connection.query(
      "SELECT * FROM retention_actions WHERE id = $1 FOR UPDATE",
      [actionId]
    );
    return result.rows[0] ? mapAction(result.rows[0]) : null;
  }

  async listActions(organizationId: string, employmentId?: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM retention_actions
        WHERE organization_id = $1
          AND ($2::text IS NULL OR employment_id = $2)
        ORDER BY created_at DESC, id DESC
      `,
      [organizationId, employmentId ?? null]
    );
    return result.rows.map(mapAction);
  }

  async createAction(action: RetentionAction) {
    await this.connection.query(
      `
        INSERT INTO retention_actions (
          id, organization_id, employment_id, retention_concern_id, action_type, description,
          status, created_by_membership_id, completed_by_membership_id,
          cancelled_by_membership_id, cancel_reason, created_at, completed_at, cancelled_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `,
      actionParams(action)
    );
  }

  async updateAction(action: RetentionAction) {
    await this.connection.query(
      `
        UPDATE retention_actions
        SET status = $7,
            completed_by_membership_id = $9,
            cancelled_by_membership_id = $10,
            cancel_reason = $11,
            completed_at = $13,
            cancelled_at = $14,
            updated_at = $15
        WHERE id = $1
          AND organization_id = $2
          AND employment_id = $3
          AND retention_concern_id IS NOT DISTINCT FROM $4
          AND action_type = $5
          AND description = $6
          AND created_by_membership_id = $8
          AND created_at = $12
      `,
      actionParams(action)
    );
  }
}

function planParams(plan: DevelopmentPlan) {
  return [
    plan.id,
    plan.organizationId,
    plan.employmentId,
    plan.title,
    plan.purpose,
    plan.status,
    plan.assigneeMembershipId,
    plan.createdByMembershipId,
    plan.activatedByMembershipId,
    plan.completedByMembershipId,
    plan.cancelledByMembershipId,
    plan.createdAt,
    plan.activatedAt,
    plan.completedAt,
    plan.cancelledAt,
    plan.cancelReason,
    plan.updatedAt
  ];
}

function goalParams(goal: DevelopmentGoal) {
  return [
    goal.id,
    goal.organizationId,
    goal.employmentId,
    goal.developmentPlanId,
    goal.title,
    goal.description,
    goal.dueDate,
    goal.status,
    goal.createdByMembershipId,
    goal.completedByMembershipId,
    goal.cancelledByMembershipId,
    goal.cancelReason,
    goal.createdAt,
    goal.completedAt,
    goal.cancelledAt,
    goal.updatedAt
  ];
}

function concernParams(concern: RetentionConcern) {
  return [
    concern.id,
    concern.organizationId,
    concern.employmentId,
    concern.source,
    concern.category,
    concern.description,
    concern.status,
    concern.visibility,
    concern.createdByMembershipId,
    concern.resolvedByMembershipId,
    concern.cancelledByMembershipId,
    concern.resolutionSummary,
    concern.cancelReason,
    concern.createdAt,
    concern.resolvedAt,
    concern.cancelledAt,
    concern.updatedAt
  ];
}

function actionParams(action: RetentionAction) {
  return [
    action.id,
    action.organizationId,
    action.employmentId,
    action.retentionConcernId,
    action.actionType,
    action.description,
    action.status,
    action.createdByMembershipId,
    action.completedByMembershipId,
    action.cancelledByMembershipId,
    action.cancelReason,
    action.createdAt,
    action.completedAt,
    action.cancelledAt,
    action.updatedAt
  ];
}

function mapPlan(row: Record<string, unknown>): DevelopmentPlan {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    employmentId: String(row.employment_id),
    title: String(row.title),
    purpose: nullableString(row.purpose),
    status: row.status as DevelopmentPlan["status"],
    assigneeMembershipId: nullableString(row.assignee_membership_id),
    createdByMembershipId: String(row.created_by_membership_id),
    activatedByMembershipId: nullableString(row.activated_by_membership_id),
    completedByMembershipId: nullableString(row.completed_by_membership_id),
    cancelledByMembershipId: nullableString(row.cancelled_by_membership_id),
    createdAt: toIso(row.created_at),
    activatedAt: nullableIso(row.activated_at),
    completedAt: nullableIso(row.completed_at),
    cancelledAt: nullableIso(row.cancelled_at),
    cancelReason: nullableString(row.cancel_reason),
    updatedAt: toIso(row.updated_at)
  };
}

function mapGoal(row: Record<string, unknown>): DevelopmentGoal {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    employmentId: String(row.employment_id),
    developmentPlanId: String(row.development_plan_id),
    title: String(row.title),
    description: nullableString(row.description),
    dueDate: nullableDate(row.due_date),
    status: row.status as DevelopmentGoal["status"],
    createdByMembershipId: String(row.created_by_membership_id),
    completedByMembershipId: nullableString(row.completed_by_membership_id),
    cancelledByMembershipId: nullableString(row.cancelled_by_membership_id),
    cancelReason: nullableString(row.cancel_reason),
    createdAt: toIso(row.created_at),
    completedAt: nullableIso(row.completed_at),
    cancelledAt: nullableIso(row.cancelled_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapCheckIn(row: Record<string, unknown>): DevelopmentCheckIn {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    employmentId: String(row.employment_id),
    developmentPlanId: String(row.development_plan_id),
    summary: String(row.summary),
    visibility: row.visibility as DevelopmentCheckIn["visibility"],
    submittedByMembershipId: String(row.submitted_by_membership_id),
    submittedAt: toIso(row.submitted_at),
    createdAt: toIso(row.created_at)
  };
}

function mapConcern(row: Record<string, unknown>): RetentionConcern {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    employmentId: String(row.employment_id),
    source: row.source as RetentionConcern["source"],
    category: row.category as RetentionConcern["category"],
    description: String(row.description),
    status: row.status as RetentionConcern["status"],
    visibility: row.visibility as RetentionConcern["visibility"],
    createdByMembershipId: String(row.created_by_membership_id),
    resolvedByMembershipId: nullableString(row.resolved_by_membership_id),
    cancelledByMembershipId: nullableString(row.cancelled_by_membership_id),
    resolutionSummary: nullableString(row.resolution_summary),
    cancelReason: nullableString(row.cancel_reason),
    createdAt: toIso(row.created_at),
    resolvedAt: nullableIso(row.resolved_at),
    cancelledAt: nullableIso(row.cancelled_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapAction(row: Record<string, unknown>): RetentionAction {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    employmentId: String(row.employment_id),
    retentionConcernId: nullableString(row.retention_concern_id),
    actionType: row.action_type as RetentionAction["actionType"],
    description: String(row.description),
    status: row.status as RetentionAction["status"],
    createdByMembershipId: String(row.created_by_membership_id),
    completedByMembershipId: nullableString(row.completed_by_membership_id),
    cancelledByMembershipId: nullableString(row.cancelled_by_membership_id),
    cancelReason: nullableString(row.cancel_reason),
    createdAt: toIso(row.created_at),
    completedAt: nullableIso(row.completed_at),
    cancelledAt: nullableIso(row.cancelled_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapIdempotency(row: Record<string, unknown>): DevelopmentRetentionIdempotencyKey {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    operation: row.operation as DevelopmentRetentionIdempotencyKey["operation"],
    scopeId: nullableString(row.scope_id),
    keyHash: String(row.key_hash),
    requestFingerprint: String(row.request_fingerprint),
    status: row.status as DevelopmentRetentionIdempotencyKey["status"],
    resultResourceId: nullableString(row.result_resource_id),
    errorCategory: nullableString(row.error_category),
    createdAt: toIso(row.created_at),
    completedAt: nullableIso(row.completed_at),
    failedAt: nullableIso(row.failed_at)
  };
}

function mapEmploymentEligibility(row: Record<string, unknown>): EmploymentEligibilityContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: row.status as EmploymentEligibilityContext["status"]
  };
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function nullableIso(value: unknown) {
  return value === null || value === undefined ? null : toIso(value);
}

function nullableDate(value: unknown) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
