import type { MembershipRole } from "../core/types";
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
} from "./types";

export interface BehavioralAssessmentRepository {
  nextId(prefix: string): string;
  now(): string;

  // Instrumentos
  createInstrument(instrument: BehavioralInstrument): Promise<void>;
  updateInstrument(instrument: BehavioralInstrument): Promise<void>;
  findInstrumentById(instrumentId: string): Promise<BehavioralInstrument | null>;
  findInstrumentForUpdate(instrumentId: string): Promise<BehavioralInstrument | null>;
  listInstruments(filter: {
    scope?: "platform" | "organization";
    organizationId?: string;
  }): Promise<BehavioralInstrument[]>;

  // Versoes
  createVersion(version: BehavioralInstrumentVersion): Promise<void>;
  updateVersion(version: BehavioralInstrumentVersion): Promise<void>;
  findVersionById(versionId: string): Promise<BehavioralInstrumentVersion | null>;
  findVersionForUpdate(versionId: string): Promise<BehavioralInstrumentVersion | null>;
  findActiveVersion(instrumentId: string): Promise<BehavioralInstrumentVersion | null>;
  findDraftVersion(instrumentId: string): Promise<BehavioralInstrumentVersion | null>;
  listVersionsByInstrument(instrumentId: string): Promise<BehavioralInstrumentVersion[]>;
  findMaxVersionNumber(instrumentId: string): Promise<number>;

  // Itens
  addItem(item: BehavioralInstrumentItem): Promise<void>;
  listItemsByVersion(versionId: string): Promise<BehavioralInstrumentItem[]>;

  // Disponibilidade (Organization x instrumento global)
  findOrganizationSettings(
    organizationId: string,
    instrumentId: string
  ): Promise<OrganizationBehavioralInstrumentSettings | null>;
  findOrganizationSettingsForUpdate(
    organizationId: string,
    instrumentId: string
  ): Promise<OrganizationBehavioralInstrumentSettings | null>;
  createOrganizationSettings(settings: OrganizationBehavioralInstrumentSettings): Promise<void>;
  updateOrganizationSettings(settings: OrganizationBehavioralInstrumentSettings): Promise<void>;
  listOrganizationSettings(
    organizationId: string
  ): Promise<OrganizationBehavioralInstrumentSettings[]>;

  // Configuracao da vaga
  findJobOpeningOrganizationId(jobOpeningId: string): Promise<string | null>;
  findJobOpeningSettings(
    organizationId: string,
    jobOpeningId: string
  ): Promise<JobOpeningBehavioralAssessmentSettings | null>;
  findJobOpeningSettingsForUpdate(
    organizationId: string,
    jobOpeningId: string
  ): Promise<JobOpeningBehavioralAssessmentSettings | null>;
  createJobOpeningSettings(settings: JobOpeningBehavioralAssessmentSettings): Promise<void>;
  updateJobOpeningSettings(settings: JobOpeningBehavioralAssessmentSettings): Promise<void>;

  // Aplicacoes / tentativas
  createAssessment(assessment: BehavioralAssessment): Promise<void>;
  updateAssessment(assessment: BehavioralAssessment): Promise<void>;
  findAssessmentById(assessmentId: string): Promise<BehavioralAssessment | null>;
  findAssessmentForUpdate(assessmentId: string): Promise<BehavioralAssessment | null>;
  findOperationalByApplication(
    organizationId: string,
    candidateApplicationId: string,
    instrumentId: string
  ): Promise<BehavioralAssessment | null>;
  findMaxAttemptNumber(
    organizationId: string,
    candidateApplicationId: string,
    instrumentId: string
  ): Promise<number>;
  listByApplication(
    organizationId: string,
    candidateApplicationId: string
  ): Promise<BehavioralAssessment[]>;
  listByOrganization(organizationId: string): Promise<BehavioralAssessment[]>;
  findByExternalReference(
    organizationId: string,
    instrumentId: string,
    externalProvider: string,
    externalReferenceId: string
  ): Promise<BehavioralAssessment | null>;

  // Respostas
  upsertResponse(response: BehavioralAssessmentResponse): Promise<BehavioralAssessmentResponse>;
  markResponsesSubmitted(assessmentId: string, submittedAt: string): Promise<void>;
  listResponses(assessmentId: string): Promise<BehavioralAssessmentResponse[]>;

  // Resultado
  createResult(result: BehavioralAssessmentResult): Promise<void>;
  addResultDimension(dimension: BehavioralAssessmentResultDimension): Promise<void>;
  findResultByAssessment(assessmentId: string): Promise<{
    result: BehavioralAssessmentResult;
    dimensions: BehavioralAssessmentResultDimension[];
  } | null>;

  // Tokens
  addAccessToken(token: BehavioralAssessmentAccessToken): Promise<void>;
  findAccessTokenByHash(tokenHash: string): Promise<BehavioralAssessmentAccessToken | null>;
  revokeActiveTokens(organizationId: string, assessmentId: string): Promise<void>;

  // Eventos
  addEvent(event: BehavioralAssessmentEvent): Promise<void>;
  listEvents(assessmentId: string): Promise<BehavioralAssessmentEvent[]>;

  // Contextos
  findApplication(applicationId: string): Promise<BehavioralAssessmentApplicationContext | null>;
  findCandidate(candidateId: string): Promise<BehavioralAssessmentCandidateContext | null>;
  // Consentimento especifico desta finalidade -- NUNCA reaproveita a consulta generica
  // `latestConsent` (achado da Fase 19, seguindo a Correcao Final do Plano Tecnico, item 16):
  // aquela busca o consentimento mais recente sem filtrar `purpose`, o que a tornaria
  // inadequada para provar consentimento especifico de Perfil Comportamental.
  latestConsentByPurpose(
    candidateId: string,
    purpose: string
  ): Promise<BehavioralAssessmentConsentContext | null>;
  findActiveBlueprintVersionId(organizationId: string): Promise<string | null>;
  findMembershipRole(organizationId: string, userId: string): Promise<MembershipRole | null>;
}
