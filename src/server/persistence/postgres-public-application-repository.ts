import { randomUUID } from "node:crypto";
import type pg from "pg";
import type {
  BeginSubmissionInput,
  BeginSubmissionResult,
  PublicApplicationRepository
} from "../public-applications/repository";
import type { PublicApplicationSubmission } from "../public-applications/types";

export class PostgresPublicApplicationRepository implements PublicApplicationRepository {
  constructor(private readonly pool: pg.Pool) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async beginSubmission(input: BeginSubmissionInput): Promise<BeginSubmissionResult> {
    const id = this.nextId("pasub");
    const now = this.now();
    const inserted = await this.pool.query(
      `
        INSERT INTO public_application_submissions (
          id, organization_id, job_opening_id, idempotency_key_hash, request_fingerprint,
          status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'pending', $6)
        ON CONFLICT (organization_id, job_opening_id, idempotency_key_hash) DO NOTHING
        RETURNING *
      `,
      [
        id,
        input.organizationId,
        input.jobOpeningId,
        input.idempotencyKeyHash,
        input.requestFingerprint,
        now
      ]
    );
    if (inserted.rows[0]) {
      return { submission: mapSubmission(inserted.rows[0]), created: true };
    }
    const existing = await this.pool.query(
      `
        SELECT *
        FROM public_application_submissions
        WHERE organization_id = $1
          AND job_opening_id = $2
          AND idempotency_key_hash = $3
      `,
      [input.organizationId, input.jobOpeningId, input.idempotencyKeyHash]
    );
    return { submission: mapSubmission(existing.rows[0]), created: false };
  }

  async markSubmissionCompleted(submissionId: string, candidateApplicationId: string) {
    await this.pool.query(
      `
        UPDATE public_application_submissions
        SET status = 'completed',
            candidate_application_id = $2,
            completed_at = $3
        WHERE id = $1
      `,
      [submissionId, candidateApplicationId, this.now()]
    );
  }

  async markSubmissionFailed(submissionId: string) {
    await this.pool.query(
      `UPDATE public_application_submissions SET status = 'failed' WHERE id = $1`,
      [submissionId]
    );
  }

  async resetSubmissionToPending(submissionId: string) {
    await this.pool.query(
      `
        UPDATE public_application_submissions
        SET status = 'pending',
            candidate_application_id = NULL,
            completed_at = NULL
        WHERE id = $1
      `,
      [submissionId]
    );
  }
}

function mapSubmission(row: Record<string, unknown>): PublicApplicationSubmission {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    jobOpeningId: String(row.job_opening_id),
    idempotencyKeyHash: String(row.idempotency_key_hash),
    requestFingerprint: String(row.request_fingerprint),
    status: row.status as PublicApplicationSubmission["status"],
    candidateApplicationId: nullableString(row.candidate_application_id),
    createdAt: toIso(row.created_at),
    completedAt: nullableIso(row.completed_at),
    expiresAt: nullableIso(row.expires_at)
  };
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function nullableIso(value: unknown) {
  return value === null || value === undefined ? null : toIso(value);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}
