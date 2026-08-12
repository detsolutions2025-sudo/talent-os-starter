import type { Actor, MembershipRole, Organization } from "../core/types";

// Fase 19 (SPEC-022 v1.0). Sem IA, DISC proprietario, Pre-Analise Assistida ou Dossie
// Inteligente (fora de escopo, ADR-0023). Este modulo nunca altera CandidateApplication
// (current_stage, application_status, finalizacao) -- apenas conclui a propria aplicacao do
// instrumento (SPEC-022, secao 8).

export type BehavioralInstrumentScope = "platform" | "organization";
export type BehavioralInstrumentStatus = "active" | "inactive";
export type BehavioralInstrumentVersionStatus = "draft" | "active" | "archived";
export type BehavioralAssessmentStatus =
  "draft" | "available" | "in_progress" | "completed" | "cancelled" | "expired";
export type BehavioralAssessmentOriginType = "internal_application" | "external_import";
export type BehavioralAssessmentResultOrigin = "calculated" | "imported";
export type CandidateResultVisibility = "none" | "summary" | "full";
export type RawResponseOwnerVisibility = "visible" | "restricted";

// Correcao final vinculante do Plano Tecnico: item_type usa uma allow-list propria e minima
// deste modulo -- nunca os 11 tipos do Banco de Perguntas (SPEC-009), reaproveitados apenas
// por Interview/Pre-Entrevista. Sem instrumento concreto nesta fase (item 13), a lista abaixo
// e a extensao minima necessaria para o calculador de teste provar o contrato.
export const behavioralInstrumentItemTypes = [
  "open_text",
  "single_choice",
  "multiple_choice",
  "yes_no",
  "numeric",
  "scale"
] as const;
export type BehavioralInstrumentItemType = (typeof behavioralInstrumentItemTypes)[number];

export type BehavioralInstrument = {
  id: string;
  scope: BehavioralInstrumentScope;
  organizationId: string | null;
  name: string;
  description: string;
  status: BehavioralInstrumentStatus;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BehavioralInstrumentDimensionManifestEntry = {
  code: string;
  name: string;
  description: string;
  required: boolean;
};

export type BehavioralInstrumentVersion = {
  id: string;
  behavioralInstrumentId: string;
  versionNumber: number;
  status: BehavioralInstrumentVersionStatus;
  // Correcao final vinculante: methodologyKey/calculationMethodVersion pertencem
  // exclusivamente a versao -- nunca ao BehavioralInstrument logico.
  methodologyKey: string;
  calculationMethodVersion: string;
  dimensions: BehavioralInstrumentDimensionManifestEntry[];
  instructions: string | null;
  candidateResultVisibility: CandidateResultVisibility;
  rawResponseOwnerVisibility: RawResponseOwnerVisibility;
  createdByUserId: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BehavioralInstrumentItem = {
  id: string;
  behavioralInstrumentVersionId: string;
  itemKey: string;
  itemType: BehavioralInstrumentItemType;
  promptText: string | null;
  externalItemReference: string | null;
  dimensionMapping: string[];
  scoringMetadata: Record<string, unknown>;
  options: unknown[];
  displayOrder: number;
  required: boolean;
  createdAt: string;
};

export type OrganizationBehavioralInstrumentSettings = {
  id: string;
  organizationId: string;
  behavioralInstrumentId: string;
  enabled: boolean;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobOpeningBehavioralAssessmentSettings = {
  id: string;
  organizationId: string;
  jobOpeningId: string;
  enabled: boolean;
  behavioralInstrumentId: string | null;
  behavioralInstrumentScope: BehavioralInstrumentScope | null;
  behavioralInstrumentVersionId: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BehavioralAssessment = {
  id: string;
  organizationId: string;
  candidateApplicationId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  blueprintVersionId: string | null;

  behavioralInstrumentId: string;
  behavioralInstrumentScope: BehavioralInstrumentScope;
  behavioralInstrumentOwnerOrganizationId: string | null;
  behavioralInstrumentVersionId: string;

  originType: BehavioralAssessmentOriginType;
  attemptNumber: number;
  previousAttemptId: string | null;
  status: BehavioralAssessmentStatus;

  candidateConsentId: string;

  createdSource: "internal_user";
  createdByUserId: string;

  availableAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  expiredAt: string | null;
  expiresAt: string | null;

  externalProvider: string | null;
  externalReferenceId: string | null;
  appliedAtExternal: string | null;
  completedAtExternal: string | null;
  importedAt: string | null;
  importedByUserId: string | null;

  createdAt: string;
  updatedAt: string;
};

export type BehavioralAssessmentResponse = {
  id: string;
  organizationId: string;
  behavioralAssessmentId: string;
  behavioralInstrumentVersionId: string;
  behavioralInstrumentItemId: string;
  responseValue: unknown;
  submitted: boolean;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};

export type BehavioralAssessmentResult = {
  id: string;
  organizationId: string;
  behavioralAssessmentId: string;
  behavioralInstrumentVersionId: string;
  calculationMethodVersion: string;
  origin: BehavioralAssessmentResultOrigin;
  summaryText: string | null;
  calculatedAt: string | null;
  importedAt: string | null;
  createdAt: string;
};

export type BehavioralAssessmentResultDimension = {
  id: string;
  organizationId: string;
  behavioralAssessmentResultId: string;
  dimensionCode: string;
  label: string | null;
  rawValue: unknown;
  displayValue: string | null;
  unit: string | null;
  rangeMin: number | null;
  rangeMax: number | null;
  interpretationText: string | null;
  displayOrder: number;
};

export type BehavioralAssessmentEventType =
  | "created"
  | "available"
  | "started"
  | "response_saved"
  | "submitted"
  | "calculation_completed"
  | "cancelled"
  | "expired"
  | "reopening_authorized"
  | "external_result_imported";

export type BehavioralAssessmentEvent = {
  id: string;
  organizationId: string;
  behavioralAssessmentId: string;
  eventType: BehavioralAssessmentEventType;
  statusBefore: BehavioralAssessmentStatus | null;
  statusAfter: BehavioralAssessmentStatus | null;
  reason: string | null;
  metadata: Record<string, string>;
  createdAt: string;
};

export type BehavioralAssessmentAccessTokenStatus = "active" | "revoked";

export type BehavioralAssessmentAccessToken = {
  id: string;
  organizationId: string;
  behavioralAssessmentId: string;
  tokenHash: string;
  status: BehavioralAssessmentAccessTokenStatus;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
};

// Contextos de leitura minimos -- mesmo padrao ja usado por PreInterviewRepository.
export type BehavioralAssessmentApplicationContext = {
  id: string;
  organizationId: string;
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  applicationStatus: "active" | "withdrawn" | "rejected" | "hired" | "cancelled";
};

export type BehavioralAssessmentCandidateContext = {
  id: string;
  organizationId: string;
  status: "active" | "inactive";
};

export type BehavioralAssessmentConsentContext = {
  id: string;
  status: "granted" | "revoked" | "expired" | "pending";
  expiresAt: string | null;
};

export type BehavioralAssessmentAggregate = {
  assessment: BehavioralAssessment;
  responses: BehavioralAssessmentResponse[];
  result?: {
    result: BehavioralAssessmentResult;
    dimensions: BehavioralAssessmentResultDimension[];
  } | null;
  events?: BehavioralAssessmentEvent[];
};

// ------------------------------------------------------------------------------------------
// DTOs de entrada -- allow-list minima. Campos protegidos nunca aparecem nestes tipos.
// ------------------------------------------------------------------------------------------

export type BehavioralInstrumentInput = {
  [key: string]: unknown;
  name?: unknown;
  description?: unknown;
};

export type BehavioralInstrumentVersionInput = {
  [key: string]: unknown;
  methodologyKey?: unknown;
  methodology_key?: unknown;
  calculationMethodVersion?: unknown;
  calculation_method_version?: unknown;
  dimensions?: unknown;
  instructions?: unknown;
  candidateResultVisibility?: unknown;
  candidate_result_visibility?: unknown;
  rawResponseOwnerVisibility?: unknown;
  raw_response_owner_visibility?: unknown;
  items?: unknown;
};

export type OrganizationBehavioralInstrumentSettingsInput = {
  [key: string]: unknown;
  enabled?: unknown;
};

export type JobOpeningBehavioralAssessmentSettingsInput = {
  [key: string]: unknown;
  enabled?: unknown;
  behavioralInstrumentId?: unknown;
  behavioral_instrument_id?: unknown;
  behavioralInstrumentVersionId?: unknown;
  behavioral_instrument_version_id?: unknown;
};

export type BehavioralAssessmentCreateInput = {
  [key: string]: unknown;
  behavioralInstrumentId?: unknown;
  behavioral_instrument_id?: unknown;
  behavioralInstrumentVersionId?: unknown;
  behavioral_instrument_version_id?: unknown;
};

export type BehavioralAssessmentResponseInput = {
  [key: string]: unknown;
  responseValue?: unknown;
  response_value?: unknown;
};

export type BehavioralAssessmentReasonInput = { [key: string]: unknown; reason?: unknown };
export type BehavioralAssessmentAdminReadInput = { [key: string]: unknown; reason?: unknown };

export type BehavioralAssessmentExternalImportInput = {
  [key: string]: unknown;
  behavioralInstrumentId?: unknown;
  behavioral_instrument_id?: unknown;
  behavioralInstrumentVersionId?: unknown;
  behavioral_instrument_version_id?: unknown;
  externalProvider?: unknown;
  external_provider?: unknown;
  externalReferenceId?: unknown;
  external_reference_id?: unknown;
  appliedAtExternal?: unknown;
  applied_at_external?: unknown;
  completedAtExternal?: unknown;
  completed_at_external?: unknown;
  summaryText?: unknown;
  summary_text?: unknown;
  dimensions?: unknown;
};

export type BehavioralAssessmentContext = {
  actor: Actor;
  organization: Organization;
  role: MembershipRole;
};
