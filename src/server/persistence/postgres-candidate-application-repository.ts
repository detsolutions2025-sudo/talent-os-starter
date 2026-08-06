import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { CandidateApplicationRepository } from "../candidate-applications/repository";
import type {
  CandidateApplication,
  CandidateApplicationCandidateContext,
  CandidateApplicationConsentContext,
  CandidateApplicationEvent,
  CandidateApplicationJobOpeningContext,
  CandidateApplicationJobOpeningVersionContext,
  CandidateApplicationNote
} from "../candidate-applications/types";

export class PostgresCandidateApplicationRepository implements CandidateApplicationRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async createApplication(application: CandidateApplication) {
    await this.connection.query(
      `
        INSERT INTO candidate_applications (
          id, organization_id, candidate_id, job_opening_id, job_opening_version_id,
          application_status, current_stage, source, applied_at, finalized_at,
          finalized_by_user_id, finalization_reason, created_by_user_id, updated_by_user_id,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `,
      applicationParams(application)
    );
  }

  async updateApplication(application: CandidateApplication) {
    await this.connection.query(
      `
        UPDATE candidate_applications
        SET application_status = $3,
            current_stage = $4,
            source = $5,
            applied_at = $6,
            finalized_at = $7,
            finalized_by_user_id = $8,
            finalization_reason = $9,
            created_by_user_id = $10,
            updated_by_user_id = $11,
            created_at = $12,
            updated_at = $13
        WHERE id = $1
          AND organization_id = $2
      `,
      [
        application.id,
        application.organizationId,
        application.applicationStatus,
        application.currentStage,
        application.source,
        application.appliedAt,
        application.finalizedAt,
        application.finalizedByUserId,
        application.finalizationReason,
        application.createdByUserId,
        application.updatedByUserId,
        application.createdAt,
        application.updatedAt
      ]
    );
  }

  async findApplicationById(applicationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM candidate_applications WHERE id = $1",
      [applicationId]
    );
    return result.rows[0] ? mapApplication(result.rows[0]) : null;
  }

  async findApplicationForUpdate(applicationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM candidate_applications WHERE id = $1 FOR UPDATE",
      [applicationId]
    );
    return result.rows[0] ? mapApplication(result.rows[0]) : null;
  }

  async findActiveApplication(organizationId: string, candidateId: string, jobOpeningId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM candidate_applications
        WHERE organization_id = $1
          AND candidate_id = $2
          AND job_opening_id = $3
          AND application_status = 'active'
        LIMIT 1
      `,
      [organizationId, candidateId, jobOpeningId]
    );
    return result.rows[0] ? mapApplication(result.rows[0]) : null;
  }

  async listApplications(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM candidate_applications
        WHERE organization_id = $1
        ORDER BY applied_at DESC, id DESC
      `,
      [organizationId]
    );
    return result.rows.map(mapApplication);
  }

  async addEvent(event: CandidateApplicationEvent) {
    await this.connection.query(
      `
        INSERT INTO candidate_application_events (
          id, organization_id, candidate_application_id, event_type, stage_before, stage_after,
          status_before, status_after, actor_user_id, reason, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        event.id,
        event.organizationId,
        event.candidateApplicationId,
        event.eventType,
        event.stageBefore,
        event.stageAfter,
        event.statusBefore,
        event.statusAfter,
        event.actorUserId,
        event.reason,
        event.createdAt
      ]
    );
  }

  async listEvents(applicationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM candidate_application_events
        WHERE candidate_application_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [applicationId]
    );
    return result.rows.map(mapEvent);
  }

  async addNote(note: CandidateApplicationNote) {
    await this.connection.query(
      `
        INSERT INTO candidate_application_notes (
          id, organization_id, candidate_application_id, content, created_by_user_id,
          updated_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        note.id,
        note.organizationId,
        note.candidateApplicationId,
        note.content,
        note.createdByUserId,
        note.updatedByUserId,
        note.createdAt,
        note.updatedAt
      ]
    );
  }

  async listNotes(applicationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM candidate_application_notes
        WHERE candidate_application_id = $1
        ORDER BY created_at DESC, id DESC
      `,
      [applicationId]
    );
    return result.rows.map(mapNote);
  }

  async findCandidate(candidateId: string) {
    const result = await this.connection.query(
      `
        SELECT
          id,
          organization_id,
          status,
          full_name,
          preferred_name,
          professional_summary,
          location,
          experiences,
          education,
          certifications,
          languages,
          declared_competencies,
          professional_links
        FROM candidates
        WHERE id = $1
      `,
      [candidateId]
    );
    return result.rows[0] ? mapCandidateContext(result.rows[0]) : null;
  }

  async findJobOpening(jobOpeningId: string) {
    const result = await this.connection.query(
      `
        SELECT id, organization_id, status, title, application_deadline
        FROM job_openings
        WHERE id = $1
      `,
      [jobOpeningId]
    );
    return result.rows[0] ? mapJobOpeningContext(result.rows[0]) : null;
  }

  async findJobOpeningVersion(versionId: string) {
    const result = await this.connection.query(
      `
        SELECT id, organization_id, job_opening_id, status, public_title, version_number
        FROM job_opening_versions
        WHERE id = $1
      `,
      [versionId]
    );
    return result.rows[0] ? mapJobOpeningVersionContext(result.rows[0]) : null;
  }

  async latestConsent(candidateId: string) {
    const result = await this.connection.query(
      `
        SELECT status, expires_at
        FROM candidate_consents
        WHERE candidate_id = $1
        ORDER BY consent_at DESC, created_at DESC, id DESC
        LIMIT 1
      `,
      [candidateId]
    );
    return result.rows[0] ? mapConsentContext(result.rows[0]) : null;
  }
}

function applicationParams(application: CandidateApplication) {
  return [
    application.id,
    application.organizationId,
    application.candidateId,
    application.jobOpeningId,
    application.jobOpeningVersionId,
    application.applicationStatus,
    application.currentStage,
    application.source,
    application.appliedAt,
    application.finalizedAt,
    application.finalizedByUserId,
    application.finalizationReason,
    application.createdByUserId,
    application.updatedByUserId,
    application.createdAt,
    application.updatedAt
  ];
}

function mapApplication(row: Record<string, unknown>): CandidateApplication {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateId: String(row.candidate_id),
    jobOpeningId: String(row.job_opening_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    applicationStatus: row.application_status as CandidateApplication["applicationStatus"],
    currentStage: row.current_stage as CandidateApplication["currentStage"],
    source: row.source as CandidateApplication["source"],
    appliedAt: toIso(row.applied_at),
    finalizedAt: nullableIso(row.finalized_at),
    finalizedByUserId: nullableString(row.finalized_by_user_id),
    finalizationReason: nullableString(row.finalization_reason),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapEvent(row: Record<string, unknown>): CandidateApplicationEvent {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateApplicationId: String(row.candidate_application_id),
    eventType: row.event_type as CandidateApplicationEvent["eventType"],
    stageBefore: nullableString(row.stage_before) as CandidateApplicationEvent["stageBefore"],
    stageAfter: nullableString(row.stage_after) as CandidateApplicationEvent["stageAfter"],
    statusBefore: nullableString(row.status_before) as CandidateApplicationEvent["statusBefore"],
    statusAfter: nullableString(row.status_after) as CandidateApplicationEvent["statusAfter"],
    actorUserId: nullableString(row.actor_user_id),
    reason: nullableString(row.reason),
    createdAt: toIso(row.created_at)
  };
}

function mapNote(row: Record<string, unknown>): CandidateApplicationNote {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateApplicationId: String(row.candidate_application_id),
    content: String(row.content),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapCandidateContext(row: Record<string, unknown>): CandidateApplicationCandidateContext {
  const location = normalizeObject<{ city?: unknown; state?: unknown; region?: unknown }>(
    row.location
  );
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: row.status as CandidateApplicationCandidateContext["status"],
    fullName: String(row.full_name),
    preferredName: nullableString(row.preferred_name),
    professionalSummary: nullableString(row.professional_summary),
    city: nullableString(location.city) ?? "",
    state: nullableString(location.state ?? location.region) ?? "",
    experiences: normalizeArray(row.experiences),
    education: normalizeArray(row.education),
    certifications: normalizeArray(row.certifications),
    languages: normalizeArray(row.languages),
    declaredCompetencies: normalizeArray(row.declared_competencies),
    professionalLinks: normalizeArray(row.professional_links)
  };
}

function mapJobOpeningContext(row: Record<string, unknown>): CandidateApplicationJobOpeningContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: row.status as CandidateApplicationJobOpeningContext["status"],
    title: String(row.title),
    applicationDeadline: nullableIso(row.application_deadline)
  };
}

function mapJobOpeningVersionContext(
  row: Record<string, unknown>
): CandidateApplicationJobOpeningVersionContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    jobOpeningId: String(row.job_opening_id),
    status: row.status as CandidateApplicationJobOpeningVersionContext["status"],
    publicTitle: String(row.public_title),
    versionNumber: row.version_number === null ? null : Number(row.version_number)
  };
}

function mapConsentContext(row: Record<string, unknown>): CandidateApplicationConsentContext {
  return {
    status: row.status as CandidateApplicationConsentContext["status"],
    expiresAt: nullableIso(row.expires_at)
  };
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeObject<T>(value: unknown): T {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : ({} as T);
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
