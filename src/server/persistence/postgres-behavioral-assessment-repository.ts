import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { BehavioralAssessmentRepository } from "../behavioral-assessments/repository";
import type {
  BehavioralAssessment,
  BehavioralAssessmentAccessToken,
  BehavioralAssessmentApplicationContext,
  BehavioralAssessmentCandidateContext,
  BehavioralAssessmentConsentContext,
  BehavioralAssessmentEvent,
  BehavioralAssessmentResponse,
  BehavioralAssessmentResult,
  BehavioralAssessmentResultDimension,
  BehavioralInstrument,
  BehavioralInstrumentItem,
  BehavioralInstrumentVersion,
  JobOpeningBehavioralAssessmentSettings,
  OrganizationBehavioralInstrumentSettings
} from "../behavioral-assessments/types";
import type { MembershipRole } from "../core/types";

export class PostgresBehavioralAssessmentRepository implements BehavioralAssessmentRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  // ----------------------------------------------------------------------------------------
  // Instrumentos
  // ----------------------------------------------------------------------------------------

  async createInstrument(instrument: BehavioralInstrument) {
    await this.connection.query(
      `
        INSERT INTO behavioral_instruments (
          id, scope, organization_id, name, description, status, created_by_user_id,
          updated_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        instrument.id,
        instrument.scope,
        instrument.organizationId,
        instrument.name,
        instrument.description,
        instrument.status,
        instrument.createdByUserId,
        instrument.updatedByUserId,
        instrument.createdAt,
        instrument.updatedAt
      ]
    );
  }

  async updateInstrument(instrument: BehavioralInstrument) {
    await this.connection.query(
      `
        UPDATE behavioral_instruments
        SET name = $3, description = $4, status = $5, updated_by_user_id = $6, updated_at = $7
        WHERE id = $1 AND scope = $2
      `,
      [
        instrument.id,
        instrument.scope,
        instrument.name,
        instrument.description,
        instrument.status,
        instrument.updatedByUserId,
        instrument.updatedAt
      ]
    );
  }

  async findInstrumentById(instrumentId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_instruments WHERE id = $1",
      [instrumentId]
    );
    return result.rows[0] ? mapInstrument(result.rows[0]) : null;
  }

  async findInstrumentForUpdate(instrumentId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_instruments WHERE id = $1 FOR UPDATE",
      [instrumentId]
    );
    return result.rows[0] ? mapInstrument(result.rows[0]) : null;
  }

  async listInstruments(filter: { scope?: "platform" | "organization"; organizationId?: string }) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.scope) {
      params.push(filter.scope);
      conditions.push(`scope = $${params.length}`);
    }
    if (filter.organizationId) {
      params.push(filter.organizationId);
      conditions.push(`organization_id = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.connection.query(
      `SELECT * FROM behavioral_instruments ${where} ORDER BY created_at DESC`,
      params
    );
    return result.rows.map(mapInstrument);
  }

  // ----------------------------------------------------------------------------------------
  // Versoes
  // ----------------------------------------------------------------------------------------

  async createVersion(version: BehavioralInstrumentVersion) {
    await this.connection.query(
      `
        INSERT INTO behavioral_instrument_versions (
          id, behavioral_instrument_id, version_number, status, methodology_key,
          calculation_method_version, dimensions, instructions, candidate_result_visibility,
          raw_response_owner_visibility, created_by_user_id, published_at, archived_at,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `,
      versionParams(version)
    );
  }

  async updateVersion(version: BehavioralInstrumentVersion) {
    // Params proprios, contiguos ($1..$9) -- nunca reaproveita `versionParams` (usado por
    // `createVersion`) aqui: aquele array tem 15 posicoes para o INSERT completo, mas esta
    // UPDATE so referencia um subconjunto delas. Pular numeros de parametro no meio de uma
    // query (por exemplo, usar $4/$7 sem nunca referenciar $3/$5/$6) faz o Postgres tentar
    // inferir o tipo de TODOS os parametros ate o maior indice referenciado -- $3/$5/$6 nunca
    // aparecem no texto da query, entao o driver nao consegue determinar seu tipo e a query
    // inteira falha em runtime com "could not determine data type of parameter $3" (42P18).
    await this.connection.query(
      `
        UPDATE behavioral_instrument_versions
        SET status = $3, dimensions = $4, instructions = $5, candidate_result_visibility = $6,
            raw_response_owner_visibility = $7, published_at = $8, archived_at = $9,
            updated_at = $10
        WHERE id = $1 AND behavioral_instrument_id = $2
      `,
      [
        version.id,
        version.behavioralInstrumentId,
        version.status,
        JSON.stringify(version.dimensions),
        version.instructions,
        version.candidateResultVisibility,
        version.rawResponseOwnerVisibility,
        version.publishedAt,
        version.archivedAt,
        version.updatedAt
      ]
    );
  }

  async findVersionById(versionId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_instrument_versions WHERE id = $1",
      [versionId]
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async findVersionForUpdate(versionId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_instrument_versions WHERE id = $1 FOR UPDATE",
      [versionId]
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async findActiveVersion(instrumentId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_instrument_versions WHERE behavioral_instrument_id = $1 AND status = 'active' LIMIT 1",
      [instrumentId]
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async findDraftVersion(instrumentId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_instrument_versions WHERE behavioral_instrument_id = $1 AND status = 'draft' LIMIT 1",
      [instrumentId]
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async listVersionsByInstrument(instrumentId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_instrument_versions WHERE behavioral_instrument_id = $1 ORDER BY version_number DESC",
      [instrumentId]
    );
    return result.rows.map(mapVersion);
  }

  async findMaxVersionNumber(instrumentId: string) {
    const result = await this.connection.query(
      "SELECT COALESCE(MAX(version_number), 0)::int AS max FROM behavioral_instrument_versions WHERE behavioral_instrument_id = $1",
      [instrumentId]
    );
    return Number(result.rows[0]?.max ?? 0);
  }

  // ----------------------------------------------------------------------------------------
  // Itens
  // ----------------------------------------------------------------------------------------

  async addItem(item: BehavioralInstrumentItem) {
    await this.connection.query(
      `
        INSERT INTO behavioral_instrument_items (
          id, behavioral_instrument_version_id, item_key, item_type, prompt_text,
          external_item_reference, dimension_mapping, scoring_metadata, options, display_order,
          required, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        item.id,
        item.behavioralInstrumentVersionId,
        item.itemKey,
        item.itemType,
        item.promptText,
        item.externalItemReference,
        JSON.stringify(item.dimensionMapping),
        JSON.stringify(item.scoringMetadata),
        JSON.stringify(item.options),
        item.displayOrder,
        item.required,
        item.createdAt
      ]
    );
  }

  async listItemsByVersion(versionId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_instrument_items WHERE behavioral_instrument_version_id = $1 ORDER BY display_order ASC, created_at ASC",
      [versionId]
    );
    return result.rows.map(mapItem);
  }

  // ----------------------------------------------------------------------------------------
  // Disponibilidade (Organization x instrumento global)
  // ----------------------------------------------------------------------------------------

  async findOrganizationSettings(organizationId: string, instrumentId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_behavioral_instrument_settings WHERE organization_id = $1 AND behavioral_instrument_id = $2",
      [organizationId, instrumentId]
    );
    return result.rows[0] ? mapOrganizationSettings(result.rows[0]) : null;
  }

  async findOrganizationSettingsForUpdate(organizationId: string, instrumentId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_behavioral_instrument_settings WHERE organization_id = $1 AND behavioral_instrument_id = $2 FOR UPDATE",
      [organizationId, instrumentId]
    );
    return result.rows[0] ? mapOrganizationSettings(result.rows[0]) : null;
  }

  async createOrganizationSettings(settings: OrganizationBehavioralInstrumentSettings) {
    await this.connection.query(
      `
        INSERT INTO organization_behavioral_instrument_settings (
          id, organization_id, behavioral_instrument_id, enabled, created_by_user_id,
          updated_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        settings.id,
        settings.organizationId,
        settings.behavioralInstrumentId,
        settings.enabled,
        settings.createdByUserId,
        settings.updatedByUserId,
        settings.createdAt,
        settings.updatedAt
      ]
    );
  }

  async updateOrganizationSettings(settings: OrganizationBehavioralInstrumentSettings) {
    await this.connection.query(
      `
        UPDATE organization_behavioral_instrument_settings
        SET enabled = $3, updated_by_user_id = $4, updated_at = $5
        WHERE organization_id = $1 AND behavioral_instrument_id = $2
      `,
      [
        settings.organizationId,
        settings.behavioralInstrumentId,
        settings.enabled,
        settings.updatedByUserId,
        settings.updatedAt
      ]
    );
  }

  async listOrganizationSettings(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_behavioral_instrument_settings WHERE organization_id = $1",
      [organizationId]
    );
    return result.rows.map(mapOrganizationSettings);
  }

  // ----------------------------------------------------------------------------------------
  // Configuracao da vaga
  // ----------------------------------------------------------------------------------------

  async findJobOpeningOrganizationId(jobOpeningId: string) {
    const result = await this.connection.query(
      "SELECT organization_id FROM job_openings WHERE id = $1",
      [jobOpeningId]
    );
    return result.rows[0] ? String(result.rows[0].organization_id) : null;
  }

  async findJobOpeningSettings(organizationId: string, jobOpeningId: string) {
    const result = await this.connection.query(
      "SELECT * FROM job_opening_behavioral_assessment_settings WHERE organization_id = $1 AND job_opening_id = $2",
      [organizationId, jobOpeningId]
    );
    return result.rows[0] ? mapJobOpeningSettings(result.rows[0]) : null;
  }

  async findJobOpeningSettingsForUpdate(organizationId: string, jobOpeningId: string) {
    const result = await this.connection.query(
      "SELECT * FROM job_opening_behavioral_assessment_settings WHERE organization_id = $1 AND job_opening_id = $2 FOR UPDATE",
      [organizationId, jobOpeningId]
    );
    return result.rows[0] ? mapJobOpeningSettings(result.rows[0]) : null;
  }

  async createJobOpeningSettings(settings: JobOpeningBehavioralAssessmentSettings) {
    await this.connection.query(
      `
        INSERT INTO job_opening_behavioral_assessment_settings (
          id, organization_id, job_opening_id, enabled, behavioral_instrument_id,
          behavioral_instrument_scope, behavioral_instrument_version_id, created_by_user_id,
          updated_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      jobOpeningSettingsParams(settings)
    );
  }

  async updateJobOpeningSettings(settings: JobOpeningBehavioralAssessmentSettings) {
    // Params proprios, contiguos -- mesmo motivo do comentario em `updateVersion`/
    // `updateAssessment`: nunca reaproveitar `jobOpeningSettingsParams` (as 11 posicoes do
    // INSERT) aqui, pois esta UPDATE nunca muta `created_by_user_id`/`created_at`.
    await this.connection.query(
      `
        UPDATE job_opening_behavioral_assessment_settings
        SET enabled = $4, behavioral_instrument_id = $5, behavioral_instrument_scope = $6,
            behavioral_instrument_version_id = $7, updated_by_user_id = $8, updated_at = $9
        WHERE id = $1 AND organization_id = $2 AND job_opening_id = $3
      `,
      [
        settings.id,
        settings.organizationId,
        settings.jobOpeningId,
        settings.enabled,
        settings.behavioralInstrumentId,
        settings.behavioralInstrumentScope,
        settings.behavioralInstrumentVersionId,
        settings.updatedByUserId,
        settings.updatedAt
      ]
    );
  }

  // ----------------------------------------------------------------------------------------
  // Aplicacoes / tentativas
  // ----------------------------------------------------------------------------------------

  async createAssessment(assessment: BehavioralAssessment) {
    await this.connection.query(
      `
        INSERT INTO behavioral_assessments (
          id, organization_id, candidate_application_id, job_opening_id, job_opening_version_id,
          blueprint_version_id, behavioral_instrument_id, behavioral_instrument_scope,
          behavioral_instrument_owner_organization_id, behavioral_instrument_version_id,
          origin_type, attempt_number, previous_attempt_id, status, candidate_consent_id,
          created_source, created_by_user_id, available_at, started_at, completed_at,
          cancelled_at, cancelled_by_user_id, cancellation_reason, expired_at, expires_at,
          external_provider, external_reference_id, applied_at_external, completed_at_external,
          imported_at, imported_by_user_id, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33
        )
      `,
      assessmentParams(assessment)
    );
  }

  async updateAssessment(assessment: BehavioralAssessment) {
    // Params proprios, contiguos -- nunca `assessmentParams` (as 33 posicoes do INSERT) aqui:
    // esta UPDATE so muta um subconjunto de colunas (as demais, incluindo toda a proveniencia
    // externa, sao fixadas na criacao e nunca mudam depois). Ver o comentario identico em
    // `updateVersion` -- parametros pulados no meio da query quebram em runtime com
    // "could not determine data type of parameter" (42P18).
    await this.connection.query(
      `
        UPDATE behavioral_assessments
        SET status = $3,
            available_at = $4,
            started_at = $5,
            completed_at = $6,
            cancelled_at = $7,
            cancelled_by_user_id = $8,
            cancellation_reason = $9,
            expired_at = $10,
            expires_at = $11,
            updated_at = $12
        WHERE id = $1 AND organization_id = $2
      `,
      [
        assessment.id,
        assessment.organizationId,
        assessment.status,
        assessment.availableAt,
        assessment.startedAt,
        assessment.completedAt,
        assessment.cancelledAt,
        assessment.cancelledByUserId,
        assessment.cancellationReason,
        assessment.expiredAt,
        assessment.expiresAt,
        assessment.updatedAt
      ]
    );
  }

  async findAssessmentById(assessmentId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_assessments WHERE id = $1",
      [assessmentId]
    );
    return result.rows[0] ? mapAssessment(result.rows[0]) : null;
  }

  async findAssessmentForUpdate(assessmentId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_assessments WHERE id = $1 FOR UPDATE",
      [assessmentId]
    );
    return result.rows[0] ? mapAssessment(result.rows[0]) : null;
  }

  async findOperationalByApplication(
    organizationId: string,
    candidateApplicationId: string,
    instrumentId: string
  ) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM behavioral_assessments
        WHERE organization_id = $1
          AND candidate_application_id = $2
          AND behavioral_instrument_id = $3
          AND status IN ('draft', 'available', 'in_progress')
        LIMIT 1
      `,
      [organizationId, candidateApplicationId, instrumentId]
    );
    return result.rows[0] ? mapAssessment(result.rows[0]) : null;
  }

  async findMaxAttemptNumber(
    organizationId: string,
    candidateApplicationId: string,
    instrumentId: string
  ) {
    // SELECT simples, sem FOR UPDATE proprio -- a serializacao vem do lock ja obtido pelo
    // chamador em candidate_applications (Correcao Final do Plano Tecnico, item 22).
    const result = await this.connection.query(
      "SELECT COALESCE(MAX(attempt_number), 0)::int AS max FROM behavioral_assessments WHERE organization_id = $1 AND candidate_application_id = $2 AND behavioral_instrument_id = $3",
      [organizationId, candidateApplicationId, instrumentId]
    );
    return Number(result.rows[0]?.max ?? 0);
  }

  async listByApplication(organizationId: string, candidateApplicationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_assessments WHERE organization_id = $1 AND candidate_application_id = $2 ORDER BY created_at DESC",
      [organizationId, candidateApplicationId]
    );
    return result.rows.map(mapAssessment);
  }

  async listByOrganization(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_assessments WHERE organization_id = $1 ORDER BY created_at DESC",
      [organizationId]
    );
    return result.rows.map(mapAssessment);
  }

  async findByExternalReference(
    organizationId: string,
    instrumentId: string,
    externalProvider: string,
    externalReferenceId: string
  ) {
    const result = await this.connection.query(
      `
        SELECT * FROM behavioral_assessments
        WHERE organization_id = $1 AND behavioral_instrument_id = $2 AND external_provider = $3
          AND external_reference_id = $4
        LIMIT 1
      `,
      [organizationId, instrumentId, externalProvider, externalReferenceId]
    );
    return result.rows[0] ? mapAssessment(result.rows[0]) : null;
  }

  // ----------------------------------------------------------------------------------------
  // Respostas
  // ----------------------------------------------------------------------------------------

  async upsertResponse(response: BehavioralAssessmentResponse) {
    const result = await this.connection.query(
      `
        INSERT INTO behavioral_assessment_responses (
          id, organization_id, behavioral_assessment_id, behavioral_instrument_version_id,
          behavioral_instrument_item_id, response_value, submitted, created_at, updated_at,
          submitted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (organization_id, behavioral_assessment_id, behavioral_instrument_item_id)
        DO UPDATE SET response_value = EXCLUDED.response_value, updated_at = EXCLUDED.updated_at
        RETURNING *
      `,
      [
        response.id,
        response.organizationId,
        response.behavioralAssessmentId,
        response.behavioralInstrumentVersionId,
        response.behavioralInstrumentItemId,
        JSON.stringify(response.responseValue),
        response.submitted,
        response.createdAt,
        response.updatedAt,
        response.submittedAt
      ]
    );
    return mapResponse(result.rows[0]);
  }

  async markResponsesSubmitted(assessmentId: string, submittedAt: string) {
    await this.connection.query(
      "UPDATE behavioral_assessment_responses SET submitted = TRUE, submitted_at = $2, updated_at = $2 WHERE behavioral_assessment_id = $1",
      [assessmentId, submittedAt]
    );
  }

  async listResponses(assessmentId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_assessment_responses WHERE behavioral_assessment_id = $1 ORDER BY created_at ASC",
      [assessmentId]
    );
    return result.rows.map(mapResponse);
  }

  // ----------------------------------------------------------------------------------------
  // Resultado
  // ----------------------------------------------------------------------------------------

  async createResult(result: BehavioralAssessmentResult) {
    await this.connection.query(
      `
        INSERT INTO behavioral_assessment_results (
          id, organization_id, behavioral_assessment_id, behavioral_instrument_version_id,
          calculation_method_version, origin, summary_text, calculated_at, imported_at,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        result.id,
        result.organizationId,
        result.behavioralAssessmentId,
        result.behavioralInstrumentVersionId,
        result.calculationMethodVersion,
        result.origin,
        result.summaryText,
        result.calculatedAt,
        result.importedAt,
        result.createdAt
      ]
    );
  }

  async addResultDimension(dimension: BehavioralAssessmentResultDimension) {
    await this.connection.query(
      `
        INSERT INTO behavioral_assessment_result_dimensions (
          id, organization_id, behavioral_assessment_result_id, dimension_code, label,
          raw_value, display_value, unit, range_min, range_max, interpretation_text,
          display_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        dimension.id,
        dimension.organizationId,
        dimension.behavioralAssessmentResultId,
        dimension.dimensionCode,
        dimension.label,
        JSON.stringify(dimension.rawValue),
        dimension.displayValue,
        dimension.unit,
        dimension.rangeMin,
        dimension.rangeMax,
        dimension.interpretationText,
        dimension.displayOrder
      ]
    );
  }

  async findResultByAssessment(assessmentId: string) {
    const resultRow = await this.connection.query(
      "SELECT * FROM behavioral_assessment_results WHERE behavioral_assessment_id = $1",
      [assessmentId]
    );
    if (!resultRow.rows[0]) {
      return null;
    }
    const result = mapResult(resultRow.rows[0]);
    const dimensionRows = await this.connection.query(
      "SELECT * FROM behavioral_assessment_result_dimensions WHERE behavioral_assessment_result_id = $1 ORDER BY display_order ASC",
      [result.id]
    );
    return { result, dimensions: dimensionRows.rows.map(mapResultDimension) };
  }

  // ----------------------------------------------------------------------------------------
  // Tokens
  // ----------------------------------------------------------------------------------------

  async addAccessToken(token: BehavioralAssessmentAccessToken) {
    await this.connection.query(
      `
        INSERT INTO behavioral_assessment_access_tokens (
          id, organization_id, behavioral_assessment_id, token_hash, status, expires_at,
          created_at, revoked_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        token.id,
        token.organizationId,
        token.behavioralAssessmentId,
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
      "SELECT * FROM behavioral_assessment_access_tokens WHERE token_hash = $1",
      [tokenHash]
    );
    return result.rows[0] ? mapAccessToken(result.rows[0]) : null;
  }

  async revokeActiveTokens(organizationId: string, assessmentId: string) {
    await this.connection.query(
      `
        UPDATE behavioral_assessment_access_tokens
        SET status = 'revoked', revoked_at = NOW()
        WHERE organization_id = $1 AND behavioral_assessment_id = $2 AND status = 'active'
      `,
      [organizationId, assessmentId]
    );
  }

  // ----------------------------------------------------------------------------------------
  // Eventos
  // ----------------------------------------------------------------------------------------

  async addEvent(event: BehavioralAssessmentEvent) {
    await this.connection.query(
      `
        INSERT INTO behavioral_assessment_events (
          id, organization_id, behavioral_assessment_id, event_type, status_before, status_after,
          reason, metadata, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        event.id,
        event.organizationId,
        event.behavioralAssessmentId,
        event.eventType,
        event.statusBefore,
        event.statusAfter,
        event.reason,
        JSON.stringify(event.metadata),
        event.createdAt
      ]
    );
  }

  async listEvents(assessmentId: string) {
    const result = await this.connection.query(
      "SELECT * FROM behavioral_assessment_events WHERE behavioral_assessment_id = $1 ORDER BY created_at ASC, id ASC",
      [assessmentId]
    );
    return result.rows.map(mapEvent);
  }

  // ----------------------------------------------------------------------------------------
  // Contextos
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

  async latestConsentByPurpose(candidateId: string, purpose: string) {
    const result = await this.connection.query(
      `
        SELECT id, status, expires_at
        FROM candidate_consents
        WHERE candidate_id = $1 AND purpose = $2
        ORDER BY consent_at DESC, created_at DESC, id DESC
        LIMIT 1
      `,
      [candidateId, purpose]
    );
    return result.rows[0] ? mapConsentContext(result.rows[0]) : null;
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

function versionParams(version: BehavioralInstrumentVersion) {
  return [
    version.id,
    version.behavioralInstrumentId,
    version.versionNumber,
    version.status,
    version.methodologyKey,
    version.calculationMethodVersion,
    JSON.stringify(version.dimensions),
    version.instructions,
    version.candidateResultVisibility,
    version.rawResponseOwnerVisibility,
    version.createdByUserId,
    version.publishedAt,
    version.archivedAt,
    version.createdAt,
    version.updatedAt
  ];
}

function jobOpeningSettingsParams(settings: JobOpeningBehavioralAssessmentSettings) {
  return [
    settings.id,
    settings.organizationId,
    settings.jobOpeningId,
    settings.enabled,
    settings.behavioralInstrumentId,
    settings.behavioralInstrumentScope,
    settings.behavioralInstrumentVersionId,
    settings.createdByUserId,
    settings.updatedByUserId,
    settings.createdAt,
    settings.updatedAt
  ];
}

function assessmentParams(assessment: BehavioralAssessment) {
  return [
    assessment.id,
    assessment.organizationId,
    assessment.candidateApplicationId,
    assessment.jobOpeningId,
    assessment.jobOpeningVersionId,
    assessment.blueprintVersionId,
    assessment.behavioralInstrumentId,
    assessment.behavioralInstrumentScope,
    assessment.behavioralInstrumentOwnerOrganizationId,
    assessment.behavioralInstrumentVersionId,
    assessment.originType,
    assessment.attemptNumber,
    assessment.previousAttemptId,
    assessment.status,
    assessment.candidateConsentId,
    assessment.createdSource,
    assessment.createdByUserId,
    assessment.availableAt,
    assessment.startedAt,
    assessment.completedAt,
    assessment.cancelledAt,
    assessment.cancelledByUserId,
    assessment.cancellationReason,
    assessment.expiredAt,
    assessment.expiresAt,
    assessment.externalProvider,
    assessment.externalReferenceId,
    assessment.appliedAtExternal,
    assessment.completedAtExternal,
    assessment.importedAt,
    assessment.importedByUserId,
    assessment.createdAt,
    assessment.updatedAt
  ];
}

function mapInstrument(row: Record<string, unknown>): BehavioralInstrument {
  return {
    id: String(row.id),
    scope: row.scope as BehavioralInstrument["scope"],
    organizationId: nullableString(row.organization_id),
    name: String(row.name),
    description: String(row.description ?? ""),
    status: row.status as BehavioralInstrument["status"],
    createdByUserId: nullableString(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapVersion(row: Record<string, unknown>): BehavioralInstrumentVersion {
  return {
    id: String(row.id),
    behavioralInstrumentId: String(row.behavioral_instrument_id),
    versionNumber: Number(row.version_number),
    status: row.status as BehavioralInstrumentVersion["status"],
    methodologyKey: String(row.methodology_key),
    calculationMethodVersion: String(row.calculation_method_version),
    dimensions: normalizeArray(row.dimensions),
    instructions: nullableString(row.instructions),
    candidateResultVisibility:
      row.candidate_result_visibility as BehavioralInstrumentVersion["candidateResultVisibility"],
    rawResponseOwnerVisibility:
      row.raw_response_owner_visibility as BehavioralInstrumentVersion["rawResponseOwnerVisibility"],
    createdByUserId: nullableString(row.created_by_user_id),
    publishedAt: nullableIso(row.published_at),
    archivedAt: nullableIso(row.archived_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapItem(row: Record<string, unknown>): BehavioralInstrumentItem {
  return {
    id: String(row.id),
    behavioralInstrumentVersionId: String(row.behavioral_instrument_version_id),
    itemKey: String(row.item_key),
    itemType: row.item_type as BehavioralInstrumentItem["itemType"],
    promptText: nullableString(row.prompt_text),
    externalItemReference: nullableString(row.external_item_reference),
    dimensionMapping: normalizeArray(row.dimension_mapping),
    scoringMetadata: normalizeObject(row.scoring_metadata),
    options: normalizeArray(row.options),
    displayOrder: Number(row.display_order),
    required: Boolean(row.required),
    createdAt: toIso(row.created_at)
  };
}

function mapOrganizationSettings(
  row: Record<string, unknown>
): OrganizationBehavioralInstrumentSettings {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    behavioralInstrumentId: String(row.behavioral_instrument_id),
    enabled: Boolean(row.enabled),
    createdByUserId: nullableString(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapJobOpeningSettings(
  row: Record<string, unknown>
): JobOpeningBehavioralAssessmentSettings {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    jobOpeningId: String(row.job_opening_id),
    enabled: Boolean(row.enabled),
    behavioralInstrumentId: nullableString(row.behavioral_instrument_id),
    behavioralInstrumentScope: nullableString(
      row.behavioral_instrument_scope
    ) as JobOpeningBehavioralAssessmentSettings["behavioralInstrumentScope"],
    behavioralInstrumentVersionId: nullableString(row.behavioral_instrument_version_id),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapAssessment(row: Record<string, unknown>): BehavioralAssessment {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateApplicationId: String(row.candidate_application_id),
    jobOpeningId: String(row.job_opening_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    blueprintVersionId: nullableString(row.blueprint_version_id),
    behavioralInstrumentId: String(row.behavioral_instrument_id),
    behavioralInstrumentScope:
      row.behavioral_instrument_scope as BehavioralAssessment["behavioralInstrumentScope"],
    behavioralInstrumentOwnerOrganizationId: nullableString(
      row.behavioral_instrument_owner_organization_id
    ),
    behavioralInstrumentVersionId: String(row.behavioral_instrument_version_id),
    originType: row.origin_type as BehavioralAssessment["originType"],
    attemptNumber: Number(row.attempt_number),
    previousAttemptId: nullableString(row.previous_attempt_id),
    status: row.status as BehavioralAssessment["status"],
    candidateConsentId: String(row.candidate_consent_id),
    createdSource: row.created_source as BehavioralAssessment["createdSource"],
    createdByUserId: String(row.created_by_user_id),
    availableAt: nullableIso(row.available_at),
    startedAt: nullableIso(row.started_at),
    completedAt: nullableIso(row.completed_at),
    cancelledAt: nullableIso(row.cancelled_at),
    cancelledByUserId: nullableString(row.cancelled_by_user_id),
    cancellationReason: nullableString(row.cancellation_reason),
    expiredAt: nullableIso(row.expired_at),
    expiresAt: nullableIso(row.expires_at),
    externalProvider: nullableString(row.external_provider),
    externalReferenceId: nullableString(row.external_reference_id),
    appliedAtExternal: nullableIso(row.applied_at_external),
    completedAtExternal: nullableIso(row.completed_at_external),
    importedAt: nullableIso(row.imported_at),
    importedByUserId: nullableString(row.imported_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapResponse(row: Record<string, unknown>): BehavioralAssessmentResponse {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    behavioralAssessmentId: String(row.behavioral_assessment_id),
    behavioralInstrumentVersionId: String(row.behavioral_instrument_version_id),
    behavioralInstrumentItemId: String(row.behavioral_instrument_item_id),
    responseValue: row.response_value,
    submitted: Boolean(row.submitted),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    submittedAt: nullableIso(row.submitted_at)
  };
}

function mapResult(row: Record<string, unknown>): BehavioralAssessmentResult {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    behavioralAssessmentId: String(row.behavioral_assessment_id),
    behavioralInstrumentVersionId: String(row.behavioral_instrument_version_id),
    calculationMethodVersion: String(row.calculation_method_version),
    origin: row.origin as BehavioralAssessmentResult["origin"],
    summaryText: nullableString(row.summary_text),
    calculatedAt: nullableIso(row.calculated_at),
    importedAt: nullableIso(row.imported_at),
    createdAt: toIso(row.created_at)
  };
}

function mapResultDimension(row: Record<string, unknown>): BehavioralAssessmentResultDimension {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    behavioralAssessmentResultId: String(row.behavioral_assessment_result_id),
    dimensionCode: String(row.dimension_code),
    label: nullableString(row.label),
    rawValue: row.raw_value,
    displayValue: nullableString(row.display_value),
    unit: nullableString(row.unit),
    rangeMin: row.range_min === null || row.range_min === undefined ? null : Number(row.range_min),
    rangeMax: row.range_max === null || row.range_max === undefined ? null : Number(row.range_max),
    interpretationText: nullableString(row.interpretation_text),
    displayOrder: Number(row.display_order)
  };
}

function mapEvent(row: Record<string, unknown>): BehavioralAssessmentEvent {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    behavioralAssessmentId: String(row.behavioral_assessment_id),
    eventType: row.event_type as BehavioralAssessmentEvent["eventType"],
    statusBefore: nullableString(row.status_before) as BehavioralAssessmentEvent["statusBefore"],
    statusAfter: nullableString(row.status_after) as BehavioralAssessmentEvent["statusAfter"],
    reason: nullableString(row.reason),
    metadata: normalizeStringRecord(row.metadata),
    createdAt: toIso(row.created_at)
  };
}

function mapAccessToken(row: Record<string, unknown>): BehavioralAssessmentAccessToken {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    behavioralAssessmentId: String(row.behavioral_assessment_id),
    tokenHash: String(row.token_hash),
    status: row.status as BehavioralAssessmentAccessToken["status"],
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
    revokedAt: nullableIso(row.revoked_at)
  };
}

function mapApplicationContext(
  row: Record<string, unknown>
): BehavioralAssessmentApplicationContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateId: String(row.candidate_id),
    jobOpeningId: String(row.job_opening_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    applicationStatus:
      row.application_status as BehavioralAssessmentApplicationContext["applicationStatus"]
  };
}

function mapCandidateContext(row: Record<string, unknown>): BehavioralAssessmentCandidateContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: row.status as BehavioralAssessmentCandidateContext["status"]
  };
}

function mapConsentContext(row: Record<string, unknown>): BehavioralAssessmentConsentContext {
  return {
    id: String(row.id),
    status: row.status as BehavioralAssessmentConsentContext["status"],
    expiresAt: nullableIso(row.expires_at)
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
