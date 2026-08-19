import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Membership } from "../core/types";
import type {
  BeginOffboardingIdempotencyInput,
  OffboardingRepository
} from "../offboardings/repository";
import type {
  Offboarding,
  OffboardingEmploymentEligibility,
  OffboardingIdempotencyKey,
  OffboardingTask
} from "../offboardings/types";

export class PostgresOffboardingRepository implements OffboardingRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async beginIdempotency(input: BeginOffboardingIdempotencyInput) {
    const id = this.nextId("offbidem");
    const now = this.now();
    const inserted = await this.connection.query(
      `
        INSERT INTO offboarding_idempotency_keys (
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
        FROM offboarding_idempotency_keys
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
        UPDATE offboarding_idempotency_keys
        SET status = 'completed', result_resource_id = $2, completed_at = $3
        WHERE id = $1
      `,
      [id, resultResourceId, this.now()]
    );
  }

  async markIdempotencyFailed(id: string, failureCategory: string) {
    await this.connection.query(
      `
        UPDATE offboarding_idempotency_keys
        SET status = 'failed', failure_category = $2, failed_at = $3
        WHERE id = $1
      `,
      [id, failureCategory.slice(0, 100), this.now()]
    );
  }

  // SPEC-026 s8/s14.2: FOR SHARE, nunca FOR UPDATE -- Offboarding nunca escreve em
  // `employments`, apenas trava a linha para impedir que o estado mude por baixo da
  // operacao em curso (mesmo padrao de `findEmploymentForEligibility`, development-retention).
  async findEmploymentForEligibility(
    employmentId: string
  ): Promise<OffboardingEmploymentEligibility | null> {
    const result = await this.connection.query(
      "SELECT id, organization_id, status FROM employments WHERE id = $1 FOR SHARE",
      [employmentId]
    );
    return result.rows[0] ? mapEmploymentEligibility(result.rows[0]) : null;
  }

  async findOffboardingById(offboardingId: string) {
    const result = await this.connection.query("SELECT * FROM offboardings WHERE id = $1", [
      offboardingId
    ]);
    return result.rows[0] ? mapOffboarding(result.rows[0]) : null;
  }

  async findOffboardingForUpdate(offboardingId: string) {
    const result = await this.connection.query(
      "SELECT * FROM offboardings WHERE id = $1 FOR UPDATE",
      [offboardingId]
    );
    return result.rows[0] ? mapOffboarding(result.rows[0]) : null;
  }

  async listOffboardingsForEmployment(organizationId: string, employmentId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM offboardings
        WHERE organization_id = $1 AND employment_id = $2
        ORDER BY created_at DESC, id DESC
      `,
      [organizationId, employmentId]
    );
    return result.rows.map(mapOffboarding);
  }

  async createOffboarding(offboarding: Offboarding) {
    await this.connection.query(
      `
        INSERT INTO offboardings (
          id, organization_id, employment_id, status, exit_category, expected_last_day,
          created_by_user_id, started_at, started_by_user_id, completed_at, completed_by_user_id,
          cancelled_at, cancelled_by_user_id, cancellation_reason, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `,
      offboardingParams(offboarding)
    );
  }

  async updateOffboarding(offboarding: Offboarding) {
    await this.connection.query(
      `
        UPDATE offboardings
        SET status = $4,
            exit_category = $5,
            expected_last_day = $6,
            started_at = $8,
            started_by_user_id = $9,
            completed_at = $10,
            completed_by_user_id = $11,
            cancelled_at = $12,
            cancelled_by_user_id = $13,
            cancellation_reason = $14,
            updated_at = $16
        WHERE id = $1
          AND organization_id = $2
          AND employment_id = $3
          AND created_by_user_id = $7
          AND created_at = $15
      `,
      offboardingParams(offboarding)
    );
  }

  async createTask(task: OffboardingTask) {
    await this.connection.query(
      `
        INSERT INTO offboarding_tasks (
          id, organization_id, offboarding_id, title, description, is_required, status,
          assignee_membership_id, due_at, display_order, creation_reason, created_by_user_id,
          completed_at, completed_by_membership_id, completed_by_user_id, cancelled_at,
          cancelled_by_user_id, cancellation_reason, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )
      `,
      taskParams(task)
    );
  }

  async updateTask(task: OffboardingTask) {
    await this.connection.query(
      `
        UPDATE offboarding_tasks
        SET title = $4,
            description = $5,
            is_required = $6,
            status = $7,
            assignee_membership_id = $8,
            due_at = $9,
            display_order = $10,
            creation_reason = $11,
            completed_at = $13,
            completed_by_membership_id = $14,
            completed_by_user_id = $15,
            cancelled_at = $16,
            cancelled_by_user_id = $17,
            cancellation_reason = $18,
            updated_at = $20
        WHERE id = $1
          AND organization_id = $2
          AND offboarding_id = $3
          AND created_by_user_id = $12
          AND created_at = $19
      `,
      taskParams(task)
    );
  }

  async findTaskForUpdate(taskId: string) {
    const result = await this.connection.query(
      "SELECT * FROM offboarding_tasks WHERE id = $1 FOR UPDATE",
      [taskId]
    );
    return result.rows[0] ? mapTask(result.rows[0]) : null;
  }

  async listTasks(organizationId: string, offboardingId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM offboarding_tasks
        WHERE organization_id = $1 AND offboarding_id = $2
        ORDER BY display_order ASC NULLS LAST, created_at ASC, id ASC
      `,
      [organizationId, offboardingId]
    );
    return result.rows.map(mapTask);
  }

  async listTasksForUpdate(organizationId: string, offboardingId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM offboarding_tasks
        WHERE organization_id = $1 AND offboarding_id = $2
        ORDER BY id ASC
        FOR UPDATE
      `,
      [organizationId, offboardingId]
    );
    return result.rows.map(mapTask);
  }

  async listTasksForMembership(organizationId: string, membershipId: string) {
    const result = await this.connection.query(
      `
        SELECT t.*
        FROM offboarding_tasks t
        JOIN offboardings o
          ON o.organization_id = t.organization_id
         AND o.id = t.offboarding_id
        WHERE t.organization_id = $1
          AND t.assignee_membership_id = $2
          AND o.status IN ('draft', 'in_progress')
        ORDER BY t.due_at ASC NULLS LAST, t.created_at ASC, t.id ASC
      `,
      [organizationId, membershipId]
    );
    return result.rows.map(mapTask);
  }

  async findMembershipForUpdate(membershipId: string) {
    const result = await this.connection.query(
      "SELECT * FROM memberships WHERE id = $1 FOR UPDATE",
      [membershipId]
    );
    return result.rows[0] ? mapMembership(result.rows[0]) : null;
  }

  async listOffboardings(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM offboardings WHERE organization_id = $1 ORDER BY created_at DESC, id DESC",
      [organizationId]
    );
    return result.rows.map(mapOffboarding);
  }
}

function offboardingParams(offboarding: Offboarding) {
  return [
    offboarding.id,
    offboarding.organizationId,
    offboarding.employmentId,
    offboarding.status,
    offboarding.exitCategory,
    offboarding.expectedLastDay,
    offboarding.createdByUserId,
    offboarding.startedAt,
    offboarding.startedByUserId,
    offboarding.completedAt,
    offboarding.completedByUserId,
    offboarding.cancelledAt,
    offboarding.cancelledByUserId,
    offboarding.cancellationReason,
    offboarding.createdAt,
    offboarding.updatedAt
  ];
}

function taskParams(task: OffboardingTask) {
  return [
    task.id,
    task.organizationId,
    task.offboardingId,
    task.title,
    task.description,
    task.isRequired,
    task.status,
    task.assigneeMembershipId,
    task.dueAt,
    task.displayOrder,
    task.creationReason,
    task.createdByUserId,
    task.completedAt,
    task.completedByMembershipId,
    task.completedByUserId,
    task.cancelledAt,
    task.cancelledByUserId,
    task.cancellationReason,
    task.createdAt,
    task.updatedAt
  ];
}

function mapOffboarding(row: Record<string, unknown>): Offboarding {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    employmentId: String(row.employment_id),
    status: row.status as Offboarding["status"],
    exitCategory: nullableString(row.exit_category) as Offboarding["exitCategory"],
    expectedLastDay: nullableDate(row.expected_last_day),
    createdByUserId: String(row.created_by_user_id),
    startedAt: nullableIso(row.started_at),
    startedByUserId: nullableString(row.started_by_user_id),
    completedAt: nullableIso(row.completed_at),
    completedByUserId: nullableString(row.completed_by_user_id),
    cancelledAt: nullableIso(row.cancelled_at),
    cancelledByUserId: nullableString(row.cancelled_by_user_id),
    cancellationReason: nullableString(row.cancellation_reason),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapTask(row: Record<string, unknown>): OffboardingTask {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    offboardingId: String(row.offboarding_id),
    title: String(row.title),
    description: nullableString(row.description),
    isRequired: Boolean(row.is_required),
    status: row.status as OffboardingTask["status"],
    assigneeMembershipId: nullableString(row.assignee_membership_id),
    dueAt: nullableIso(row.due_at),
    displayOrder: row.display_order === null ? null : Number(row.display_order),
    creationReason: nullableString(row.creation_reason),
    createdByUserId: String(row.created_by_user_id),
    completedAt: nullableIso(row.completed_at),
    completedByMembershipId: nullableString(row.completed_by_membership_id),
    completedByUserId: nullableString(row.completed_by_user_id),
    cancelledAt: nullableIso(row.cancelled_at),
    cancelledByUserId: nullableString(row.cancelled_by_user_id),
    cancellationReason: nullableString(row.cancellation_reason),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapIdempotency(row: Record<string, unknown>): OffboardingIdempotencyKey {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    operation: row.operation as OffboardingIdempotencyKey["operation"],
    scopeId: nullableString(row.scope_id),
    keyHash: String(row.key_hash),
    requestFingerprint: String(row.request_fingerprint),
    status: row.status as OffboardingIdempotencyKey["status"],
    resultResourceId: nullableString(row.result_resource_id),
    failureCategory: nullableString(row.failure_category),
    createdAt: toIso(row.created_at),
    completedAt: nullableIso(row.completed_at),
    failedAt: nullableIso(row.failed_at)
  };
}

function mapEmploymentEligibility(row: Record<string, unknown>): OffboardingEmploymentEligibility {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: row.status as OffboardingEmploymentEligibility["status"]
  };
}

function mapMembership(row: Record<string, unknown>): Membership {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    role: row.role as Membership["role"],
    status: row.status as Membership["status"],
    joinedAt: toIso(row.joined_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
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
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
