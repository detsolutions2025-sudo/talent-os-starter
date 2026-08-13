import type { Actor, MembershipRole, Organization } from "../core/types";

// Fase 20 (SPEC-023 v1.1). Nunca cria score global, ranking, matching ou decisao automatica
// (ADR-0023 "Scores"; SPEC-023 Sec 15). Nunca altera CandidateApplication/Candidate/Interview
// (SPEC-023 Sec 7/Sec 15). Toda execucao passa exclusivamente por `AIGateway.execute()`
// (SPEC-023 Sec 20) -- este modulo nunca importa nada de `src/server/ai/*` alem do que a
// fachada publica `AIService` ja expoe.

export const preAnalysisFeatureKey = "candidate_pre_analysis" as const;
export const preAnalysisConsentPurpose = "ai_pre_analysis" as const;

export type PreAnalysisStatus =
  "requested" | "running" | "completed" | "failed" | "unavailable" | "cancelled";

export const preAnalysisFinalStatuses: readonly PreAnalysisStatus[] = [
  "completed",
  "failed",
  "unavailable",
  "cancelled"
];
export const preAnalysisOperationalStatuses: readonly PreAnalysisStatus[] = [
  "requested",
  "running"
];

// Mesmos onze valores canonicos ja definidos pela SPEC-014 (Sec "AI Execution") -- nunca uma
// lista paralela (SPEC-023 Sec 21).
export type PreAnalysisErrorCategory =
  | "authentication_error"
  | "quota_exceeded"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable"
  | "network_error"
  | "invalid_response"
  | "configuration_error"
  | "policy_denied"
  | "content_blocked"
  | "unknown_error";

// Cinco valores canonicos, fechados (ADR-0023 + SPEC-023 v1.1 -- declared_data cobre autoria
// do candidato OU da Organization; source_type sempre identifica a fonte tecnica exata).
export type PreAnalysisSourceType =
  | "candidate_field"
  | "job_opening_version"
  | "pre_interview_response"
  | "behavioral_assessment_result"
  | "blueprint_version";

export type PreAnalysisOriginKind =
  "declared_data" | "observed_evidence" | "instrument_result" | "human_evaluation" | "ai_inference";

// Mapeamento canonico e fechado (Plano Tecnico Consolidado, item 13) -- espelhado fisicamente
// pelo CHECK da migration 0021; mantido aqui como fonte unica de verdade para o Service e para
// testes, nunca reimplementado com valores diferentes.
export const preAnalysisOriginKindBySourceType: Record<
  PreAnalysisSourceType,
  PreAnalysisOriginKind
> = {
  candidate_field: "declared_data",
  job_opening_version: "declared_data",
  pre_interview_response: "declared_data",
  blueprint_version: "declared_data",
  behavioral_assessment_result: "instrument_result"
};

// Allow-list fechada de campos do Candidate (SPEC-023 Sec 10.1) -- nunca full_name,
// preferred_name, email, phone, salary_expectation, work_authorization ou qualquer campo fora
// desta lista.
export const preAnalysisCandidateFieldAllowList = [
  "professional_summary",
  "experiences",
  "education",
  "certifications",
  "languages",
  "declared_competencies",
  "availability"
] as const;
export type PreAnalysisCandidateFieldName = (typeof preAnalysisCandidateFieldAllowList)[number];

export const preAnalysisFindingCategories = [
  "evidencia_aderencia",
  "evidencia_nao_encontrada",
  "ponto_forte",
  "ponto_atencao",
  "possivel_risco",
  "pergunta_sugerida_para_validacao"
] as const;
export type PreAnalysisFindingCategory = (typeof preAnalysisFindingCategories)[number];

export type PreAnalysisEventType =
  | "requested"
  | "running"
  | "completed"
  | "failed"
  | "unavailable"
  | "cancelled"
  | "reanalysis_requested"
  | "administrative_read"
  | "permission_denied"
  | "cross_organization_access_denied"
  | "cross_candidature_reference_denied"
  | "result_discarded_after_cancellation"
  | "reconciled_stale_requested"
  | "reconciled_stale_running";

export type PreAnalysis = {
  id: string;
  organizationId: string;
  candidateApplicationId: string;
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  blueprintVersionId: string | null;
  preInterviewId: string | null;
  behavioralAssessmentId: string | null;
  consentId: string;

  attemptNumber: number;
  previousAttemptId: string | null;
  status: PreAnalysisStatus;

  requestedByUserId: string;
  requestedAt: string;
  runningAt: string | null;

  aiExecutionId: string | null;

  completedAt: string | null;
  failedAt: string | null;
  unavailableAt: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  errorCategory: PreAnalysisErrorCategory | null;

  createdAt: string;
  updatedAt: string;
};

export type PreAnalysisEvidence = {
  id: string;
  organizationId: string;
  preAnalysisId: string;
  candidateApplicationId: string;
  sourceType: PreAnalysisSourceType;
  originKind: PreAnalysisOriginKind;
  contentHash: string | null;
  snapshotValue: string | null;
  candidateFieldName: PreAnalysisCandidateFieldName | null;
  jobOpeningId: string | null;
  jobOpeningVersionId: string | null;
  preInterviewId: string | null;
  preInterviewResponseId: string | null;
  behavioralAssessmentId: string | null;
  behavioralAssessmentResultId: string | null;
  blueprintVersionId: string | null;
  createdAt: string;
};

export type PreAnalysisResult = {
  id: string;
  organizationId: string;
  preAnalysisId: string;
  aiExecutionId: string;
  promptKey: string;
  promptVersion: number;
  summary: string;
  limitations: string;
  disclaimer: string;
  calculatedAt: string;
  createdAt: string;
};

export type PreAnalysisFinding = {
  id: string;
  organizationId: string;
  preAnalysisResultId: string;
  preAnalysisId: string;
  category: PreAnalysisFindingCategory;
  text: string;
  displayOrder: number;
  createdAt: string;
  evidenceIds: string[];
};

export type PreAnalysisEvent = {
  id: string;
  organizationId: string;
  preAnalysisId: string;
  eventType: PreAnalysisEventType;
  statusBefore: PreAnalysisStatus | null;
  statusAfter: PreAnalysisStatus | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

// ------------------------------------------------------------------------------------------
// Contextos de leitura minimos (mesmo padrao ja usado por PreInterviewRepository/
// BehavioralAssessmentRepository).
// ------------------------------------------------------------------------------------------

export type PreAnalysisApplicationContext = {
  id: string;
  organizationId: string;
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  applicationStatus: "active" | "withdrawn" | "rejected" | "hired" | "cancelled";
};

export type PreAnalysisCandidateContext = {
  id: string;
  organizationId: string;
  status: "active" | "inactive";
  professionalSummary: string | null;
  experiences: unknown[];
  education: unknown[];
  certifications: unknown[];
  languages: unknown[];
  declaredCompetencies: unknown[];
  availability: Record<string, unknown>;
};

export type PreAnalysisConsentContext = {
  id: string;
  status: "granted" | "revoked" | "expired" | "pending";
  expiresAt: string | null;
};

export type PreAnalysisJobOpeningVersionContext = {
  id: string;
  jobOpeningId: string;
  publicTitle: string;
  description: string;
  responsibilities: unknown[];
  requirements: unknown[];
  benefits: unknown[];
};

export type PreAnalysisPreInterviewContext = {
  id: string;
  status: "draft" | "available" | "in_progress" | "completed" | "cancelled" | "expired";
};

export type PreAnalysisPreInterviewResponseContext = {
  id: string;
  preInterviewId: string;
  submitted: boolean;
  questionText: string | null;
  responseValue: unknown;
};

export type PreAnalysisBehavioralAssessmentContext = {
  id: string;
  status: "draft" | "available" | "in_progress" | "completed" | "cancelled" | "expired";
  resultId: string | null;
};

export type PreAnalysisBehavioralAssessmentResultContext = {
  id: string;
  behavioralAssessmentId: string;
  summaryText: string | null;
  dimensions: Array<{
    dimensionCode: string;
    displayValue: string | null;
    interpretationText: string | null;
  }>;
};

export type PreAnalysisBlueprintVersionContext = {
  id: string;
  organizationId: string;
};

// Conteudo estruturado real do Blueprint (correcao da revisao destrutiva -- substitui o
// placeholder minimo da versao anterior). Missao/visao/proposito/valores/cultura vem do DNA
// Organizacional ativo referenciado pelo manifesto (Fase 2, SPEC-005); competencias
// organizacionais vem do snapshot do proprio manifesto (Fase 15, SPEC-018) -- nunca uma copia
// nova, sempre o que o Manifesto ja registrou no momento da ativacao da Blueprint Version.
export type PreAnalysisBlueprintContentContext = {
  blueprintVersionId: string;
  mission: string;
  vision: string;
  purpose: string;
  values: unknown[];
  cultureContent: string;
  leadershipStyleContent: string;
  workEnvironmentContent: string;
  competencies: Array<{ code: string; name: string; category: string }>;
};

// ------------------------------------------------------------------------------------------
// Payload minimizado enviado ao AIGateway (SPEC-023 Sec 19/21) -- nunca serializa objetos de
// dominio inteiros, nunca inclui full_name/preferred_name/email/telefone (Sec 10.1.1).
// ------------------------------------------------------------------------------------------

export type PreAnalysisEvidencePayloadItem = {
  ref: string; // rotulo logico opaco (ev1, ev2, ...) -- nunca o id real do banco (Sec 25/item 17).
  sourceType: PreAnalysisSourceType;
  fieldName?: string;
  text: string;
};

// Correcao da revisao destrutiva: o payload enviado ao AIGateway contem EXCLUSIVAMENTE
// `evidences[]` -- nenhum campo solto redundante. Uma versao anterior tinha campos paralelos
// (`candidate`, `jobOpening`, `preInterview`, `behavioralAssessment`, `blueprint`) que
// duplicavam conteudo ja presente em `evidences[]`; alem do custo/tokens desnecessarios, um
// campo fora de `evidences[]` pode ser citado por um achado sem nenhum `evidence_ref` valido
// para apontar, quebrando a rastreabilidade unica exigida por SPEC-023 Sec 12.
export type PreAnalysisGatewayInput = {
  evidences: PreAnalysisEvidencePayloadItem[];
};

// Schema fechado de output esperado do provider (Plano Tecnico Consolidado, item 17/23) --
// referencia conceitual usada pelo Service para validar a resposta do AIGateway antes de
// persistir; o schema fisico real (`outputSchema`) permanece responsabilidade do Prompt
// Registry (Platform Admin, SPEC-023 Sec 38), este tipo apenas espelha os mesmos limites no
// lado do consumidor para nunca divergir silenciosamente da constraint fisica do Postgres.
export const preAnalysisOutputLimits = {
  summaryMin: 1,
  summaryMax: 4000,
  limitationsMin: 1,
  limitationsMax: 2000,
  findingsMax: 50,
  findingTextMin: 1,
  findingTextMax: 2000,
  evidenceRefsMin: 1,
  evidenceRefsMax: 20
} as const;

export type PreAnalysisGatewayFinding = {
  category: PreAnalysisFindingCategory;
  text: string;
  evidenceRefs: string[];
};

export type PreAnalysisGatewayOutput = {
  summary: string;
  limitations: string;
  findings: PreAnalysisGatewayFinding[];
};

// ------------------------------------------------------------------------------------------
// DTOs de entrada -- allow-list minima, mesmo padrao ja usado por
// BehavioralAssessmentCreateInput.
// ------------------------------------------------------------------------------------------

export type PreAnalysisRequestInput = {
  [key: string]: unknown;
  candidateApplicationId?: unknown;
  candidate_application_id?: unknown;
};

export type PreAnalysisReasonInput = { [key: string]: unknown; reason?: unknown };
export type PreAnalysisAdminReadInput = { [key: string]: unknown; reason?: unknown };

// ------------------------------------------------------------------------------------------
// DTOs de saida por perfil (SPEC-023 Sec 24) -- nunca por omissao: cada perfil recebe
// exatamente os campos listados abaixo, nunca mais.
// ------------------------------------------------------------------------------------------

export type PreAnalysisMemberDTO = { id: string; status: PreAnalysisStatus };

export type PreAnalysisOwnerDTO = {
  id: string;
  candidateApplicationId: string;
  attemptNumber: number;
  previousAttemptId: string | null;
  status: PreAnalysisStatus;
  requestedByUserId: string;
  requestedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  unavailableAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  errorCategory: PreAnalysisErrorCategory | null;
};

export type PreAnalysisAdminReadDTO = {
  id: string;
  organizationId: string;
  candidateApplicationId: string;
  attemptNumber: number;
  status: PreAnalysisStatus;
  requestedByUserId: string;
  requestedAt: string;
  aiExecutionId: string | null;
  errorCategory: PreAnalysisErrorCategory | null;
  hasResult: boolean;
};

export type PreAnalysisContext = { actor: Actor; organization: Organization; role: MembershipRole };
