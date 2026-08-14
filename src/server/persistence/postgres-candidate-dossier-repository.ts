import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { CandidateDossierRepository } from "../candidate-dossiers/repository";
import {
  candidateDossierCandidateFieldAllowList,
  candidateDossierOriginKindBySourceType,
  type CandidateDossier,
  type CandidateDossierApplicationContext,
  type CandidateDossierConsentContext,
  type CandidateDossierSource,
  type CandidateDossierSourceType
} from "../candidate-dossiers/types";

export class PostgresCandidateDossierRepository implements CandidateDossierRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async addDossier(d: CandidateDossier) {
    await this.connection.query(
      `
        INSERT INTO candidate_dossiers (
          id, organization_id, candidate_application_id, candidate_id, job_opening_id,
          job_opening_version_id, blueprint_version_id, version_number, previous_version_id,
          status, generation_kind, final_record_reason, presented_snapshot,
          snapshot_schema_version, content_hash, idempotency_key_hash, request_fingerprint,
          generated_by_user_id, generated_at, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      `,
      [
        d.id,
        d.organizationId,
        d.candidateApplicationId,
        d.candidateId,
        d.jobOpeningId,
        d.jobOpeningVersionId,
        d.blueprintVersionId,
        d.versionNumber,
        d.previousVersionId,
        d.status,
        d.generationKind,
        d.finalRecordReason,
        JSON.stringify(d.presentedSnapshot),
        d.snapshotSchemaVersion,
        d.contentHash,
        d.idempotencyKeyHash,
        d.requestFingerprint,
        d.generatedByUserId,
        d.generatedAt,
        d.createdAt,
        d.updatedAt
      ]
    );
  }

  async addSources(sources: CandidateDossierSource[]) {
    for (const s of sources) {
      await this.connection.query(
        `
          INSERT INTO candidate_dossier_sources (
            id, organization_id, candidate_dossier_id, candidate_application_id, source_type,
            origin_kind, field_name, candidate_id, job_opening_id, job_opening_version_id,
            blueprint_version_id, pre_interview_id, pre_interview_response_id,
            behavioral_assessment_id, behavioral_assessment_result_id, pre_analysis_id,
            pre_analysis_result_id, pre_analysis_finding_id, interview_id,
            interview_response_id, interview_evaluation_id, snapshot_value,
            presented_value_snapshot, content_hash, source_created_at, authored_by_user_id,
            authorship, presented_order, created_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
            $22,$23,$24,$25,$26,$27,$28,$29
          )
        `,
        [
          s.id,
          s.organizationId,
          s.candidateDossierId,
          s.candidateApplicationId,
          s.sourceType,
          s.originKind,
          s.fieldName,
          s.candidateId,
          s.jobOpeningId,
          s.jobOpeningVersionId,
          s.blueprintVersionId,
          s.preInterviewId,
          s.preInterviewResponseId,
          s.behavioralAssessmentId,
          s.behavioralAssessmentResultId,
          s.preAnalysisId,
          s.preAnalysisResultId,
          s.preAnalysisFindingId,
          s.interviewId,
          s.interviewResponseId,
          s.interviewEvaluationId,
          s.snapshotValue === null || s.snapshotValue === undefined
            ? null
            : JSON.stringify(s.snapshotValue),
          JSON.stringify(s.presentedValueSnapshot),
          s.contentHash,
          s.sourceCreatedAt,
          s.authoredByUserId,
          JSON.stringify(s.authorship ?? {}),
          s.presentedOrder,
          s.createdAt
        ]
      );
    }
  }

  async findById(organizationId: string, id: string) {
    const result = await this.connection.query(
      "SELECT * FROM candidate_dossiers WHERE organization_id = $1 AND id = $2",
      [organizationId, id]
    );
    return result.rows[0] ? mapDossier(result.rows[0]) : null;
  }

  async findByIdempotencyKeyHash(
    organizationId: string,
    candidateApplicationId: string,
    idempotencyKeyHash: string
  ) {
    const result = await this.connection.query(
      `
        SELECT * FROM candidate_dossiers
        WHERE organization_id = $1 AND candidate_application_id = $2 AND idempotency_key_hash = $3
      `,
      [organizationId, candidateApplicationId, idempotencyKeyHash]
    );
    return result.rows[0] ? mapDossier(result.rows[0]) : null;
  }

  async latestByApplication(organizationId: string, candidateApplicationId: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM candidate_dossiers
        WHERE organization_id = $1 AND candidate_application_id = $2
        ORDER BY version_number DESC LIMIT 1
      `,
      [organizationId, candidateApplicationId]
    );
    return result.rows[0] ? mapDossier(result.rows[0]) : null;
  }

  async listByApplication(organizationId: string, candidateApplicationId: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM candidate_dossiers
        WHERE organization_id = $1 AND candidate_application_id = $2
        ORDER BY version_number DESC
      `,
      [organizationId, candidateApplicationId]
    );
    return result.rows.map(mapDossier);
  }

  async listSources(organizationId: string, dossierId: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM candidate_dossier_sources
        WHERE organization_id = $1 AND candidate_dossier_id = $2
        ORDER BY presented_order ASC
      `,
      [organizationId, dossierId]
    );
    return result.rows.map(mapSource);
  }

  async countSources(organizationId: string, dossierId: string) {
    const result = await this.connection.query(
      `
        SELECT COUNT(*)::int AS total FROM candidate_dossier_sources
        WHERE organization_id = $1 AND candidate_dossier_id = $2
      `,
      [organizationId, dossierId]
    );
    return result.rows[0]?.total ?? 0;
  }

  async findApplicationForUpdate(
    applicationId: string
  ): Promise<CandidateDossierApplicationContext | null> {
    const result = await this.connection.query(
      `
        SELECT a.id, a.organization_id, a.candidate_id, a.job_opening_id,
               a.job_opening_version_id, c.status AS candidate_status,
               a.application_status, a.finalized_at
        FROM candidate_applications a
        JOIN candidates c ON c.organization_id = a.organization_id AND c.id = a.candidate_id
        WHERE a.id = $1
        FOR UPDATE
      `,
      [applicationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organization_id,
      candidateId: row.candidate_id,
      jobOpeningId: row.job_opening_id,
      jobOpeningVersionId: row.job_opening_version_id,
      candidateStatus: row.candidate_status,
      applicationStatus: row.application_status,
      finalizedAt: nullableIso(row.finalized_at)
    };
  }

  async latestConsent(candidateId: string): Promise<CandidateDossierConsentContext | null> {
    const result = await this.connection.query(
      `
        SELECT id, status, expires_at FROM candidate_consents
        WHERE candidate_id = $1 AND purpose = 'Recruiting'
        ORDER BY consent_at DESC, created_at DESC, id DESC
        LIMIT 1
      `,
      [candidateId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, status: row.status, expiresAt: nullableIso(row.expires_at) };
  }

  async collectSources(
    organizationId: string,
    candidateApplicationId: string,
    candidateId: string,
    jobOpeningId: string,
    jobOpeningVersionId: string,
    dossierId: string
  ) {
    const now = this.now();
    const sources: CandidateDossierSource[] = [];
    let order = 0;
    const push = (
      sourceType: CandidateDossierSourceType,
      presentedValueSnapshot: Record<string, unknown>,
      ids: Partial<CandidateDossierSource> = {},
      snapshotValue: unknown = null,
      sourceCreatedAt: string | null = null,
      authoredByUserId: string | null = null
    ) => {
      sources.push({
        id: this.nextId("cds"),
        organizationId,
        candidateDossierId: dossierId,
        candidateApplicationId,
        sourceType,
        originKind: candidateDossierOriginKindBySourceType[sourceType],
        fieldName: ids.fieldName ?? null,
        candidateId: ids.candidateId ?? null,
        jobOpeningId: ids.jobOpeningId ?? null,
        jobOpeningVersionId: ids.jobOpeningVersionId ?? null,
        blueprintVersionId: ids.blueprintVersionId ?? null,
        preInterviewId: ids.preInterviewId ?? null,
        preInterviewResponseId: ids.preInterviewResponseId ?? null,
        behavioralAssessmentId: ids.behavioralAssessmentId ?? null,
        behavioralAssessmentResultId: ids.behavioralAssessmentResultId ?? null,
        preAnalysisId: ids.preAnalysisId ?? null,
        preAnalysisResultId: ids.preAnalysisResultId ?? null,
        preAnalysisFindingId: ids.preAnalysisFindingId ?? null,
        interviewId: ids.interviewId ?? null,
        interviewResponseId: ids.interviewResponseId ?? null,
        interviewEvaluationId: ids.interviewEvaluationId ?? null,
        snapshotValue,
        presentedValueSnapshot,
        contentHash: "",
        sourceCreatedAt,
        authoredByUserId,
        authorship: ids.authorship ?? {},
        presentedOrder: ++order,
        createdAt: now
      });
    };

    const candidate = await this.connection.query(
      `
        SELECT professional_summary, experiences, education, certifications, languages,
               declared_competencies, availability, created_at
        FROM candidates WHERE organization_id = $1 AND id = $2
      `,
      [organizationId, candidateId]
    );
    const candidateRow = candidate.rows[0] ?? {};
    for (const fieldName of candidateDossierCandidateFieldAllowList) {
      const value = candidateRow[toSnake(fieldName)];
      if (isEmpty(value)) continue;
      push(
        "candidate_field",
        { label: fieldName, value },
        { candidateId, fieldName },
        value,
        nullableIso(candidateRow.created_at)
      );
    }

    const jobVersion = await this.connection.query(
      `
        SELECT id, job_opening_id, public_title, description, responsibilities, requirements,
               benefits, created_at
        FROM job_opening_versions
        WHERE organization_id = $1 AND id = $2
      `,
      [organizationId, jobOpeningVersionId]
    );
    if (jobVersion.rows[0]) {
      const row = jobVersion.rows[0];
      push(
        "job_opening_version",
        {
          publicTitle: row.public_title,
          description: row.description,
          responsibilities: row.responsibilities ?? [],
          requirements: row.requirements ?? [],
          benefits: row.benefits ?? []
        },
        { jobOpeningVersionId: row.id },
        null,
        nullableIso(row.created_at)
      );
    }

    const preInterviewResponses = await this.connection.query(
      `
        SELECT r.id, r.pre_interview_id, p.blueprint_version_id, q.snapshot_text,
               r.response_value, r.updated_at
        FROM pre_interviews p
        JOIN pre_interview_responses r ON r.organization_id = p.organization_id AND r.pre_interview_id = p.id
        LEFT JOIN pre_interview_questions q ON q.organization_id = r.organization_id AND q.id = r.pre_interview_question_id
        WHERE p.organization_id = $1 AND p.candidate_application_id = $2
          AND p.status = 'completed' AND r.submitted = TRUE
        ORDER BY p.attempt_number ASC, p.completed_at ASC NULLS LAST, p.id ASC,
                 q.display_order ASC, r.id ASC
      `,
      [organizationId, candidateApplicationId]
    );
    for (const row of preInterviewResponses.rows) {
      push(
        "pre_interview_response",
        { question: row.snapshot_text ?? null, response: row.response_value },
        { preInterviewId: row.pre_interview_id, preInterviewResponseId: row.id },
        null,
        nullableIso(row.updated_at)
      );
      if (row.blueprint_version_id) {
        push(
          "blueprint_version",
          { id: row.blueprint_version_id, context: "pre_interview" },
          { blueprintVersionId: row.blueprint_version_id },
          null,
          nullableIso(row.updated_at)
        );
      }
    }

    const assessments = await this.connection.query(
      `
        SELECT a.id AS assessment_id, a.blueprint_version_id, r.id AS result_id,
               r.summary_text, r.created_at
        FROM behavioral_assessments a
        JOIN behavioral_assessment_results r ON r.organization_id = a.organization_id
          AND r.behavioral_assessment_id = a.id
        WHERE a.organization_id = $1 AND a.candidate_application_id = $2 AND a.status = 'completed'
        ORDER BY a.attempt_number ASC, a.completed_at ASC NULLS LAST, a.id ASC
      `,
      [organizationId, candidateApplicationId]
    );
    for (const row of assessments.rows) {
      const dimensions = await this.connection.query(
        `
          SELECT dimension_code, label, display_value, interpretation_text
          FROM behavioral_assessment_result_dimensions
          WHERE organization_id = $1 AND behavioral_assessment_result_id = $2
          ORDER BY display_order ASC
        `,
        [organizationId, row.result_id]
      );
      push(
        "behavioral_assessment_result",
        { summaryText: row.summary_text, dimensions: dimensions.rows },
        { behavioralAssessmentId: row.assessment_id, behavioralAssessmentResultId: row.result_id },
        null,
        nullableIso(row.created_at)
      );
      if (row.blueprint_version_id) {
        push(
          "blueprint_version",
          { id: row.blueprint_version_id, context: "behavioral_assessment" },
          { blueprintVersionId: row.blueprint_version_id },
          null,
          nullableIso(row.created_at)
        );
      }
    }

    const preAnalyses = await this.connection.query(
      `
        SELECT p.id AS pre_analysis_id, p.blueprint_version_id, r.id AS result_id,
               r.summary, r.limitations, r.created_at
        FROM pre_analyses p
        JOIN pre_analysis_results r ON r.organization_id = p.organization_id AND r.pre_analysis_id = p.id
        WHERE p.organization_id = $1 AND p.candidate_application_id = $2 AND p.status = 'completed'
        ORDER BY p.attempt_number ASC, p.completed_at ASC NULLS LAST, p.id ASC
      `,
      [organizationId, candidateApplicationId]
    );
    for (const row of preAnalyses.rows) {
      push(
        "pre_analysis_result",
        { summary: row.summary, limitations: row.limitations },
        { preAnalysisId: row.pre_analysis_id, preAnalysisResultId: row.result_id },
        null,
        nullableIso(row.created_at)
      );
      if (row.blueprint_version_id) {
        push(
          "blueprint_version",
          { id: row.blueprint_version_id, context: "pre_analysis" },
          { blueprintVersionId: row.blueprint_version_id },
          null,
          nullableIso(row.created_at)
        );
      }
      const findings = await this.connection.query(
        `
          SELECT id, category, text, display_order, created_at
          FROM pre_analysis_findings
          WHERE organization_id = $1 AND pre_analysis_result_id = $2
          ORDER BY display_order ASC
        `,
        [organizationId, row.result_id]
      );
      for (const finding of findings.rows) {
        push(
          "pre_analysis_finding",
          { category: finding.category, text: finding.text },
          {
            preAnalysisId: row.pre_analysis_id,
            preAnalysisResultId: row.result_id,
            preAnalysisFindingId: finding.id
          },
          null,
          nullableIso(finding.created_at)
        );
      }
    }

    const responses = await this.connection.query(
      `
        SELECT r.id, r.interview_id, q.snapshot_text, r.response_value,
               r.interviewer_observation, r.created_by_user_id, r.created_at
        FROM interviews i
        JOIN interview_responses r ON r.organization_id = i.organization_id AND r.interview_id = i.id
        LEFT JOIN interview_questions q ON q.organization_id = r.organization_id AND q.id = r.interview_question_id
        WHERE i.organization_id = $1 AND i.candidate_application_id = $2
          AND i.status = 'completed'
        ORDER BY i.scheduled_start_at ASC, i.id ASC, q.display_order ASC, r.id ASC
      `,
      [organizationId, candidateApplicationId]
    );
    for (const row of responses.rows) {
      push(
        "interview_response",
        {
          question: row.snapshot_text ?? null,
          response: row.response_value,
          interviewerObservation: row.interviewer_observation
        },
        {
          interviewId: row.interview_id,
          interviewResponseId: row.id,
          authorship: { kind: "user", userId: row.created_by_user_id }
        },
        null,
        nullableIso(row.created_at),
        row.created_by_user_id
      );
    }

    const evaluations = await this.connection.query(
      `
        SELECT e.id, e.interview_id, e.evaluator_user_id, e.recommendation, e.summary,
               e.strengths, e.attention_points, e.overall_rating, e.created_at
        FROM interviews i
        JOIN interview_evaluations e ON e.organization_id = i.organization_id AND e.interview_id = i.id
        WHERE i.organization_id = $1 AND i.candidate_application_id = $2
          AND i.status = 'completed'
        ORDER BY i.scheduled_start_at ASC, i.id ASC, e.created_at ASC, e.id ASC
      `,
      [organizationId, candidateApplicationId]
    );
    for (const row of evaluations.rows) {
      push(
        "interview_evaluation",
        {
          recommendation: row.recommendation,
          summary: row.summary,
          strengths: row.strengths,
          attentionPoints: row.attention_points,
          overallRating: row.overall_rating
        },
        {
          interviewId: row.interview_id,
          interviewEvaluationId: row.id,
          authorship: { kind: "user", userId: row.evaluator_user_id }
        },
        null,
        nullableIso(row.created_at),
        row.evaluator_user_id
      );
    }

    void jobOpeningId;
    return sources;
  }
}

function mapDossier(row: Record<string, unknown>): CandidateDossier {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateApplicationId: String(row.candidate_application_id),
    candidateId: String(row.candidate_id),
    jobOpeningId: String(row.job_opening_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    blueprintVersionId: nullableString(row.blueprint_version_id),
    versionNumber: Number(row.version_number),
    previousVersionId: nullableString(row.previous_version_id),
    status: row.status as CandidateDossier["status"],
    generationKind: row.generation_kind as CandidateDossier["generationKind"],
    finalRecordReason: nullableString(row.final_record_reason),
    presentedSnapshot: normalizeObject(row.presented_snapshot),
    snapshotSchemaVersion: row.snapshot_schema_version as CandidateDossier["snapshotSchemaVersion"],
    contentHash: String(row.content_hash),
    idempotencyKeyHash: String(row.idempotency_key_hash),
    requestFingerprint: String(row.request_fingerprint),
    generatedByUserId: String(row.generated_by_user_id),
    generatedAt: toIso(row.generated_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapSource(row: Record<string, unknown>): CandidateDossierSource {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateDossierId: String(row.candidate_dossier_id),
    candidateApplicationId: String(row.candidate_application_id),
    sourceType: row.source_type as CandidateDossierSource["sourceType"],
    originKind: row.origin_kind as CandidateDossierSource["originKind"],
    fieldName: nullableString(row.field_name),
    candidateId: nullableString(row.candidate_id),
    jobOpeningId: nullableString(row.job_opening_id),
    jobOpeningVersionId: nullableString(row.job_opening_version_id),
    blueprintVersionId: nullableString(row.blueprint_version_id),
    preInterviewId: nullableString(row.pre_interview_id),
    preInterviewResponseId: nullableString(row.pre_interview_response_id),
    behavioralAssessmentId: nullableString(row.behavioral_assessment_id),
    behavioralAssessmentResultId: nullableString(row.behavioral_assessment_result_id),
    preAnalysisId: nullableString(row.pre_analysis_id),
    preAnalysisResultId: nullableString(row.pre_analysis_result_id),
    preAnalysisFindingId: nullableString(row.pre_analysis_finding_id),
    interviewId: nullableString(row.interview_id),
    interviewResponseId: nullableString(row.interview_response_id),
    interviewEvaluationId: nullableString(row.interview_evaluation_id),
    snapshotValue: row.snapshot_value,
    presentedValueSnapshot: normalizeObject(row.presented_value_snapshot),
    contentHash: String(row.content_hash),
    sourceCreatedAt: nullableIso(row.source_created_at),
    authoredByUserId: nullableString(row.authored_by_user_id),
    authorship: normalizeObject(row.authorship),
    presentedOrder: Number(row.presented_order),
    createdAt: toIso(row.created_at)
  };
}

function toSnake(value: string) {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function isEmpty(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
