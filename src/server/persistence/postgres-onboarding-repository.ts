import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Membership } from "../core/types";
import type {
  BeginOnboardingIdempotencyInput,
  OnboardingRepository
} from "../onboardings/repository";
import type {
  HiredProposalReference,
  Onboarding,
  OnboardingApplicationContext,
  OnboardingCandidateContext,
  OnboardingIdempotencyKey,
  OnboardingTask
} from "../onboardings/types";

export class PostgresOnboardingRepository implements OnboardingRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async beginIdempotency(input: BeginOnboardingIdempotencyInput) {
    const id = this.nextId("onbidem");
    const now = this.now();
    const inserted = await this.connection.query(
      `
        INSERT INTO onboarding_idempotency_keys (
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
        FROM onboarding_idempotency_keys
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
        UPDATE onboarding_idempotency_keys
        SET status = 'completed', result_resource_id = $2, completed_at = $3
        WHERE id = $1
      `,
      [id, resultResourceId, this.now()]
    );
  }

  async markIdempotencyFailed(id: string, failureCategory: string) {
    await this.connection.query(
      `
        UPDATE onboarding_idempotency_keys
        SET status = 'failed', failure_category = $2, failed_at = $3
        WHERE id = $1
      `,
      [id, failureCategory.slice(0, 100), this.now()]
    );
  }

  async findApplicationForUpdate(applicationId: string) {
    const result = await this.connection.query(
      `
        SELECT id, organization_id, candidate_id, application_status, current_stage
        FROM candidate_applications
        WHERE id = $1
        FOR UPDATE
      `,
      [applicationId]
    );
    return result.rows[0] ? mapApplication(result.rows[0]) : null;
  }

  async findCandidate(candidateId: string) {
    const result = await this.connection.query(
      "SELECT id, organization_id, status FROM candidates WHERE id = $1",
      [candidateId]
    );
    return result.rows[0] ? mapCandidate(result.rows[0]) : null;
  }

  async findHiredProposalReference(
    organizationId: string,
    candidateApplicationId: string
  ): Promise<HiredProposalReference> {
    const result = await this.connection.query(
      `
        SELECT DISTINCT proposal_version_id
        FROM candidate_application_events
        WHERE organization_id = $1
          AND candidate_application_id = $2
          AND event_type = 'hired'
          AND proposal_version_id IS NOT NULL
      `,
      [organizationId, candidateApplicationId]
    );
    const ids = result.rows.map((row) => String(row.proposal_version_id));
    return {
      proposalVersionId: ids.length === 1 ? ids[0] : null,
      conflicting: ids.length > 1
    };
  }

  async acceptedProposalVersionExists(
    organizationId: string,
    candidateApplicationId: string,
    proposalVersionId: string
  ) {
    const result = await this.connection.query(
      `
        SELECT 1
        FROM proposal_versions
        WHERE organization_id = $1
          AND candidate_application_id = $2
          AND id = $3
          AND status = 'accepted'
      `,
      [organizationId, candidateApplicationId, proposalVersionId]
    );
    return Boolean(result.rows[0]);
  }

  async findOnboardingByApplication(organizationId: string, candidateApplicationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM onboardings WHERE organization_id = $1 AND candidate_application_id = $2",
      [organizationId, candidateApplicationId]
    );
    return result.rows[0] ? mapOnboarding(result.rows[0]) : null;
  }

  async findOnboardingById(onboardingId: string) {
    const result = await this.connection.query("SELECT * FROM onboardings WHERE id = $1", [
      onboardingId
    ]);
    return result.rows[0] ? mapOnboarding(result.rows[0]) : null;
  }

  async findOnboardingForUpdate(onboardingId: string) {
    const result = await this.connection.query(
      "SELECT * FROM onboardings WHERE id = $1 FOR UPDATE",
      [onboardingId]
    );
    return result.rows[0] ? mapOnboarding(result.rows[0]) : null;
  }

  async createOnboarding(onboarding: Onboarding) {
    await this.connection.query(
      `
        INSERT INTO onboardings (
          id, organization_id, candidate_application_id, candidate_id, status,
          expected_person_start_date, created_by_user_id, started_at, started_by_user_id,
          completed_at, completed_by_user_id, cancelled_at, cancelled_by_user_id,
          cancellation_reason, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `,
      onboardingParams(onboarding)
    );
  }

  async updateOnboarding(onboarding: Onboarding) {
    await this.connection.query(
      `
        UPDATE onboardings
        SET status = $5,
            expected_person_start_date = $6,
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
          AND candidate_application_id = $3
          AND candidate_id = $4
          AND created_by_user_id = $7
          AND created_at = $15
      `,
      onboardingParams(onboarding)
    );
  }

  async createTask(task: OnboardingTask) {
    await this.connection.query(
      `
        INSERT INTO onboarding_tasks (
          id, organization_id, onboarding_id, title, description, is_required, status,
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

  async updateTask(task: OnboardingTask) {
    await this.connection.query(
      `
        UPDATE onboarding_tasks
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
          AND onboarding_id = $3
          AND created_by_user_id = $12
          AND created_at = $19
      `,
      taskParams(task)
    );
  }

  async findTaskForUpdate(taskId: string) {
    const result = await this.connection.query(
      "SELECT * FROM onboarding_tasks WHERE id = $1 FOR UPDATE",
      [taskId]
    );
    return result.rows[0] ? mapTask(result.rows[0]) : null;
  }

  async listTasks(organizationId: string, onboardingId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM onboarding_tasks
        WHERE organization_id = $1 AND onboarding_id = $2
        ORDER BY display_order ASC NULLS LAST, created_at ASC, id ASC
      `,
      [organizationId, onboardingId]
    );
    return result.rows.map(mapTask);
  }

  async listTasksForUpdate(organizationId: string, onboardingId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM onboarding_tasks
        WHERE organization_id = $1 AND onboarding_id = $2
        ORDER BY id ASC
        FOR UPDATE
      `,
      [organizationId, onboardingId]
    );
    return result.rows.map(mapTask);
  }

  async listTasksForMembership(organizationId: string, membershipId: string) {
    const result = await this.connection.query(
      `
        SELECT t.*
        FROM onboarding_tasks t
        JOIN onboardings o
          ON o.organization_id = t.organization_id
         AND o.id = t.onboarding_id
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

  async listOnboardings(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM onboardings WHERE organization_id = $1 ORDER BY created_at DESC, id DESC",
      [organizationId]
    );
    return result.rows.map(mapOnboarding);
  }
}

function onboardingParams(onboarding: Onboarding) {
  return [
    onboarding.id,
    onboarding.organizationId,
    onboarding.candidateApplicationId,
    onboarding.candidateId,
    onboarding.status,
    onboarding.expectedPersonStartDate,
    onboarding.createdByUserId,
    onboarding.startedAt,
    onboarding.startedByUserId,
    onboarding.completedAt,
    onboarding.completedByUserId,
    onboarding.cancelledAt,
    onboarding.cancelledByUserId,
    onboarding.cancellationReason,
    onboarding.createdAt,
    onboarding.updatedAt
  ];
}

function taskParams(task: OnboardingTask) {
  return [
    task.id,
    task.organizationId,
    task.onboardingId,
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

function mapOnboarding(row: Record<string, unknown>): Onboarding {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateApplicationId: String(row.candidate_application_id),
    candidateId: String(row.candidate_id),
    status: row.status as Onboarding["status"],
    expectedPersonStartDate: nullableDate(row.expected_person_start_date),
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

function mapTask(row: Record<string, unknown>): OnboardingTask {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    onboardingId: String(row.onboarding_id),
    title: String(row.title),
    description: nullableString(row.description),
    isRequired: Boolean(row.is_required),
    status: row.status as OnboardingTask["status"],
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

function mapIdempotency(row: Record<string, unknown>): OnboardingIdempotencyKey {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    operation: row.operation as OnboardingIdempotencyKey["operation"],
    scopeId: nullableString(row.scope_id),
    keyHash: String(row.key_hash),
    requestFingerprint: String(row.request_fingerprint),
    status: row.status as OnboardingIdempotencyKey["status"],
    resultResourceId: nullableString(row.result_resource_id),
    failureCategory: nullableString(row.failure_category),
    createdAt: toIso(row.created_at),
    completedAt: nullableIso(row.completed_at),
    failedAt: nullableIso(row.failed_at)
  };
}

function mapApplication(row: Record<string, unknown>): OnboardingApplicationContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateId: String(row.candidate_id),
    applicationStatus: row.application_status as OnboardingApplicationContext["applicationStatus"],
    currentStage: row.current_stage as OnboardingApplicationContext["currentStage"]
  };
}

function mapCandidate(row: Record<string, unknown>): OnboardingCandidateContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: row.status as OnboardingCandidateContext["status"]
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
