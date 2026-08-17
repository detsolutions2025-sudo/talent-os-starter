import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Membership } from "../core/types";
import type {
  BeginEmploymentIdempotencyInput,
  EmploymentRepository
} from "../employments/repository";
import type {
  Employment,
  EmploymentApplicationContext,
  EmploymentCandidateContext,
  EmploymentIdempotencyKey,
  EmploymentProposalVersionContext,
  OrganizationPerson
} from "../employments/types";

export class PostgresEmploymentRepository implements EmploymentRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async beginIdempotency(input: BeginEmploymentIdempotencyInput) {
    const id = this.nextId("empidem");
    const now = this.now();
    const inserted = await this.connection.query(
      `
        INSERT INTO employment_idempotency_keys (
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
        FROM employment_idempotency_keys
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
        UPDATE employment_idempotency_keys
        SET status = 'completed', result_resource_id = $2, completed_at = $3
        WHERE id = $1
      `,
      [id, resultResourceId, this.now()]
    );
  }

  async markIdempotencyFailed(id: string, errorCategory: string) {
    await this.connection.query(
      `
        UPDATE employment_idempotency_keys
        SET status = 'failed', error_category = $2, failed_at = $3
        WHERE id = $1
      `,
      [id, errorCategory.slice(0, 100), this.now()]
    );
  }

  async findPersonById(personId: string) {
    const result = await this.connection.query("SELECT * FROM organization_people WHERE id = $1", [
      personId
    ]);
    return result.rows[0] ? mapPerson(result.rows[0]) : null;
  }

  async findPersonForUpdate(personId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_people WHERE id = $1 FOR UPDATE",
      [personId]
    );
    return result.rows[0] ? mapPerson(result.rows[0]) : null;
  }

  async findPersonByOriginCandidateForUpdate(organizationId: string, candidateId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organization_people
        WHERE organization_id = $1 AND origin_candidate_id = $2
        FOR UPDATE
      `,
      [organizationId, candidateId]
    );
    return result.rows[0] ? mapPerson(result.rows[0]) : null;
  }

  async createPerson(person: OrganizationPerson) {
    await this.connection.query(
      `
        INSERT INTO organization_people (
          id, organization_id, display_name, preferred_name, primary_email, origin_candidate_id,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      personParams(person)
    );
  }

  async listPeople(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organization_people
        WHERE organization_id = $1
        ORDER BY created_at DESC, id DESC
      `,
      [organizationId]
    );
    return result.rows.map(mapPerson);
  }

  async findEmploymentById(employmentId: string) {
    const result = await this.connection.query("SELECT * FROM employments WHERE id = $1", [
      employmentId
    ]);
    return result.rows[0] ? mapEmployment(result.rows[0]) : null;
  }

  async findEmploymentForUpdate(employmentId: string) {
    const result = await this.connection.query(
      "SELECT * FROM employments WHERE id = $1 FOR UPDATE",
      [employmentId]
    );
    return result.rows[0] ? mapEmployment(result.rows[0]) : null;
  }

  async listEmployments(organizationId: string, personId?: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM employments
        WHERE organization_id = $1
          AND ($2::text IS NULL OR organization_person_id = $2)
        ORDER BY created_at DESC, id DESC
      `,
      [organizationId, personId ?? null]
    );
    return result.rows.map(mapEmployment);
  }

  async listEmploymentsForPersonForUpdate(organizationId: string, personId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM employments
        WHERE organization_id = $1 AND organization_person_id = $2
        ORDER BY id ASC
        FOR UPDATE
      `,
      [organizationId, personId]
    );
    return result.rows.map(mapEmployment);
  }

  async createEmployment(employment: Employment) {
    await this.connection.query(
      `
        INSERT INTO employments (
          id, organization_id, organization_person_id, status, origin_type, origin_reason,
          origin_candidate_id, origin_candidate_application_id, origin_proposal_version_id,
          origin_job_opening_id, origin_job_opening_version_id, decision_at,
          effective_start_date, started_at, end_date, ended_at, end_reason, cancelled_at,
          cancellation_reason, created_by_user_id, activated_by_user_id, ended_by_user_id,
          cancelled_by_user_id, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25
        )
      `,
      employmentParams(employment)
    );
  }

  async updateEmployment(employment: Employment) {
    await this.connection.query(
      `
        UPDATE employments
        SET status = $4,
            origin_reason = $6,
            decision_at = $12,
            effective_start_date = $13,
            started_at = $14,
            end_date = $15,
            ended_at = $16,
            end_reason = $17,
            cancelled_at = $18,
            cancellation_reason = $19,
            activated_by_user_id = $21,
            ended_by_user_id = $22,
            cancelled_by_user_id = $23,
            updated_at = $25
        WHERE id = $1
          AND organization_id = $2
          AND organization_person_id = $3
          AND origin_type = $5
          AND origin_candidate_id IS NOT DISTINCT FROM $7
          AND origin_candidate_application_id IS NOT DISTINCT FROM $8
          AND origin_proposal_version_id IS NOT DISTINCT FROM $9
          AND origin_job_opening_id IS NOT DISTINCT FROM $10
          AND origin_job_opening_version_id IS NOT DISTINCT FROM $11
          AND created_by_user_id = $20
          AND created_at = $24
      `,
      employmentParams(employment)
    );
  }

  async findApplicationForUpdate(applicationId: string) {
    const result = await this.connection.query(
      `
        SELECT id, organization_id, candidate_id, job_opening_id, job_opening_version_id,
          application_status, finalized_at
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
      `
        SELECT id, organization_id, status, full_name, preferred_name, email
        FROM candidates
        WHERE id = $1
      `,
      [candidateId]
    );
    return result.rows[0] ? mapCandidate(result.rows[0]) : null;
  }

  async findProposalVersionForUpdate(proposalVersionId: string) {
    const result = await this.connection.query(
      `
        SELECT id, organization_id, candidate_application_id, candidate_id, job_opening_id,
          job_opening_version_id, status
        FROM proposal_versions
        WHERE id = $1
        FOR UPDATE
      `,
      [proposalVersionId]
    );
    return result.rows[0] ? mapProposalVersion(result.rows[0]) : null;
  }

  async findMembershipForUpdate(membershipId: string) {
    const result = await this.connection.query(
      "SELECT * FROM memberships WHERE id = $1 FOR UPDATE",
      [membershipId]
    );
    return result.rows[0] ? mapMembership(result.rows[0]) : null;
  }
}

function personParams(person: OrganizationPerson) {
  return [
    person.id,
    person.organizationId,
    person.displayName,
    person.preferredName,
    person.primaryEmail,
    person.originCandidateId,
    person.createdByUserId,
    person.updatedByUserId,
    person.createdAt,
    person.updatedAt
  ];
}

function employmentParams(employment: Employment) {
  return [
    employment.id,
    employment.organizationId,
    employment.organizationPersonId,
    employment.status,
    employment.originType,
    employment.originReason,
    employment.originCandidateId,
    employment.originCandidateApplicationId,
    employment.originProposalVersionId,
    employment.originJobOpeningId,
    employment.originJobOpeningVersionId,
    employment.decisionAt,
    employment.effectiveStartDate,
    employment.startedAt,
    employment.endDate,
    employment.endedAt,
    employment.endReason,
    employment.cancelledAt,
    employment.cancellationReason,
    employment.createdByUserId,
    employment.activatedByUserId,
    employment.endedByUserId,
    employment.cancelledByUserId,
    employment.createdAt,
    employment.updatedAt
  ];
}

function mapPerson(row: Record<string, unknown>): OrganizationPerson {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    displayName: String(row.display_name),
    preferredName: nullableString(row.preferred_name),
    primaryEmail: nullableString(row.primary_email),
    originCandidateId: nullableString(row.origin_candidate_id),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapEmployment(row: Record<string, unknown>): Employment {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    organizationPersonId: String(row.organization_person_id),
    status: row.status as Employment["status"],
    originType: row.origin_type as Employment["originType"],
    originReason: String(row.origin_reason),
    originCandidateId: nullableString(row.origin_candidate_id),
    originCandidateApplicationId: nullableString(row.origin_candidate_application_id),
    originProposalVersionId: nullableString(row.origin_proposal_version_id),
    originJobOpeningId: nullableString(row.origin_job_opening_id),
    originJobOpeningVersionId: nullableString(row.origin_job_opening_version_id),
    decisionAt: nullableIso(row.decision_at),
    effectiveStartDate: toDate(row.effective_start_date),
    startedAt: nullableIso(row.started_at),
    endDate: nullableDate(row.end_date),
    endedAt: nullableIso(row.ended_at),
    endReason: nullableString(row.end_reason),
    cancelledAt: nullableIso(row.cancelled_at),
    cancellationReason: nullableString(row.cancellation_reason),
    createdByUserId: String(row.created_by_user_id),
    activatedByUserId: nullableString(row.activated_by_user_id),
    endedByUserId: nullableString(row.ended_by_user_id),
    cancelledByUserId: nullableString(row.cancelled_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapIdempotency(row: Record<string, unknown>): EmploymentIdempotencyKey {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    operation: row.operation as EmploymentIdempotencyKey["operation"],
    scopeId: nullableString(row.scope_id),
    keyHash: String(row.key_hash),
    requestFingerprint: String(row.request_fingerprint),
    status: row.status as EmploymentIdempotencyKey["status"],
    resultResourceId: nullableString(row.result_resource_id),
    errorCategory: nullableString(row.error_category),
    createdAt: toIso(row.created_at),
    completedAt: nullableIso(row.completed_at),
    failedAt: nullableIso(row.failed_at)
  };
}

function mapApplication(row: Record<string, unknown>): EmploymentApplicationContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateId: String(row.candidate_id),
    jobOpeningId: String(row.job_opening_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    applicationStatus: row.application_status as EmploymentApplicationContext["applicationStatus"],
    finalizedAt: nullableIso(row.finalized_at)
  };
}

function mapCandidate(row: Record<string, unknown>): EmploymentCandidateContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: row.status as EmploymentCandidateContext["status"],
    fullName: String(row.full_name),
    preferredName: nullableString(row.preferred_name),
    email: nullableString(row.email)
  };
}

function mapProposalVersion(row: Record<string, unknown>): EmploymentProposalVersionContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateApplicationId: String(row.candidate_application_id),
    candidateId: String(row.candidate_id),
    jobOpeningId: String(row.job_opening_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    status: String(row.status)
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
  return value === null || value === undefined ? null : toDate(value);
}

function toDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
