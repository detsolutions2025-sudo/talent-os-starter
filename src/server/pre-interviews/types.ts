import type { Actor, MembershipRole, Organization } from "../core/types";

// Fase 18 (SPEC-021 v1.0). Sem IA, DISC, Perfil Comportamental, Pre-Analise Assistida ou
// Dossie Inteligente (fora de escopo, ADR-0023). Este modulo nunca altera CandidateApplication
// (current_stage, application_status, finalizacao) -- apenas conclui o proprio subfluxo
// (SPEC-021, secao 7).

export type PreInterviewStatus =
  "draft" | "available" | "in_progress" | "completed" | "cancelled" | "expired";

export type PreInterviewCreatedSource =
  "system_after_application" | "internal_user" | "administrative_retry";

// Mesmos 11 valores de questions/types.ts::questionTypes -- nunca redefinidos aqui, apenas
// reaproveitados como literal de tipo (evita import circular com questions/, que nao expoe um
// tipo compartilhavel isolado do resto do modulo).
export const preInterviewQuestionTypes = [
  "open_text",
  "long_text",
  "single_choice",
  "multiple_choice",
  "yes_no",
  "numeric",
  "scale",
  "date",
  "situational",
  "behavioral",
  "technical"
] as const;
export type PreInterviewQuestionType = (typeof preInterviewQuestionTypes)[number];

// Mesmos 11 valores de questions/types.ts::questionCategories.
export const preInterviewQuestionCategories = [
  "general",
  "technical",
  "behavioral",
  "situational",
  "culture",
  "leadership",
  "management",
  "compliance",
  "safety",
  "screening",
  "other"
] as const;
export type PreInterviewQuestionCategory = (typeof preInterviewQuestionCategories)[number];

export type JobOpeningPreInterviewSettings = {
  id: string;
  organizationId: string;
  jobOpeningId: string;
  enabled: boolean;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobOpeningPreInterviewQuestionSetting = {
  id: string;
  organizationId: string;
  settingsId: string;
  questionCatalogItemId: string;
  displayOrder: number;
  required: boolean;
  createdAt: string;
};

export type PreInterview = {
  id: string;
  organizationId: string;
  candidateApplicationId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  blueprintVersionId: string | null;
  previousAttemptId: string | null;
  attemptNumber: number;
  status: PreInterviewStatus;
  createdSource: PreInterviewCreatedSource;
  createdByUserId: string | null;
  availableAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  expiredAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PreInterviewQuestion = {
  id: string;
  organizationId: string;
  preInterviewId: string;
  questionCatalogItemId: string;
  snapshotTitle: string;
  snapshotText: string;
  snapshotType: PreInterviewQuestionType;
  snapshotCategory: PreInterviewQuestionCategory;
  snapshotOptions: unknown[];
  snapshotSettings: Record<string, unknown>;
  displayOrder: number;
  required: boolean;
  contentFingerprint: string;
  createdAt: string;
};

export type PreInterviewResponse = {
  id: string;
  organizationId: string;
  preInterviewId: string;
  preInterviewQuestionId: string;
  responseValue: unknown;
  submitted: boolean;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};

export type PreInterviewAccessTokenStatus = "active" | "revoked";

export type PreInterviewAccessToken = {
  id: string;
  organizationId: string;
  preInterviewId: string;
  tokenHash: string;
  status: PreInterviewAccessTokenStatus;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
};

export type PreInterviewEventType =
  | "created"
  | "available"
  | "started"
  | "response_saved"
  | "submitted"
  | "cancelled"
  | "expired"
  | "reopening_authorized"
  | "new_attempt_created"
  | "access_token_rotated"
  | "additional_token_issued"
  | "settings_updated"
  | "administrative_read";

export type PreInterviewEvent = {
  id: string;
  organizationId: string;
  preInterviewId: string;
  eventType: PreInterviewEventType;
  statusBefore: PreInterviewStatus | null;
  statusAfter: PreInterviewStatus | null;
  actorUserId: string | null;
  reason: string | null;
  metadata: Record<string, string>;
  createdAt: string;
};

// Contextos de leitura -- mesmo padrao ja usado por InterviewRepository (interviews/types.ts):
// cada modulo consumidor define sua propria projecao minima da entidade que consulta, nunca
// importa o tipo completo do modulo dono para evitar acoplamento amplo.
export type PreInterviewApplicationContext = {
  id: string;
  organizationId: string;
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  applicationStatus: "active" | "withdrawn" | "rejected" | "hired" | "cancelled";
};

export type PreInterviewCandidateContext = {
  id: string;
  organizationId: string;
  status: "active" | "inactive";
};

export type PreInterviewConsentContext = {
  status: "granted" | "revoked" | "expired" | "pending";
  expiresAt: string | null;
};

export type PreInterviewQuestionCatalogContext = {
  id: string;
  organizationId: string;
  status: "active" | "inactive";
  title: string;
  questionText: string;
  type: PreInterviewQuestionType;
  category: PreInterviewQuestionCategory;
  options: unknown[];
  settings: Record<string, unknown>;
};

export type PreInterviewAggregate = {
  preInterview: PreInterview;
  questions: PreInterviewQuestion[];
  responses: PreInterviewResponse[];
  events?: PreInterviewEvent[];
};

// ------------------------------------------------------------------------------------------
// DTOs de entrada -- allow-list minima (SPEC-021, secao 25/21). Campos protegidos (item 61 do
// Plano Tecnico) nunca aparecem nestes tipos, entao mass assignment deles e estruturalmente
// impossivel, nao apenas bloqueado por denylist em tempo de execucao.
// ------------------------------------------------------------------------------------------

export type PreInterviewSettingsInput = {
  [key: string]: unknown;
  enabled?: unknown;
  questions?: unknown; // array de { questionCatalogItemId, displayOrder, required }
};

export type PreInterviewResponseInput = {
  [key: string]: unknown;
  responseValue?: unknown;
  response_value?: unknown;
};

export type PreInterviewReasonInput = { [key: string]: unknown; reason?: unknown };
export type PreInterviewAdminReadInput = { [key: string]: unknown; reason?: unknown };

export type PreInterviewContext = {
  actor: Actor;
  organization: Organization;
  role: MembershipRole;
};

export type CreateIfConfiguredResult =
  | { status: "not_configured" }
  | { status: "created"; preInterviewId: string; rawAccessToken: string }
  | { status: "existing"; preInterviewId: string; rawAccessToken: string };
