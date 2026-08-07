import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { MembershipRole } from "../core/types";
import type { CandidateApplicationCandidateContext } from "../candidate-applications/types";
import type { InterviewRepository } from "../interviews/repository";
import type {
  Interview,
  InterviewApplicationContext,
  InterviewConsentContext,
  InterviewEvaluation,
  InterviewEvent,
  InterviewJobOpeningContext,
  InterviewJobOpeningVersionContext,
  InterviewParticipant,
  InterviewQuestion,
  InterviewQuestionCatalogContext,
  InterviewResponse
} from "../interviews/types";

export class PostgresInterviewRepository implements InterviewRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async createInterview(interview: Interview) {
    await this.connection.query(
      `
        INSERT INTO interviews (
          id, organization_id, candidate_application_id, title, type, status,
          scheduled_start_at, scheduled_end_at, timezone, location_type, location_details,
          interviewer_instructions, candidate_instructions, started_at, completed_at,
          cancelled_at, cancelled_by_user_id, cancellation_reason, no_show_at,
          no_show_by_user_id, no_show_reason, created_by_user_id, updated_by_user_id,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25
        )
      `,
      interviewParams(interview)
    );
  }

  async updateInterview(interview: Interview) {
    await this.connection.query(
      `
        UPDATE interviews
        SET title = $4,
            type = $5,
            status = $6,
            scheduled_start_at = $7,
            scheduled_end_at = $8,
            timezone = $9,
            location_type = $10,
            location_details = $11,
            interviewer_instructions = $12,
            candidate_instructions = $13,
            started_at = $14,
            completed_at = $15,
            cancelled_at = $16,
            cancelled_by_user_id = $17,
            cancellation_reason = $18,
            no_show_at = $19,
            no_show_by_user_id = $20,
            no_show_reason = $21,
            created_by_user_id = $22,
            updated_by_user_id = $23,
            created_at = $24,
            updated_at = $25
        WHERE id = $1
          AND organization_id = $2
          AND candidate_application_id = $3
      `,
      interviewParams(interview)
    );
  }

  async findInterviewById(interviewId: string) {
    const result = await this.connection.query("SELECT * FROM interviews WHERE id = $1", [
      interviewId
    ]);
    return result.rows[0] ? mapInterview(result.rows[0]) : null;
  }

  async findInterviewForUpdate(interviewId: string) {
    const result = await this.connection.query(
      "SELECT * FROM interviews WHERE id = $1 FOR UPDATE",
      [interviewId]
    );
    return result.rows[0] ? mapInterview(result.rows[0]) : null;
  }

  async listInterviews(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM interviews
        WHERE organization_id = $1
        ORDER BY scheduled_start_at DESC NULLS LAST, created_at DESC, id DESC
      `,
      [organizationId]
    );
    return result.rows.map(mapInterview);
  }

  async listInterviewsByApplication(organizationId: string, applicationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM interviews
        WHERE organization_id = $1
          AND candidate_application_id = $2
        ORDER BY scheduled_start_at DESC NULLS LAST, created_at DESC, id DESC
      `,
      [organizationId, applicationId]
    );
    return result.rows.map(mapInterview);
  }

  async listInterviewsByParticipant(organizationId: string, userId: string) {
    const result = await this.connection.query(
      `
        SELECT interviews.*
        FROM interviews
        INNER JOIN interview_participants participants
          ON participants.organization_id = interviews.organization_id
          AND participants.interview_id = interviews.id
          AND participants.user_id = $2
          AND participants.status = 'active'
        WHERE interviews.organization_id = $1
          AND interviews.status IN ('scheduled', 'in_progress')
        ORDER BY interviews.scheduled_start_at ASC NULLS LAST, interviews.created_at DESC
      `,
      [organizationId, userId]
    );
    return result.rows.map(mapInterview);
  }

  async addParticipant(participant: InterviewParticipant) {
    await this.connection.query(
      `
        INSERT INTO interview_participants (
          id, organization_id, interview_id, user_id, role, status, created_by_user_id,
          updated_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      participantParams(participant)
    );
  }

  async updateParticipant(participant: InterviewParticipant) {
    await this.connection.query(
      `
        UPDATE interview_participants
        SET role = $5,
            status = $6,
            created_by_user_id = $7,
            updated_by_user_id = $8,
            created_at = $9,
            updated_at = $10
        WHERE id = $1
          AND organization_id = $2
          AND interview_id = $3
          AND user_id = $4
      `,
      participantParams(participant)
    );
  }

  async findParticipant(interviewId: string, userId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM interview_participants
        WHERE interview_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [interviewId, userId]
    );
    return result.rows[0] ? mapParticipant(result.rows[0]) : null;
  }

  async listParticipants(interviewId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM interview_participants
        WHERE interview_id = $1
        ORDER BY role ASC, created_at ASC
      `,
      [interviewId]
    );
    return result.rows.map(mapParticipant);
  }

  async addQuestion(question: InterviewQuestion) {
    await this.connection.query(
      `
        INSERT INTO interview_questions (
          id, organization_id, interview_id, question_catalog_item_id, snapshot_title,
          snapshot_text, snapshot_type, snapshot_options, snapshot_settings, display_order,
          required, contextual_weight, contextual_competency_catalog_item_id,
          created_by_user_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `,
      questionParams(question)
    );
  }

  async listQuestions(interviewId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM interview_questions
        WHERE interview_id = $1
        ORDER BY display_order ASC, created_at ASC, id ASC
      `,
      [interviewId]
    );
    return result.rows.map(mapQuestion);
  }

  async countQuestions(interviewId: string) {
    const result = await this.connection.query(
      "SELECT COUNT(*)::int AS count FROM interview_questions WHERE interview_id = $1",
      [interviewId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async addResponse(response: InterviewResponse) {
    await this.connection.query(
      `
        INSERT INTO interview_responses (
          id, organization_id, interview_id, interview_question_id, response_value,
          interviewer_observation, created_by_user_id, updated_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      responseParams(response)
    );
  }

  async updateResponse(response: InterviewResponse) {
    await this.connection.query(
      `
        UPDATE interview_responses
        SET response_value = $5,
            interviewer_observation = $6,
            created_by_user_id = $7,
            updated_by_user_id = $8,
            created_at = $9,
            updated_at = $10
        WHERE id = $1
          AND organization_id = $2
          AND interview_id = $3
          AND interview_question_id = $4
      `,
      responseParams(response)
    );
  }

  async findResponseByQuestion(interviewQuestionId: string) {
    const result = await this.connection.query(
      "SELECT * FROM interview_responses WHERE interview_question_id = $1",
      [interviewQuestionId]
    );
    return result.rows[0] ? mapResponse(result.rows[0]) : null;
  }

  async listResponses(interviewId: string) {
    const result = await this.connection.query(
      "SELECT * FROM interview_responses WHERE interview_id = $1 ORDER BY created_at ASC",
      [interviewId]
    );
    return result.rows.map(mapResponse);
  }

  async addEvaluation(evaluation: InterviewEvaluation) {
    await this.connection.query(
      `
        INSERT INTO interview_evaluations (
          id, organization_id, interview_id, evaluator_user_id, recommendation, summary,
          strengths, attention_points, overall_rating, created_by_user_id, updated_by_user_id,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      evaluationParams(evaluation)
    );
  }

  async updateEvaluation(evaluation: InterviewEvaluation) {
    await this.connection.query(
      `
        UPDATE interview_evaluations
        SET recommendation = $5,
            summary = $6,
            strengths = $7,
            attention_points = $8,
            overall_rating = $9,
            created_by_user_id = $10,
            updated_by_user_id = $11,
            created_at = $12,
            updated_at = $13
        WHERE id = $1
          AND organization_id = $2
          AND interview_id = $3
          AND evaluator_user_id = $4
      `,
      evaluationParams(evaluation)
    );
  }

  async findEvaluation(interviewId: string, evaluatorUserId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM interview_evaluations
        WHERE interview_id = $1
          AND evaluator_user_id = $2
      `,
      [interviewId, evaluatorUserId]
    );
    return result.rows[0] ? mapEvaluation(result.rows[0]) : null;
  }

  async listEvaluations(interviewId: string) {
    const result = await this.connection.query(
      "SELECT * FROM interview_evaluations WHERE interview_id = $1 ORDER BY created_at ASC",
      [interviewId]
    );
    return result.rows.map(mapEvaluation);
  }

  async addEvent(event: InterviewEvent) {
    await this.connection.query(
      `
        INSERT INTO interview_events (
          id, organization_id, interview_id, event_type, status_before, status_after,
          actor_user_id, reason, metadata, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        event.id,
        event.organizationId,
        event.interviewId,
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

  async listEvents(interviewId: string) {
    const result = await this.connection.query(
      "SELECT * FROM interview_events WHERE interview_id = $1 ORDER BY created_at ASC, id ASC",
      [interviewId]
    );
    return result.rows.map(mapEvent);
  }

  async findApplication(applicationId: string) {
    const result = await this.connection.query(
      `
        SELECT id, organization_id, candidate_id, job_opening_id, job_opening_version_id,
          application_status, current_stage
        FROM candidate_applications
        WHERE id = $1
      `,
      [applicationId]
    );
    return result.rows[0] ? mapApplicationContext(result.rows[0]) : null;
  }

  async findCandidate(candidateId: string) {
    const result = await this.connection.query(
      `
        SELECT id, organization_id, status, full_name, preferred_name, professional_summary,
          location, experiences, education, certifications, languages, declared_competencies,
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
      "SELECT id, organization_id, title FROM job_openings WHERE id = $1",
      [jobOpeningId]
    );
    return result.rows[0] ? mapJobOpeningContext(result.rows[0]) : null;
  }

  async findJobOpeningVersion(versionId: string) {
    const result = await this.connection.query(
      "SELECT id, organization_id, public_title FROM job_opening_versions WHERE id = $1",
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
          COALESCE(organization_questions.options, global_questions.options) AS options,
          COALESCE(organization_questions.settings, global_questions.settings) AS settings,
          organization_questions.competency_catalog_item_id
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

  async findMembershipRole(organizationId: string, userId: string) {
    const result = await this.connection.query(
      `
        SELECT role
        FROM memberships
        WHERE organization_id = $1
          AND user_id = $2
          AND status = 'active'
      `,
      [organizationId, userId]
    );
    return result.rows[0] ? (String(result.rows[0].role) as MembershipRole) : null;
  }
}

function interviewParams(interview: Interview) {
  return [
    interview.id,
    interview.organizationId,
    interview.candidateApplicationId,
    interview.title,
    interview.type,
    interview.status,
    interview.scheduledStartAt,
    interview.scheduledEndAt,
    interview.timezone,
    interview.locationType,
    interview.locationDetails,
    interview.interviewerInstructions,
    interview.candidateInstructions,
    interview.startedAt,
    interview.completedAt,
    interview.cancelledAt,
    interview.cancelledByUserId,
    interview.cancellationReason,
    interview.noShowAt,
    interview.noShowByUserId,
    interview.noShowReason,
    interview.createdByUserId,
    interview.updatedByUserId,
    interview.createdAt,
    interview.updatedAt
  ];
}

function participantParams(participant: InterviewParticipant) {
  return [
    participant.id,
    participant.organizationId,
    participant.interviewId,
    participant.userId,
    participant.role,
    participant.status,
    participant.createdByUserId,
    participant.updatedByUserId,
    participant.createdAt,
    participant.updatedAt
  ];
}

function questionParams(question: InterviewQuestion) {
  return [
    question.id,
    question.organizationId,
    question.interviewId,
    question.questionCatalogItemId,
    question.snapshotTitle,
    question.snapshotText,
    question.snapshotType,
    JSON.stringify(question.snapshotOptions),
    JSON.stringify(question.snapshotSettings),
    question.displayOrder,
    question.required,
    question.contextualWeight,
    question.contextualCompetencyCatalogItemId,
    question.createdByUserId,
    question.createdAt
  ];
}

function responseParams(response: InterviewResponse) {
  return [
    response.id,
    response.organizationId,
    response.interviewId,
    response.interviewQuestionId,
    JSON.stringify(response.responseValue),
    response.interviewerObservation,
    response.createdByUserId,
    response.updatedByUserId,
    response.createdAt,
    response.updatedAt
  ];
}

function evaluationParams(evaluation: InterviewEvaluation) {
  return [
    evaluation.id,
    evaluation.organizationId,
    evaluation.interviewId,
    evaluation.evaluatorUserId,
    evaluation.recommendation,
    evaluation.summary,
    evaluation.strengths,
    evaluation.attentionPoints,
    evaluation.overallRating,
    evaluation.createdByUserId,
    evaluation.updatedByUserId,
    evaluation.createdAt,
    evaluation.updatedAt
  ];
}

function mapInterview(row: Record<string, unknown>): Interview {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateApplicationId: String(row.candidate_application_id),
    title: String(row.title),
    type: row.type as Interview["type"],
    status: row.status as Interview["status"],
    scheduledStartAt: nullableIso(row.scheduled_start_at),
    scheduledEndAt: nullableIso(row.scheduled_end_at),
    timezone: String(row.timezone),
    locationType: row.location_type as Interview["locationType"],
    locationDetails: nullableString(row.location_details),
    interviewerInstructions: nullableString(row.interviewer_instructions),
    candidateInstructions: nullableString(row.candidate_instructions),
    startedAt: nullableIso(row.started_at),
    completedAt: nullableIso(row.completed_at),
    cancelledAt: nullableIso(row.cancelled_at),
    cancelledByUserId: nullableString(row.cancelled_by_user_id),
    cancellationReason: nullableString(row.cancellation_reason),
    noShowAt: nullableIso(row.no_show_at),
    noShowByUserId: nullableString(row.no_show_by_user_id),
    noShowReason: nullableString(row.no_show_reason),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapParticipant(row: Record<string, unknown>): InterviewParticipant {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    interviewId: String(row.interview_id),
    userId: String(row.user_id),
    role: row.role as InterviewParticipant["role"],
    status: row.status as InterviewParticipant["status"],
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapQuestion(row: Record<string, unknown>): InterviewQuestion {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    interviewId: String(row.interview_id),
    questionCatalogItemId: String(row.question_catalog_item_id),
    snapshotTitle: String(row.snapshot_title),
    snapshotText: String(row.snapshot_text),
    snapshotType: row.snapshot_type as InterviewQuestion["snapshotType"],
    snapshotOptions: normalizeArray(row.snapshot_options),
    snapshotSettings: normalizeObject(row.snapshot_settings),
    displayOrder: Number(row.display_order),
    required: Boolean(row.required),
    contextualWeight: nullableNumber(row.contextual_weight),
    contextualCompetencyCatalogItemId: nullableString(row.contextual_competency_catalog_item_id),
    createdByUserId: String(row.created_by_user_id),
    createdAt: toIso(row.created_at)
  };
}

function mapResponse(row: Record<string, unknown>): InterviewResponse {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    interviewId: String(row.interview_id),
    interviewQuestionId: String(row.interview_question_id),
    responseValue: row.response_value,
    interviewerObservation: nullableString(row.interviewer_observation),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapEvaluation(row: Record<string, unknown>): InterviewEvaluation {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    interviewId: String(row.interview_id),
    evaluatorUserId: String(row.evaluator_user_id),
    recommendation: row.recommendation as InterviewEvaluation["recommendation"],
    summary: String(row.summary),
    strengths: String(row.strengths),
    attentionPoints: String(row.attention_points),
    overallRating: Number(row.overall_rating),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapEvent(row: Record<string, unknown>): InterviewEvent {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    interviewId: String(row.interview_id),
    eventType: row.event_type as InterviewEvent["eventType"],
    statusBefore: nullableString(row.status_before) as InterviewEvent["statusBefore"],
    statusAfter: nullableString(row.status_after) as InterviewEvent["statusAfter"],
    actorUserId: nullableString(row.actor_user_id),
    reason: nullableString(row.reason),
    metadata: normalizeStringRecord(row.metadata),
    createdAt: toIso(row.created_at)
  };
}

function mapApplicationContext(row: Record<string, unknown>): InterviewApplicationContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateId: String(row.candidate_id),
    jobOpeningId: String(row.job_opening_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    applicationStatus: row.application_status as InterviewApplicationContext["applicationStatus"],
    currentStage: String(row.current_stage)
  };
}

function mapCandidateContext(row: Record<string, unknown>): CandidateApplicationCandidateContext {
  const location = normalizeObject(row.location) as {
    city?: unknown;
    state?: unknown;
    region?: unknown;
  };
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

function mapJobOpeningContext(row: Record<string, unknown>): InterviewJobOpeningContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    title: String(row.title)
  };
}

function mapJobOpeningVersionContext(
  row: Record<string, unknown>
): InterviewJobOpeningVersionContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    publicTitle: String(row.public_title)
  };
}

function mapConsentContext(row: Record<string, unknown>): InterviewConsentContext {
  return {
    status: row.status as InterviewConsentContext["status"],
    expiresAt: nullableIso(row.expires_at)
  };
}

function mapQuestionCatalogContext(row: Record<string, unknown>): InterviewQuestionCatalogContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: row.status as InterviewQuestionCatalogContext["status"],
    title: String(row.title),
    questionText: String(row.question_text),
    type: row.type as InterviewQuestionCatalogContext["type"],
    options: normalizeArray(row.options),
    settings: normalizeObject(row.settings),
    competencyCatalogItemId: nullableString(row.competency_catalog_item_id)
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

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function nullableIso(value: unknown) {
  return value === null || value === undefined ? null : toIso(value);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}
