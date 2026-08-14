import type { Actor, MembershipRole, Organization } from "../core/types";

export const candidateDossierSnapshotSchemaVersion = "candidate_dossier_snapshot.v1" as const;

export type CandidateDossierGenerationKind = "regular" | "final_record";
export type CandidateDossierStatus = "generated";

export type CandidateDossierSourceType =
  | "candidate_field"
  | "job_opening_version"
  | "blueprint_version"
  | "pre_interview_response"
  | "behavioral_assessment_result"
  | "pre_analysis_result"
  | "pre_analysis_finding"
  | "interview_response"
  | "interview_evaluation";

export type CandidateDossierOriginKind =
  "declared_data" | "observed_evidence" | "instrument_result" | "human_evaluation" | "ai_inference";

export const candidateDossierOriginKindBySourceType: Record<
  CandidateDossierSourceType,
  CandidateDossierOriginKind
> = {
  candidate_field: "declared_data",
  job_opening_version: "declared_data",
  blueprint_version: "declared_data",
  pre_interview_response: "declared_data",
  behavioral_assessment_result: "instrument_result",
  pre_analysis_result: "ai_inference",
  pre_analysis_finding: "ai_inference",
  interview_response: "observed_evidence",
  interview_evaluation: "human_evaluation"
};

export const candidateDossierCandidateFieldAllowList = [
  "professional_summary",
  "experiences",
  "education",
  "certifications",
  "languages",
  "declared_competencies",
  "availability"
] as const;

export type CandidateDossierCandidateFieldName =
  (typeof candidateDossierCandidateFieldAllowList)[number];

export type CandidateDossier = {
  id: string;
  organizationId: string;
  candidateApplicationId: string;
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  blueprintVersionId: string | null;
  versionNumber: number;
  previousVersionId: string | null;
  status: CandidateDossierStatus;
  generationKind: CandidateDossierGenerationKind;
  finalRecordReason: string | null;
  presentedSnapshot: Record<string, unknown>;
  snapshotSchemaVersion: typeof candidateDossierSnapshotSchemaVersion;
  contentHash: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  generatedByUserId: string;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CandidateDossierSource = {
  id: string;
  organizationId: string;
  candidateDossierId: string;
  candidateApplicationId: string;
  sourceType: CandidateDossierSourceType;
  originKind: CandidateDossierOriginKind;
  fieldName: string | null;
  candidateId: string | null;
  jobOpeningId: string | null;
  jobOpeningVersionId: string | null;
  blueprintVersionId: string | null;
  preInterviewId: string | null;
  preInterviewResponseId: string | null;
  behavioralAssessmentId: string | null;
  behavioralAssessmentResultId: string | null;
  preAnalysisId: string | null;
  preAnalysisResultId: string | null;
  preAnalysisFindingId: string | null;
  interviewId: string | null;
  interviewResponseId: string | null;
  interviewEvaluationId: string | null;
  snapshotValue: unknown;
  presentedValueSnapshot: Record<string, unknown>;
  contentHash: string;
  sourceCreatedAt: string | null;
  authoredByUserId: string | null;
  authorship: Record<string, unknown>;
  presentedOrder: number;
  createdAt: string;
};

export type CandidateDossierApplicationContext = {
  id: string;
  organizationId: string;
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  candidateStatus: "active" | "inactive";
  applicationStatus: "active" | "withdrawn" | "rejected" | "hired" | "cancelled";
  finalizedAt: string | null;
};

export type CandidateDossierConsentContext = {
  id: string;
  status: "granted" | "revoked" | "expired" | "pending";
  expiresAt: string | null;
};

export type CandidateDossierGenerateInput = {
  [key: string]: unknown;
  candidateApplicationId?: unknown;
  candidate_application_id?: unknown;
  generationKind?: unknown;
  generation_kind?: unknown;
  finalRecordReason?: unknown;
  final_record_reason?: unknown;
};

export type CandidateDossierAdminReadInput = {
  [key: string]: unknown;
  reason?: unknown;
  candidateDossierId?: unknown;
  candidate_dossier_id?: unknown;
};

export type CandidateDossierOwnerDTO = {
  id: string;
  candidateApplicationId: string;
  versionNumber: number;
  previousVersionId: string | null;
  status: CandidateDossierStatus;
  generationKind: CandidateDossierGenerationKind;
  finalRecordReason: string | null;
  presentedSnapshot: Record<string, unknown>;
  contentHash: string;
  sourceCount: number;
  generatedByUserId: string;
  generatedAt: string;
};

export type CandidateDossierMemberDTO = {
  id: string;
  status: CandidateDossierStatus;
  versionNumber: number;
};

export type CandidateDossierAdminReadDTO = {
  id: string;
  organizationId: string;
  candidateApplicationId: string;
  versionNumber: number;
  generationKind: CandidateDossierGenerationKind;
  generatedByUserId: string;
  generatedAt: string;
  sourceCount: number;
};

export type CandidateDossierContext = {
  actor: Actor;
  organization: Organization;
  role: MembershipRole;
};
