import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { MembershipRole } from "../core/types";
import type { PreAnalysisRepository } from "../pre-analyses/repository";
import type {
  PreAnalysis,
  PreAnalysisApplicationContext,
  PreAnalysisBehavioralAssessmentContext,
  PreAnalysisBehavioralAssessmentResultContext,
  PreAnalysisBlueprintContentContext,
  PreAnalysisBlueprintVersionContext,
  PreAnalysisCandidateContext,
  PreAnalysisConsentContext,
  PreAnalysisEvent,
  PreAnalysisEvidence,
  PreAnalysisFinding,
  PreAnalysisJobOpeningVersionContext,
  PreAnalysisPreInterviewContext,
  PreAnalysisPreInterviewResponseContext,
  PreAnalysisResult
} from "../pre-analyses/types";

export class PostgresPreAnalysisRepository implements PreAnalysisRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  // ----------------------------------------------------------------------------------------
  // pre_analyses
  // ----------------------------------------------------------------------------------------

  async addPreAnalysis(p: PreAnalysis) {
    await this.connection.query(
      `
        INSERT INTO pre_analyses (
          id, organization_id, candidate_application_id, candidate_id, job_opening_id,
          job_opening_version_id, blueprint_version_id, pre_interview_id,
          behavioral_assessment_id, consent_id, attempt_number, previous_attempt_id, status,
          requested_by_user_id, requested_at, running_at, ai_execution_id, completed_at,
          failed_at, unavailable_at, cancelled_at, cancelled_by_user_id, cancellation_reason,
          error_category, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, $26
        )
      `,
      [
        p.id,
        p.organizationId,
        p.candidateApplicationId,
        p.candidateId,
        p.jobOpeningId,
        p.jobOpeningVersionId,
        p.blueprintVersionId,
        p.preInterviewId,
        p.behavioralAssessmentId,
        p.consentId,
        p.attemptNumber,
        p.previousAttemptId,
        p.status,
        p.requestedByUserId,
        p.requestedAt,
        p.runningAt,
        p.aiExecutionId,
        p.completedAt,
        p.failedAt,
        p.unavailableAt,
        p.cancelledAt,
        p.cancelledByUserId,
        p.cancellationReason,
        p.errorCategory,
        p.createdAt,
        p.updatedAt
      ]
    );
  }

  async updatePreAnalysis(p: PreAnalysis) {
    await this.connection.query(
      `
        UPDATE pre_analyses
        SET status = $3, running_at = $4, ai_execution_id = $5, completed_at = $6,
            failed_at = $7, unavailable_at = $8, cancelled_at = $9, cancelled_by_user_id = $10,
            cancellation_reason = $11, error_category = $12, updated_at = $13
        WHERE organization_id = $1 AND id = $2
      `,
      [
        p.organizationId,
        p.id,
        p.status,
        p.runningAt,
        p.aiExecutionId,
        p.completedAt,
        p.failedAt,
        p.unavailableAt,
        p.cancelledAt,
        p.cancelledByUserId,
        p.cancellationReason,
        p.errorCategory,
        p.updatedAt
      ]
    );
  }

  async findPreAnalysisById(organizationId: string, id: string) {
    const result = await this.connection.query(
      "SELECT * FROM pre_analyses WHERE organization_id = $1 AND id = $2",
      [organizationId, id]
    );
    return result.rows[0] ? mapPreAnalysis(result.rows[0]) : null;
  }

  async findPreAnalysisForUpdate(organizationId: string, id: string) {
    const result = await this.connection.query(
      "SELECT * FROM pre_analyses WHERE organization_id = $1 AND id = $2 FOR UPDATE",
      [organizationId, id]
    );
    return result.rows[0] ? mapPreAnalysis(result.rows[0]) : null;
  }

  async findOperationalByApplication(organizationId: string, candidateApplicationId: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM pre_analyses
        WHERE organization_id = $1 AND candidate_application_id = $2
          AND status IN ('requested', 'running')
        LIMIT 1
      `,
      [organizationId, candidateApplicationId]
    );
    return result.rows[0] ? mapPreAnalysis(result.rows[0]) : null;
  }

  async findMaxAttemptNumber(organizationId: string, candidateApplicationId: string) {
    const result = await this.connection.query(
      `
        SELECT COALESCE(MAX(attempt_number), 0)::int AS max_attempt
        FROM pre_analyses WHERE organization_id = $1 AND candidate_application_id = $2
      `,
      [organizationId, candidateApplicationId]
    );
    return result.rows[0].max_attempt as number;
  }

  async listByApplication(organizationId: string, candidateApplicationId: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM pre_analyses
        WHERE organization_id = $1 AND candidate_application_id = $2
        ORDER BY attempt_number DESC
      `,
      [organizationId, candidateApplicationId]
    );
    return result.rows.map(mapPreAnalysis);
  }

  async listStale(
    organizationId: string | null,
    status: "requested" | "running",
    olderThan: string
  ) {
    const result = await this.connection.query(
      `
        SELECT * FROM pre_analyses
        WHERE status = $1 AND created_at < $2 AND ($3::text IS NULL OR organization_id = $3)
        ORDER BY created_at ASC
      `,
      [status, olderThan, organizationId]
    );
    return result.rows.map(mapPreAnalysis);
  }

  // ----------------------------------------------------------------------------------------
  // Evidencias
  // ----------------------------------------------------------------------------------------

  async addEvidence(e: PreAnalysisEvidence) {
    await this.connection.query(
      `
        INSERT INTO pre_analysis_evidences (
          id, organization_id, pre_analysis_id, candidate_application_id, source_type,
          origin_kind, content_hash, snapshot_value, candidate_field_name, job_opening_id,
          job_opening_version_id, pre_interview_id, pre_interview_response_id,
          behavioral_assessment_id, behavioral_assessment_result_id, blueprint_version_id,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `,
      [
        e.id,
        e.organizationId,
        e.preAnalysisId,
        e.candidateApplicationId,
        e.sourceType,
        e.originKind,
        e.contentHash,
        e.snapshotValue,
        e.candidateFieldName,
        e.jobOpeningId,
        e.jobOpeningVersionId,
        e.preInterviewId,
        e.preInterviewResponseId,
        e.behavioralAssessmentId,
        e.behavioralAssessmentResultId,
        e.blueprintVersionId,
        e.createdAt
      ]
    );
  }

  async listEvidences(organizationId: string, preAnalysisId: string) {
    const result = await this.connection.query(
      "SELECT * FROM pre_analysis_evidences WHERE organization_id = $1 AND pre_analysis_id = $2",
      [organizationId, preAnalysisId]
    );
    return result.rows.map(mapEvidence);
  }

  // ----------------------------------------------------------------------------------------
  // Resultado / achados
  // ----------------------------------------------------------------------------------------

  async addResult(r: PreAnalysisResult) {
    await this.connection.query(
      `
        INSERT INTO pre_analysis_results (
          id, organization_id, pre_analysis_id, ai_execution_id, prompt_key, prompt_version,
          summary, limitations, disclaimer, calculated_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        r.id,
        r.organizationId,
        r.preAnalysisId,
        r.aiExecutionId,
        r.promptKey,
        r.promptVersion,
        r.summary,
        r.limitations,
        r.disclaimer,
        r.calculatedAt,
        r.createdAt
      ]
    );
  }

  async findResultByPreAnalysis(organizationId: string, preAnalysisId: string) {
    const result = await this.connection.query(
      "SELECT * FROM pre_analysis_results WHERE organization_id = $1 AND pre_analysis_id = $2",
      [organizationId, preAnalysisId]
    );
    return result.rows[0] ? mapResult(result.rows[0]) : null;
  }

  async addFinding(f: PreAnalysisFinding) {
    await this.connection.query(
      `
        INSERT INTO pre_analysis_findings (
          id, organization_id, pre_analysis_result_id, pre_analysis_id, category, text,
          display_order, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        f.id,
        f.organizationId,
        f.preAnalysisResultId,
        f.preAnalysisId,
        f.category,
        f.text,
        f.displayOrder,
        f.createdAt
      ]
    );
  }

  async addFindingEvidence(
    organizationId: string,
    findingId: string,
    evidenceId: string,
    preAnalysisId: string
  ) {
    await this.connection.query(
      `
        INSERT INTO pre_analysis_finding_evidences (
          id, organization_id, pre_analysis_finding_id, pre_analysis_evidence_id, pre_analysis_id,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [this.nextId("panfe"), organizationId, findingId, evidenceId, preAnalysisId, this.now()]
    );
  }

  async listFindings(organizationId: string, preAnalysisResultId: string) {
    const findings = await this.connection.query(
      `
        SELECT * FROM pre_analysis_findings
        WHERE organization_id = $1 AND pre_analysis_result_id = $2
        ORDER BY display_order ASC
      `,
      [organizationId, preAnalysisResultId]
    );
    const evidenceRows = await this.connection.query(
      `
        SELECT pre_analysis_finding_id, pre_analysis_evidence_id FROM pre_analysis_finding_evidences
        WHERE organization_id = $1 AND pre_analysis_finding_id = ANY($2::text[])
      `,
      [organizationId, findings.rows.map((r) => r.id)]
    );
    const evidenceByFinding = new Map<string, string[]>();
    for (const row of evidenceRows.rows) {
      const list = evidenceByFinding.get(row.pre_analysis_finding_id) ?? [];
      list.push(row.pre_analysis_evidence_id);
      evidenceByFinding.set(row.pre_analysis_finding_id, list);
    }
    return findings.rows.map((row) => mapFinding(row, evidenceByFinding.get(row.id) ?? []));
  }

  // ----------------------------------------------------------------------------------------
  // Eventos
  // ----------------------------------------------------------------------------------------

  async addEvent(e: PreAnalysisEvent) {
    await this.connection.query(
      `
        INSERT INTO pre_analysis_events (
          id, organization_id, pre_analysis_id, event_type, status_before, status_after, reason,
          metadata, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        e.id,
        e.organizationId,
        e.preAnalysisId,
        e.eventType,
        e.statusBefore,
        e.statusAfter,
        e.reason,
        JSON.stringify(e.metadata ?? {}),
        e.createdAt
      ]
    );
  }

  async listEvents(organizationId: string, preAnalysisId: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM pre_analysis_events
        WHERE organization_id = $1 AND pre_analysis_id = $2
        ORDER BY created_at ASC
      `,
      [organizationId, preAnalysisId]
    );
    return result.rows.map(mapEvent);
  }

  // ----------------------------------------------------------------------------------------
  // Contextos de leitura minimos
  // ----------------------------------------------------------------------------------------

  async findApplication(applicationId: string): Promise<PreAnalysisApplicationContext | null> {
    const result = await this.connection.query(
      `
        SELECT id, organization_id, candidate_id, job_opening_id, job_opening_version_id,
               application_status
        FROM candidate_applications WHERE id = $1
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
      applicationStatus: row.application_status
    };
  }

  async findCandidate(candidateId: string): Promise<PreAnalysisCandidateContext | null> {
    const result = await this.connection.query(
      `
        SELECT id, organization_id, status, professional_summary, experiences, education,
               certifications, languages, declared_competencies, availability
        FROM candidates WHERE id = $1
      `,
      [candidateId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organization_id,
      status: row.status,
      professionalSummary: row.professional_summary,
      experiences: row.experiences ?? [],
      education: row.education ?? [],
      certifications: row.certifications ?? [],
      languages: row.languages ?? [],
      declaredCompetencies: row.declared_competencies ?? [],
      availability: row.availability ?? {}
    };
  }

  async latestConsent(candidateId: string): Promise<PreAnalysisConsentContext | null> {
    const result = await this.connection.query(
      `
        SELECT id, status, expires_at FROM candidate_consents
        WHERE candidate_id = $1 AND purpose = 'ai_pre_analysis'
        ORDER BY consent_at DESC, created_at DESC LIMIT 1
      `,
      [candidateId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, status: row.status, expiresAt: row.expires_at };
  }

  async findJobOpeningVersion(
    jobOpeningVersionId: string
  ): Promise<PreAnalysisJobOpeningVersionContext | null> {
    const result = await this.connection.query(
      `
        SELECT id, job_opening_id, public_title, description, responsibilities, requirements,
               benefits
        FROM job_opening_versions WHERE id = $1
      `,
      [jobOpeningVersionId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      jobOpeningId: row.job_opening_id,
      publicTitle: row.public_title,
      description: row.description,
      responsibilities: row.responsibilities ?? [],
      requirements: row.requirements ?? [],
      benefits: row.benefits ?? []
    };
  }

  async findActiveBlueprintVersion(
    organizationId: string
  ): Promise<PreAnalysisBlueprintVersionContext | null> {
    const result = await this.connection.query(
      `
        SELECT id, organization_id FROM organization_blueprint_versions
        WHERE organization_id = $1 AND status = 'active' LIMIT 1
      `,
      [organizationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, organizationId: row.organization_id };
  }

  async findBlueprintContent(
    blueprintVersionId: string
  ): Promise<PreAnalysisBlueprintContentContext | null> {
    // O manifesto (Fase 15) e a unica fonte de proveniencia legitima: nunca le DNA/competencias
    // "atuais" direto, sempre a versao EXATA que o manifesto congelou na ativacao desta
    // Blueprint Version (ADR-0022, "Nao retroatividade").
    const dnaEntry = await this.connection.query(
      `
        SELECT component_version_id FROM organization_blueprint_manifest_items
        WHERE blueprint_version_id = $1 AND component_type = 'dna'
        LIMIT 1
      `,
      [blueprintVersionId]
    );
    const dnaVersionId = dnaEntry.rows[0]?.component_version_id as string | undefined;
    if (!dnaVersionId) return null;

    const dna = await this.connection.query(
      `
        SELECT mission, vision, purpose, values_content, culture_content,
               leadership_style_content, work_environment_content
        FROM organization_dna_versions WHERE id = $1
      `,
      [dnaVersionId]
    );
    const dnaRow = dna.rows[0];
    if (!dnaRow) return null;

    const competencyEntries = await this.connection.query(
      `
        SELECT snapshot_metadata FROM organization_blueprint_manifest_items
        WHERE blueprint_version_id = $1 AND component_type = 'competency_catalog_item'
      `,
      [blueprintVersionId]
    );

    return {
      blueprintVersionId,
      mission: dnaRow.mission ?? "",
      vision: dnaRow.vision ?? "",
      purpose: dnaRow.purpose ?? "",
      values: dnaRow.values_content ?? [],
      cultureContent: dnaRow.culture_content ?? "",
      leadershipStyleContent: dnaRow.leadership_style_content ?? "",
      workEnvironmentContent: dnaRow.work_environment_content ?? "",
      competencies: competencyEntries.rows.map((row) => {
        const metadata = (row.snapshot_metadata ?? {}) as Record<string, unknown>;
        return {
          code: String(metadata.code ?? ""),
          name: String(metadata.name ?? ""),
          category: String(metadata.category ?? "")
        };
      })
    };
  }

  async findCompletedPreInterview(
    candidateApplicationId: string
  ): Promise<PreAnalysisPreInterviewContext | null> {
    const result = await this.connection.query(
      `
        SELECT id, status FROM pre_interviews
        WHERE candidate_application_id = $1 AND status = 'completed'
        ORDER BY attempt_number DESC LIMIT 1
      `,
      [candidateApplicationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, status: row.status };
  }

  async listSubmittedPreInterviewResponses(
    preInterviewId: string
  ): Promise<PreAnalysisPreInterviewResponseContext[]> {
    const result = await this.connection.query(
      `
        SELECT r.id, r.pre_interview_id, r.submitted, q.snapshot_text, r.response_value
        FROM pre_interview_responses r
        LEFT JOIN pre_interview_questions q ON q.id = r.pre_interview_question_id
        WHERE r.pre_interview_id = $1 AND r.submitted = TRUE
      `,
      [preInterviewId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      preInterviewId: row.pre_interview_id,
      submitted: row.submitted,
      questionText: row.snapshot_text ?? null,
      responseValue: row.response_value
    }));
  }

  async findCompletedBehavioralAssessment(
    candidateApplicationId: string
  ): Promise<PreAnalysisBehavioralAssessmentContext | null> {
    const result = await this.connection.query(
      `
        SELECT a.id, a.status, r.id AS result_id
        FROM behavioral_assessments a
        LEFT JOIN behavioral_assessment_results r ON r.behavioral_assessment_id = a.id
        WHERE a.candidate_application_id = $1 AND a.status = 'completed'
        ORDER BY a.attempt_number DESC LIMIT 1
      `,
      [candidateApplicationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, status: row.status, resultId: row.result_id ?? null };
  }

  async findBehavioralAssessmentResult(
    resultId: string
  ): Promise<PreAnalysisBehavioralAssessmentResultContext | null> {
    const result = await this.connection.query(
      "SELECT id, behavioral_assessment_id, summary_text FROM behavioral_assessment_results WHERE id = $1",
      [resultId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const dimensions = await this.connection.query(
      `
        SELECT dimension_code, display_value, interpretation_text
        FROM behavioral_assessment_result_dimensions
        WHERE behavioral_assessment_result_id = $1
        ORDER BY display_order ASC
      `,
      [resultId]
    );
    return {
      id: row.id,
      behavioralAssessmentId: row.behavioral_assessment_id,
      summaryText: row.summary_text,
      dimensions: dimensions.rows.map((d) => ({
        dimensionCode: d.dimension_code,
        displayValue: d.display_value,
        interpretationText: d.interpretation_text
      }))
    };
  }

  async findMembershipRole(organizationId: string, userId: string): Promise<MembershipRole | null> {
    const result = await this.connection.query(
      `
        SELECT role FROM memberships
        WHERE organization_id = $1 AND user_id = $2 AND status = 'active'
      `,
      [organizationId, userId]
    );
    return result.rows[0]?.role ?? null;
  }
}

function mapPreAnalysis(row: Record<string, unknown>): PreAnalysis {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    candidateApplicationId: row.candidate_application_id as string,
    candidateId: row.candidate_id as string,
    jobOpeningId: row.job_opening_id as string,
    jobOpeningVersionId: row.job_opening_version_id as string,
    blueprintVersionId: (row.blueprint_version_id as string) ?? null,
    preInterviewId: (row.pre_interview_id as string) ?? null,
    behavioralAssessmentId: (row.behavioral_assessment_id as string) ?? null,
    consentId: row.consent_id as string,
    attemptNumber: row.attempt_number as number,
    previousAttemptId: (row.previous_attempt_id as string) ?? null,
    status: row.status as never,
    requestedByUserId: row.requested_by_user_id as string,
    requestedAt: toIso(row.requested_at),
    runningAt: row.running_at ? toIso(row.running_at) : null,
    aiExecutionId: (row.ai_execution_id as string) ?? null,
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    failedAt: row.failed_at ? toIso(row.failed_at) : null,
    unavailableAt: row.unavailable_at ? toIso(row.unavailable_at) : null,
    cancelledAt: row.cancelled_at ? toIso(row.cancelled_at) : null,
    cancelledByUserId: (row.cancelled_by_user_id as string) ?? null,
    cancellationReason: (row.cancellation_reason as string) ?? null,
    errorCategory: (row.error_category as never) ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  } as PreAnalysis;
}

function mapEvidence(row: Record<string, unknown>): PreAnalysisEvidence {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    preAnalysisId: row.pre_analysis_id as string,
    candidateApplicationId: row.candidate_application_id as string,
    sourceType: row.source_type as never,
    originKind: row.origin_kind as never,
    contentHash: (row.content_hash as string) ?? null,
    snapshotValue: (row.snapshot_value as string) ?? null,
    candidateFieldName: (row.candidate_field_name as never) ?? null,
    jobOpeningId: (row.job_opening_id as string) ?? null,
    jobOpeningVersionId: (row.job_opening_version_id as string) ?? null,
    preInterviewId: (row.pre_interview_id as string) ?? null,
    preInterviewResponseId: (row.pre_interview_response_id as string) ?? null,
    behavioralAssessmentId: (row.behavioral_assessment_id as string) ?? null,
    behavioralAssessmentResultId: (row.behavioral_assessment_result_id as string) ?? null,
    blueprintVersionId: (row.blueprint_version_id as string) ?? null,
    createdAt: toIso(row.created_at)
  };
}

function mapResult(row: Record<string, unknown>): PreAnalysisResult {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    preAnalysisId: row.pre_analysis_id as string,
    aiExecutionId: row.ai_execution_id as string,
    promptKey: row.prompt_key as string,
    promptVersion: row.prompt_version as number,
    summary: row.summary as string,
    limitations: row.limitations as string,
    disclaimer: row.disclaimer as string,
    calculatedAt: toIso(row.calculated_at),
    createdAt: toIso(row.created_at)
  };
}

function mapFinding(row: Record<string, unknown>, evidenceIds: string[]): PreAnalysisFinding {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    preAnalysisResultId: row.pre_analysis_result_id as string,
    preAnalysisId: row.pre_analysis_id as string,
    category: row.category as never,
    text: row.text as string,
    displayOrder: row.display_order as number,
    createdAt: toIso(row.created_at),
    evidenceIds
  };
}

function mapEvent(row: Record<string, unknown>): PreAnalysisEvent {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    preAnalysisId: row.pre_analysis_id as string,
    eventType: row.event_type as never,
    statusBefore: (row.status_before as never) ?? null,
    statusAfter: (row.status_after as never) ?? null,
    reason: (row.reason as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at)
  };
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : (value as string);
}
