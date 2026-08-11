import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { MembershipRole } from "../core/types";
import type { PreInterviewRepository } from "../pre-interviews/repository";
import type {
  JobOpeningPreInterviewQuestionSetting,
  JobOpeningPreInterviewSettings,
  PreInterview,
  PreInterviewAccessToken,
  PreInterviewApplicationContext,
  PreInterviewCandidateContext,
  PreInterviewConsentContext,
  PreInterviewEvent,
  PreInterviewQuestion,
  PreInterviewQuestionCatalogContext,
  PreInterviewResponse
} from "../pre-interviews/types";

export class PostgresPreInterviewRepository implements PreInterviewRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  // ----------------------------------------------------------------------------------------
  // Settings
  // ----------------------------------------------------------------------------------------

  async findJobOpeningOrganizationId(jobOpeningId: string) {
    const result = await this.connection.query(
      "SELECT organization_id FROM job_openings WHERE id = $1",
      [jobOpeningId]
    );
    return result.rows[0] ? String(result.rows[0].organization_id) : null;
  }

  async findSettingsByJobOpening(organizationId: string, jobOpeningId: string) {
    const result = await this.connection.query(
      "SELECT * FROM job_opening_pre_interview_settings WHERE organization_id = $1 AND job_opening_id = $2",
      [organizationId, jobOpeningId]
    );
    return result.rows[0] ? mapSettings(result.rows[0]) : null;
  }

  async findSettingsForUpdate(organizationId: string, jobOpeningId: string) {
    const result = await this.connection.query(
      "SELECT * FROM job_opening_pre_interview_settings WHERE organization_id = $1 AND job_opening_id = $2 FOR UPDATE",
      [organizationId, jobOpeningId]
    );
    return result.rows[0] ? mapSettings(result.rows[0]) : null;
  }

  async createSettings(settings: JobOpeningPreInterviewSettings) {
    await this.connection.query(
      `
        INSERT INTO job_opening_pre_interview_settings (
          id, organization_id, job_opening_id, enabled, created_by_user_id, updated_by_user_id,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        settings.id,
        settings.organizationId,
        settings.jobOpeningId,
        settings.enabled,
        settings.createdByUserId,
        settings.updatedByUserId,
        settings.createdAt,
        settings.updatedAt
      ]
    );
  }

  async updateSettings(settings: JobOpeningPreInterviewSettings) {
    await this.connection.query(
      `
        UPDATE job_opening_pre_interview_settings
        SET enabled = $3, updated_by_user_id = $4, updated_at = $5
        WHERE id = $1 AND organization_id = $2
      `,
      [
        settings.id,
        settings.organizationId,
        settings.enabled,
        settings.updatedByUserId,
        settings.updatedAt
      ]
    );
  }

  async listQuestionSettings(organizationId: string, settingsId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_opening_pre_interview_question_settings
        WHERE organization_id = $1 AND settings_id = $2
        ORDER BY display_order ASC, created_at ASC
      `,
      [organizationId, settingsId]
    );
    return result.rows.map(mapQuestionSetting);
  }

  async replaceQuestionSettings(
    organizationId: string,
    settingsId: string,
    questions: JobOpeningPreInterviewQuestionSetting[]
  ) {
    // Reconstrucao completa dentro da mesma transacao do chamador (o `connection` aqui e um
    // pg.PoolClient ja em BEGIN, nunca uma transacao propria) -- evita colisao do UNIQUE
    // intermediario de display_order (Plano Tecnico, correcao final, item 10).
    await this.connection.query(
      "DELETE FROM job_opening_pre_interview_question_settings WHERE organization_id = $1 AND settings_id = $2",
      [organizationId, settingsId]
    );
    for (const question of questions) {
      await this.connection.query(
        `
          INSERT INTO job_opening_pre_interview_question_settings (
            id, organization_id, settings_id, question_catalog_item_id, display_order, required,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          question.id,
          organizationId,
          settingsId,
          question.questionCatalogItemId,
          question.displayOrder,
          question.required,
          question.createdAt
        ]
      );
    }
  }

  // ----------------------------------------------------------------------------------------
  // Instances / attempts
  // ----------------------------------------------------------------------------------------

  async createPreInterview(preInterview: PreInterview) {
    await this.connection.query(
      `
        INSERT INTO pre_interviews (
          id, organization_id, candidate_application_id, job_opening_id, job_opening_version_id,
          blueprint_version_id, previous_attempt_id, attempt_number, status, created_source,
          created_by_user_id, available_at, started_at, completed_at, cancelled_at,
          cancelled_by_user_id, cancellation_reason, expired_at, expires_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      `,
      preInterviewParams(preInterview)
    );
  }

  async updatePreInterview(preInterview: PreInterview) {
    await this.connection.query(
      `
        UPDATE pre_interviews
        SET blueprint_version_id = $6,
            previous_attempt_id = $7,
            attempt_number = $8,
            status = $9,
            created_source = $10,
            created_by_user_id = $11,
            available_at = $12,
            started_at = $13,
            completed_at = $14,
            cancelled_at = $15,
            cancelled_by_user_id = $16,
            cancellation_reason = $17,
            expired_at = $18,
            expires_at = $19,
            created_at = $20,
            updated_at = $21
        WHERE id = $1
          AND organization_id = $2
          AND candidate_application_id = $3
          AND job_opening_id = $4
          AND job_opening_version_id = $5
      `,
      preInterviewParams(preInterview)
    );
  }

  async findPreInterviewById(preInterviewId: string) {
    const result = await this.connection.query("SELECT * FROM pre_interviews WHERE id = $1", [
      preInterviewId
    ]);
    return result.rows[0] ? mapPreInterview(result.rows[0]) : null;
  }

  async findPreInterviewForUpdate(preInterviewId: string) {
    const result = await this.connection.query(
      "SELECT * FROM pre_interviews WHERE id = $1 FOR UPDATE",
      [preInterviewId]
    );
    return result.rows[0] ? mapPreInterview(result.rows[0]) : null;
  }

  async findOperationalByApplication(organizationId: string, candidateApplicationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM pre_interviews
        WHERE organization_id = $1
          AND candidate_application_id = $2
          AND status IN ('draft', 'available', 'in_progress')
        LIMIT 1
      `,
      [organizationId, candidateApplicationId]
    );
    return result.rows[0] ? mapPreInterview(result.rows[0]) : null;
  }

  async findMaxAttemptNumber(organizationId: string, candidateApplicationId: string) {
    // SELECT simples, sem FOR UPDATE proprio -- a serializacao vem inteiramente do lock ja
    // obtido pelo chamador em candidate_applications (Plano Tecnico, correcao final, item 1).
    const result = await this.connection.query(
      "SELECT COALESCE(MAX(attempt_number), 0)::int AS max FROM pre_interviews WHERE organization_id = $1 AND candidate_application_id = $2",
      [organizationId, candidateApplicationId]
    );
    return Number(result.rows[0]?.max ?? 0);
  }

  async hasAnyAttempt(organizationId: string, candidateApplicationId: string) {
    const result = await this.connection.query(
      "SELECT 1 FROM pre_interviews WHERE organization_id = $1 AND candidate_application_id = $2 LIMIT 1",
      [organizationId, candidateApplicationId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listByApplication(organizationId: string, candidateApplicationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM pre_interviews WHERE organization_id = $1 AND candidate_application_id = $2 ORDER BY attempt_number DESC",
      [organizationId, candidateApplicationId]
    );
    return result.rows.map(mapPreInterview);
  }

  async listByOrganization(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM pre_interviews WHERE organization_id = $1 ORDER BY created_at DESC",
      [organizationId]
    );
    return result.rows.map(mapPreInterview);
  }

  // ----------------------------------------------------------------------------------------
  // Questions (snapshot)
  // ----------------------------------------------------------------------------------------

  async addQuestion(question: PreInterviewQuestion) {
    await this.connection.query(
      `
        INSERT INTO pre_interview_questions (
          id, organization_id, pre_interview_id, question_catalog_item_id, snapshot_title,
          snapshot_text, snapshot_type, snapshot_category, snapshot_options, snapshot_settings,
          display_order, required, content_fingerprint, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `,
      [
        question.id,
        question.organizationId,
        question.preInterviewId,
        question.questionCatalogItemId,
        question.snapshotTitle,
        question.snapshotText,
        question.snapshotType,
        question.snapshotCategory,
        JSON.stringify(question.snapshotOptions),
        JSON.stringify(question.snapshotSettings),
        question.displayOrder,
        question.required,
        question.contentFingerprint,
        question.createdAt
      ]
    );
  }

  async listQuestions(preInterviewId: string) {
    const result = await this.connection.query(
      "SELECT * FROM pre_interview_questions WHERE pre_interview_id = $1 ORDER BY display_order ASC, created_at ASC",
      [preInterviewId]
    );
    return result.rows.map(mapQuestion);
  }

  // ----------------------------------------------------------------------------------------
  // Responses
  // ----------------------------------------------------------------------------------------

  async upsertResponse(response: PreInterviewResponse) {
    const result = await this.connection.query(
      `
        INSERT INTO pre_interview_responses (
          id, organization_id, pre_interview_id, pre_interview_question_id, response_value,
          submitted, created_at, updated_at, submitted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (organization_id, pre_interview_question_id)
        DO UPDATE SET response_value = EXCLUDED.response_value, updated_at = EXCLUDED.updated_at
        RETURNING *
      `,
      [
        response.id,
        response.organizationId,
        response.preInterviewId,
        response.preInterviewQuestionId,
        JSON.stringify(response.responseValue),
        response.submitted,
        response.createdAt,
        response.updatedAt,
        response.submittedAt
      ]
    );
    return mapResponse(result.rows[0]);
  }

  async markResponsesSubmitted(preInterviewId: string, submittedAt: string) {
    await this.connection.query(
      "UPDATE pre_interview_responses SET submitted = TRUE, submitted_at = $2, updated_at = $2 WHERE pre_interview_id = $1",
      [preInterviewId, submittedAt]
    );
  }

  async listResponses(preInterviewId: string) {
    const result = await this.connection.query(
      "SELECT * FROM pre_interview_responses WHERE pre_interview_id = $1 ORDER BY created_at ASC",
      [preInterviewId]
    );
    return result.rows.map(mapResponse);
  }

  // ----------------------------------------------------------------------------------------
  // Access tokens
  // ----------------------------------------------------------------------------------------

  async addAccessToken(token: PreInterviewAccessToken) {
    await this.connection.query(
      `
        INSERT INTO pre_interview_access_tokens (
          id, organization_id, pre_interview_id, token_hash, status, expires_at, created_at,
          revoked_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        token.id,
        token.organizationId,
        token.preInterviewId,
        token.tokenHash,
        token.status,
        token.expiresAt,
        token.createdAt,
        token.revokedAt
      ]
    );
  }

  async findAccessTokenByHash(tokenHash: string) {
    const result = await this.connection.query(
      "SELECT * FROM pre_interview_access_tokens WHERE token_hash = $1",
      [tokenHash]
    );
    return result.rows[0] ? mapAccessToken(result.rows[0]) : null;
  }

  async revokeActiveTokens(organizationId: string, preInterviewId: string) {
    await this.connection.query(
      `
        UPDATE pre_interview_access_tokens
        SET status = 'revoked', revoked_at = NOW()
        WHERE organization_id = $1 AND pre_interview_id = $2 AND status = 'active'
      `,
      [organizationId, preInterviewId]
    );
  }

  // ----------------------------------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------------------------------

  async addEvent(event: PreInterviewEvent) {
    await this.connection.query(
      `
        INSERT INTO pre_interview_events (
          id, organization_id, pre_interview_id, event_type, status_before, status_after,
          actor_user_id, reason, metadata, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        event.id,
        event.organizationId,
        event.preInterviewId,
        event.eventType,
        event.statusBefore,
        event.statusAfter,
        event.actorUserId,
        event.reason,
        JSON.stringify(event.metadata),
        event.createdAt
      ]
    );
  }

  async listEvents(preInterviewId: string) {
    const result = await this.connection.query(
      "SELECT * FROM pre_interview_events WHERE pre_interview_id = $1 ORDER BY created_at ASC, id ASC",
      [preInterviewId]
    );
    return result.rows.map(mapEvent);
  }

  // ----------------------------------------------------------------------------------------
  // Contexts
  // ----------------------------------------------------------------------------------------

  async findApplication(applicationId: string) {
    const result = await this.connection.query(
      `
        SELECT id, organization_id, candidate_id, job_opening_id, job_opening_version_id, application_status
        FROM candidate_applications
        WHERE id = $1
      `,
      [applicationId]
    );
    return result.rows[0] ? mapApplicationContext(result.rows[0]) : null;
  }

  async findCandidate(candidateId: string) {
    const result = await this.connection.query(
      "SELECT id, organization_id, status FROM candidates WHERE id = $1",
      [candidateId]
    );
    return result.rows[0] ? mapCandidateContext(result.rows[0]) : null;
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

  // Mesma consulta unificada ja usada por PostgresInterviewRepository.findQuestionCatalogItem
  // (Question Bank global x tenant, SPEC-009) -- acrescida apenas de `category`, que esta SPEC
  // tambem precisa (SPEC-021, secao 9.3).
  async findQuestionCatalogItem(catalogItemId: string) {
    const result = await this.connection.query(
      `
        SELECT
          catalog.id,
          catalog.organization_id,
          catalog.status,
          COALESCE(organization_questions.title, global_questions.title) AS title,
          COALESCE(organization_questions.question_text, global_questions.question_text) AS question_text,
          COALESCE(organization_questions.type, global_questions.type) AS type,
          COALESCE(organization_questions.category, global_questions.category) AS category,
          COALESCE(organization_questions.options, global_questions.options) AS options,
          COALESCE(organization_questions.settings, global_questions.settings) AS settings
        FROM question_catalog_items catalog
        LEFT JOIN organization_questions
          ON organization_questions.organization_id = catalog.organization_id
          AND organization_questions.id = catalog.organization_question_id
        LEFT JOIN organization_adopted_questions adoptions
          ON adoptions.organization_id = catalog.organization_id
          AND adoptions.global_question_id = catalog.global_question_id
        LEFT JOIN global_questions
          ON global_questions.id = catalog.global_question_id
        WHERE catalog.id = $1
          AND (
            (catalog.origin = 'organization' AND organization_questions.status = 'active')
            OR
            (
              catalog.origin = 'global'
              AND adoptions.status = 'active'
              AND global_questions.status IN ('active', 'deprecated')
            )
          )
      `,
      [catalogItemId]
    );
    return result.rows[0] ? mapQuestionCatalogContext(result.rows[0]) : null;
  }

  async findActiveBlueprintVersionId(organizationId: string) {
    const result = await this.connection.query(
      "SELECT id FROM organization_blueprint_versions WHERE organization_id = $1 AND status = 'active' LIMIT 1",
      [organizationId]
    );
    return result.rows[0] ? String(result.rows[0].id) : null;
  }

  async findMembershipRole(organizationId: string, userId: string) {
    const result = await this.connection.query(
      "SELECT role FROM memberships WHERE organization_id = $1 AND user_id = $2 AND status = 'active'",
      [organizationId, userId]
    );
    return result.rows[0] ? (String(result.rows[0].role) as MembershipRole) : null;
  }
}

function mapSettings(row: Record<string, unknown>): JobOpeningPreInterviewSettings {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    jobOpeningId: String(row.job_opening_id),
    enabled: Boolean(row.enabled),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapQuestionSetting(row: Record<string, unknown>): JobOpeningPreInterviewQuestionSetting {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    settingsId: String(row.settings_id),
    questionCatalogItemId: String(row.question_catalog_item_id),
    displayOrder: Number(row.display_order),
    required: Boolean(row.required),
    createdAt: toIso(row.created_at)
  };
}

function preInterviewParams(preInterview: PreInterview) {
  return [
    preInterview.id,
    preInterview.organizationId,
    preInterview.candidateApplicationId,
    preInterview.jobOpeningId,
    preInterview.jobOpeningVersionId,
    preInterview.blueprintVersionId,
    preInterview.previousAttemptId,
    preInterview.attemptNumber,
    preInterview.status,
    preInterview.createdSource,
    preInterview.createdByUserId,
    preInterview.availableAt,
    preInterview.startedAt,
    preInterview.completedAt,
    preInterview.cancelledAt,
    preInterview.cancelledByUserId,
    preInterview.cancellationReason,
    preInterview.expiredAt,
    preInterview.expiresAt,
    preInterview.createdAt,
    preInterview.updatedAt
  ];
}

function mapPreInterview(row: Record<string, unknown>): PreInterview {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateApplicationId: String(row.candidate_application_id),
    jobOpeningId: String(row.job_opening_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    blueprintVersionId: nullableString(row.blueprint_version_id),
    previousAttemptId: nullableString(row.previous_attempt_id),
    attemptNumber: Number(row.attempt_number),
    status: row.status as PreInterview["status"],
    createdSource: row.created_source as PreInterview["createdSource"],
    createdByUserId: nullableString(row.created_by_user_id),
    availableAt: nullableIso(row.available_at),
    startedAt: nullableIso(row.started_at),
    completedAt: nullableIso(row.completed_at),
    cancelledAt: nullableIso(row.cancelled_at),
    cancelledByUserId: nullableString(row.cancelled_by_user_id),
    cancellationReason: nullableString(row.cancellation_reason),
    expiredAt: nullableIso(row.expired_at),
    expiresAt: nullableIso(row.expires_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapQuestion(row: Record<string, unknown>): PreInterviewQuestion {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    preInterviewId: String(row.pre_interview_id),
    questionCatalogItemId: String(row.question_catalog_item_id),
    snapshotTitle: String(row.snapshot_title),
    snapshotText: String(row.snapshot_text),
    snapshotType: row.snapshot_type as PreInterviewQuestion["snapshotType"],
    snapshotCategory: row.snapshot_category as PreInterviewQuestion["snapshotCategory"],
    snapshotOptions: normalizeArray(row.snapshot_options),
    snapshotSettings: normalizeObject(row.snapshot_settings),
    displayOrder: Number(row.display_order),
    required: Boolean(row.required),
    contentFingerprint: String(row.content_fingerprint),
    createdAt: toIso(row.created_at)
  };
}

function mapResponse(row: Record<string, unknown>): PreInterviewResponse {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    preInterviewId: String(row.pre_interview_id),
    preInterviewQuestionId: String(row.pre_interview_question_id),
    responseValue: row.response_value,
    submitted: Boolean(row.submitted),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    submittedAt: nullableIso(row.submitted_at)
  };
}

function mapAccessToken(row: Record<string, unknown>): PreInterviewAccessToken {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    preInterviewId: String(row.pre_interview_id),
    tokenHash: String(row.token_hash),
    status: row.status as PreInterviewAccessToken["status"],
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
    revokedAt: nullableIso(row.revoked_at)
  };
}

function mapEvent(row: Record<string, unknown>): PreInterviewEvent {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    preInterviewId: String(row.pre_interview_id),
    eventType: row.event_type as PreInterviewEvent["eventType"],
    statusBefore: nullableString(row.status_before) as PreInterviewEvent["statusBefore"],
    statusAfter: nullableString(row.status_after) as PreInterviewEvent["statusAfter"],
    actorUserId: nullableString(row.actor_user_id),
    reason: nullableString(row.reason),
    metadata: normalizeStringRecord(row.metadata),
    createdAt: toIso(row.created_at)
  };
}

function mapApplicationContext(row: Record<string, unknown>): PreInterviewApplicationContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateId: String(row.candidate_id),
    jobOpeningId: String(row.job_opening_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    applicationStatus: row.application_status as PreInterviewApplicationContext["applicationStatus"]
  };
}

function mapCandidateContext(row: Record<string, unknown>): PreInterviewCandidateContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: row.status as PreInterviewCandidateContext["status"]
  };
}

function mapConsentContext(row: Record<string, unknown>): PreInterviewConsentContext {
  return {
    status: row.status as PreInterviewConsentContext["status"],
    expiresAt: nullableIso(row.expires_at)
  };
}

function mapQuestionCatalogContext(
  row: Record<string, unknown>
): PreInterviewQuestionCatalogContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: row.status as PreInterviewQuestionCatalogContext["status"],
    title: String(row.title),
    questionText: String(row.question_text),
    type: row.type as PreInterviewQuestionCatalogContext["type"],
    category: row.category as PreInterviewQuestionCatalogContext["category"],
    options: normalizeArray(row.options),
    settings: normalizeObject(row.settings)
  };
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeStringRecord(value: unknown) {
  const object = normalizeObject(value);
  return Object.fromEntries(Object.entries(object).map(([key, entry]) => [key, String(entry)]));
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
