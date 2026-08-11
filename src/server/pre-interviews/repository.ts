import type { MembershipRole } from "../core/types";
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
} from "./types";

export interface PreInterviewRepository {
  nextId(prefix: string): string;
  now(): string;

  // Settings
  // Fase 18, revisao de seguranca: resolve a Organization real de uma Job Opening, para que o
  // service valide pertencimento ANTES de qualquer escrita em settings -- nunca dependendo
  // apenas da FK (que rejeitaria a combinacao, mas com um erro cru de banco em vez de uma
  // resposta 404 generica e auditada, mesmo padrao ja usado por todo o restante do projeto).
  findJobOpeningOrganizationId(jobOpeningId: string): Promise<string | null>;
  findSettingsByJobOpening(
    organizationId: string,
    jobOpeningId: string
  ): Promise<JobOpeningPreInterviewSettings | null>;
  findSettingsForUpdate(
    organizationId: string,
    jobOpeningId: string
  ): Promise<JobOpeningPreInterviewSettings | null>;
  createSettings(settings: JobOpeningPreInterviewSettings): Promise<void>;
  updateSettings(settings: JobOpeningPreInterviewSettings): Promise<void>;
  listQuestionSettings(
    organizationId: string,
    settingsId: string
  ): Promise<JobOpeningPreInterviewQuestionSetting[]>;
  replaceQuestionSettings(
    organizationId: string,
    settingsId: string,
    questions: JobOpeningPreInterviewQuestionSetting[]
  ): Promise<void>;

  // Instances / attempts
  createPreInterview(preInterview: PreInterview): Promise<void>;
  updatePreInterview(preInterview: PreInterview): Promise<void>;
  findPreInterviewById(preInterviewId: string): Promise<PreInterview | null>;
  findPreInterviewForUpdate(preInterviewId: string): Promise<PreInterview | null>;
  findOperationalByApplication(
    organizationId: string,
    candidateApplicationId: string
  ): Promise<PreInterview | null>;
  findMaxAttemptNumber(organizationId: string, candidateApplicationId: string): Promise<number>;
  hasAnyAttempt(organizationId: string, candidateApplicationId: string): Promise<boolean>;
  listByApplication(
    organizationId: string,
    candidateApplicationId: string
  ): Promise<PreInterview[]>;
  listByOrganization(organizationId: string): Promise<PreInterview[]>;

  // Questions (snapshot)
  addQuestion(question: PreInterviewQuestion): Promise<void>;
  listQuestions(preInterviewId: string): Promise<PreInterviewQuestion[]>;

  // Responses
  upsertResponse(response: PreInterviewResponse): Promise<PreInterviewResponse>;
  markResponsesSubmitted(preInterviewId: string, submittedAt: string): Promise<void>;
  listResponses(preInterviewId: string): Promise<PreInterviewResponse[]>;

  // Access tokens
  addAccessToken(token: PreInterviewAccessToken): Promise<void>;
  findAccessTokenByHash(tokenHash: string): Promise<PreInterviewAccessToken | null>;
  revokeActiveTokens(organizationId: string, preInterviewId: string): Promise<void>;

  // Events
  addEvent(event: PreInterviewEvent): Promise<void>;
  listEvents(preInterviewId: string): Promise<PreInterviewEvent[]>;

  // Contexts (mesmo padrao ja usado por InterviewRepository)
  findApplication(applicationId: string): Promise<PreInterviewApplicationContext | null>;
  findCandidate(candidateId: string): Promise<PreInterviewCandidateContext | null>;
  latestConsent(candidateId: string): Promise<PreInterviewConsentContext | null>;
  findQuestionCatalogItem(
    catalogItemId: string
  ): Promise<PreInterviewQuestionCatalogContext | null>;
  findActiveBlueprintVersionId(organizationId: string): Promise<string | null>;
  findMembershipRole(organizationId: string, userId: string): Promise<MembershipRole | null>;
}
