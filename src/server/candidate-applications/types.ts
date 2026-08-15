import type { Actor, MembershipRole, Organization } from "../core/types";
import type {
  CandidateCertification,
  CandidateEducation,
  CandidateExperience,
  CandidateLanguage,
  CandidateProfessionalLink
} from "../candidates/types";

export type ApplicationStatus = "active" | "withdrawn" | "rejected" | "hired" | "cancelled";
export type ApplicationStage =
  "applied" | "screening" | "interview" | "assessment" | "offer" | "completed";
export type ApplicationEventType =
  | "application_created"
  | "stage_changed"
  | "withdrawn"
  | "rejected"
  | "hired"
  | "cancelled"
  | "note_added";
export type ApplicationSource =
  "career_page" | "referral" | "recruiter" | "import" | "manual" | "other" | "public_portal";

export type CandidateApplication = {
  id: string;
  organizationId: string;
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  applicationStatus: ApplicationStatus;
  currentStage: ApplicationStage;
  source: ApplicationSource;
  appliedAt: string;
  finalizedAt: string | null;
  finalizedByUserId: string | null;
  finalizationReason: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CandidateApplicationEvent = {
  id: string;
  organizationId: string;
  candidateApplicationId: string;
  eventType: ApplicationEventType;
  stageBefore: ApplicationStage | null;
  stageAfter: ApplicationStage | null;
  statusBefore: ApplicationStatus | null;
  statusAfter: ApplicationStatus | null;
  actorUserId: string | null;
  reason: string | null;
  proposalVersionId: string | null;
  createdAt: string;
};

export type CandidateApplicationNote = {
  id: string;
  organizationId: string;
  candidateApplicationId: string;
  content: string;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CandidateApplicationCandidateContext = {
  id: string;
  organizationId: string;
  status: "active" | "inactive";
  fullName: string;
  preferredName: string | null;
  professionalSummary: string | null;
  city: string;
  state: string;
  experiences: CandidateExperience[];
  education: CandidateEducation[];
  certifications: CandidateCertification[];
  languages: CandidateLanguage[];
  declaredCompetencies: string[];
  professionalLinks: CandidateProfessionalLink[];
};

export type CandidateApplicationJobOpeningContext = {
  id: string;
  organizationId: string;
  status: "draft" | "open" | "paused" | "closed" | "cancelled";
  title: string;
  applicationDeadline: string | null;
};

export type CandidateApplicationJobOpeningVersionContext = {
  id: string;
  organizationId: string;
  jobOpeningId: string;
  status: "draft" | "published" | "archived";
  publicTitle: string;
  versionNumber: number | null;
};

export type CandidateApplicationConsentContext = {
  status: "granted" | "revoked" | "expired" | "pending";
  expiresAt: string | null;
};

export type CandidateApplicationInput = {
  id?: unknown;
  organizationId?: unknown;
  organization_id?: unknown;
  candidateId?: unknown;
  candidate_id?: unknown;
  jobOpeningId?: unknown;
  job_opening_id?: unknown;
  jobOpeningVersionId?: unknown;
  job_opening_version_id?: unknown;
  applicationStatus?: unknown;
  application_status?: unknown;
  currentStage?: unknown;
  current_stage?: unknown;
  source?: unknown;
  appliedAt?: unknown;
  applied_at?: unknown;
  finalizedAt?: unknown;
  finalized_at?: unknown;
  finalizedByUserId?: unknown;
  finalized_by_user_id?: unknown;
  finalizationReason?: unknown;
  finalization_reason?: unknown;
  createdByUserId?: unknown;
  created_by_user_id?: unknown;
  updatedByUserId?: unknown;
  updated_by_user_id?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
};

export type CandidateApplicationStageInput = {
  currentStage?: unknown;
  current_stage?: unknown;
  reason?: unknown;
  motive?: unknown;
};

export type CandidateApplicationFinalizationInput = {
  reason?: unknown;
  finalizationReason?: unknown;
  finalization_reason?: unknown;
  proposalVersionId?: unknown;
  proposal_version_id?: unknown;
};

export type CandidateApplicationNoteInput = {
  content?: unknown;
};

export type CandidateApplicationAdminReadInput = {
  reason?: unknown;
};

export type CandidateApplicationContext = {
  actor: Actor;
  organization: Organization;
  role: MembershipRole;
};
