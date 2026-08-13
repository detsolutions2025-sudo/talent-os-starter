import type { MembershipRole } from "../core/types";
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
} from "./types";

export interface PreAnalysisRepository {
  nextId(prefix: string): string;
  now(): string;

  // Instancias / tentativas
  addPreAnalysis(preAnalysis: PreAnalysis): Promise<void>;
  updatePreAnalysis(preAnalysis: PreAnalysis): Promise<void>;
  findPreAnalysisById(organizationId: string, id: string): Promise<PreAnalysis | null>;
  findPreAnalysisForUpdate(organizationId: string, id: string): Promise<PreAnalysis | null>;
  findOperationalByApplication(
    organizationId: string,
    candidateApplicationId: string
  ): Promise<PreAnalysis | null>;
  findMaxAttemptNumber(organizationId: string, candidateApplicationId: string): Promise<number>;
  listByApplication(organizationId: string, candidateApplicationId: string): Promise<PreAnalysis[]>;
  // Reconciliacao (Plano Tecnico Consolidado, item 3/4): PreAnalysis presa em `requested` ou
  // `running` alem do threshold configurado -- nunca um job dedicado obrigatorio, materializacao
  // pode ocorrer sob demanda.
  listStale(
    organizationId: string | null,
    status: "requested" | "running",
    olderThan: string
  ): Promise<PreAnalysis[]>;

  // Evidencias
  addEvidence(evidence: PreAnalysisEvidence): Promise<void>;
  listEvidences(organizationId: string, preAnalysisId: string): Promise<PreAnalysisEvidence[]>;

  // Resultado e achados
  addResult(result: PreAnalysisResult): Promise<void>;
  findResultByPreAnalysis(
    organizationId: string,
    preAnalysisId: string
  ): Promise<PreAnalysisResult | null>;
  addFinding(finding: PreAnalysisFinding): Promise<void>;
  addFindingEvidence(
    organizationId: string,
    findingId: string,
    evidenceId: string,
    preAnalysisId: string
  ): Promise<void>;
  listFindings(organizationId: string, preAnalysisResultId: string): Promise<PreAnalysisFinding[]>;

  // Eventos (timeline de dominio, distinta de audit_events -- SPEC-023 Sec 29.1)
  addEvent(event: PreAnalysisEvent): Promise<void>;
  listEvents(organizationId: string, preAnalysisId: string): Promise<PreAnalysisEvent[]>;

  // Contextos de leitura minimos (mesmo padrao ja usado por PreInterviewRepository/
  // BehavioralAssessmentRepository)
  findApplication(applicationId: string): Promise<PreAnalysisApplicationContext | null>;
  findCandidate(candidateId: string): Promise<PreAnalysisCandidateContext | null>;
  latestConsent(candidateId: string): Promise<PreAnalysisConsentContext | null>;
  findJobOpeningVersion(
    jobOpeningVersionId: string
  ): Promise<PreAnalysisJobOpeningVersionContext | null>;
  findActiveBlueprintVersion(
    organizationId: string
  ): Promise<PreAnalysisBlueprintVersionContext | null>;
  // Conteudo estruturado real do Blueprint ativo (DNA + competencias do manifesto) --
  // correcao da revisao destrutiva, substitui o placeholder minimo anterior. Nulo quando o
  // blueprint ativo nao tem entrada de DNA no manifesto (nao deveria ocorrer para um blueprint
  // pronto para producao, mas o service trata a ausencia com fail-safe, nunca lancando).
  findBlueprintContent(
    blueprintVersionId: string
  ): Promise<PreAnalysisBlueprintContentContext | null>;
  findCompletedPreInterview(
    candidateApplicationId: string
  ): Promise<PreAnalysisPreInterviewContext | null>;
  listSubmittedPreInterviewResponses(
    preInterviewId: string
  ): Promise<PreAnalysisPreInterviewResponseContext[]>;
  findCompletedBehavioralAssessment(
    candidateApplicationId: string
  ): Promise<PreAnalysisBehavioralAssessmentContext | null>;
  findBehavioralAssessmentResult(
    resultId: string
  ): Promise<PreAnalysisBehavioralAssessmentResultContext | null>;
  findMembershipRole(organizationId: string, userId: string): Promise<MembershipRole | null>;
}
