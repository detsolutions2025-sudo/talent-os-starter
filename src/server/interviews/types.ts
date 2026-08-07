import type { Actor, MembershipRole, Organization } from "../core/types";
import type { CandidateApplicationCandidateContext } from "../candidate-applications/types";

export type InterviewType =
  | "screening"
  | "behavioral"
  | "technical"
  | "cultural"
  | "leadership"
  | "management"
  | "panel"
  | "final"
  | "other";

export type InterviewStatus =
  "draft" | "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";

export type InterviewLocationType = "onsite" | "video" | "phone" | "other";
export type InterviewParticipantRole = "lead" | "interviewer" | "observer";
export type InterviewParticipantStatus = "active" | "inactive";
export type InterviewRecommendation = "strong_no" | "no" | "neutral" | "yes" | "strong_yes";
export type InterviewQuestionType =
  | "open_text"
  | "long_text"
  | "single_choice"
  | "multiple_choice"
  | "yes_no"
  | "numeric"
  | "scale"
  | "date"
  | "situational"
  | "behavioral"
  | "technical";

export type InterviewEventType =
  | "interview_created"
  | "draft_updated"
  | "scheduled"
  | "rescheduled"
  | "participant_added"
  | "participant_removed"
  | "participant_inactivated"
  | "question_added"
  | "question_removed"
  | "question_reordered"
  | "started"
  | "response_created"
  | "response_updated"
  | "evaluation_created"
  | "evaluation_updated"
  | "completed"
  | "cancelled"
  | "no_show"
  | "access_denied"
  | "administrative_read";

export type Interview = {
  id: string;
  organizationId: string;
  candidateApplicationId: string;
  title: string;
  type: InterviewType;
  status: InterviewStatus;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  timezone: string;
  locationType: InterviewLocationType;
  locationDetails: string | null;
  interviewerInstructions: string | null;
  candidateInstructions: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  noShowAt: string | null;
  noShowByUserId: string | null;
  noShowReason: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InterviewParticipant = {
  id: string;
  organizationId: string;
  interviewId: string;
  userId: string;
  role: InterviewParticipantRole;
  status: InterviewParticipantStatus;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InterviewQuestion = {
  id: string;
  organizationId: string;
  interviewId: string;
  questionCatalogItemId: string;
  snapshotTitle: string;
  snapshotText: string;
  snapshotType: InterviewQuestionType;
  snapshotOptions: unknown[];
  snapshotSettings: Record<string, unknown>;
  displayOrder: number;
  required: boolean;
  contextualWeight: number | null;
  contextualCompetencyCatalogItemId: string | null;
  createdByUserId: string;
  createdAt: string;
};

export type InterviewResponse = {
  id: string;
  organizationId: string;
  interviewId: string;
  interviewQuestionId: string;
  responseValue: unknown;
  interviewerObservation: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InterviewEvaluation = {
  id: string;
  organizationId: string;
  interviewId: string;
  evaluatorUserId: string;
  recommendation: InterviewRecommendation;
  summary: string;
  strengths: string;
  attentionPoints: string;
  overallRating: number;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InterviewEvent = {
  id: string;
  organizationId: string;
  interviewId: string;
  eventType: InterviewEventType;
  statusBefore: InterviewStatus | null;
  statusAfter: InterviewStatus | null;
  actorUserId: string | null;
  reason: string | null;
  metadata: Record<string, string>;
  createdAt: string;
};

export type InterviewApplicationContext = {
  id: string;
  organizationId: string;
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  applicationStatus: "active" | "withdrawn" | "rejected" | "hired" | "cancelled";
  currentStage: string;
};

export type InterviewJobOpeningContext = {
  id: string;
  organizationId: string;
  title: string;
};

export type InterviewJobOpeningVersionContext = {
  id: string;
  organizationId: string;
  publicTitle: string;
};

export type InterviewConsentContext = {
  status: "granted" | "revoked" | "expired" | "pending";
  expiresAt: string | null;
};

export type InterviewQuestionCatalogContext = {
  id: string;
  organizationId: string;
  status: "active" | "inactive";
  title: string;
  questionText: string;
  type: InterviewQuestionType;
  options: unknown[];
  settings: Record<string, unknown>;
  competencyCatalogItemId: string | null;
};

export type InterviewInput = {
  [key: string]: unknown;
  candidateApplicationId?: unknown;
  candidate_application_id?: unknown;
  title?: unknown;
  type?: unknown;
  timezone?: unknown;
  locationType?: unknown;
  location_type?: unknown;
  locationDetails?: unknown;
  location_details?: unknown;
  interviewerInstructions?: unknown;
  interviewer_instructions?: unknown;
  candidateInstructions?: unknown;
  candidate_instructions?: unknown;
};

export type InterviewDraftInput = Partial<InterviewInput>;
export type InterviewParticipantInput = {
  [key: string]: unknown;
  userId?: unknown;
  user_id?: unknown;
  role?: unknown;
};
export type InterviewQuestionInput = {
  [key: string]: unknown;
  questionCatalogItemId?: unknown;
  question_catalog_item_id?: unknown;
  displayOrder?: unknown;
  display_order?: unknown;
  required?: unknown;
  contextualWeight?: unknown;
  contextual_weight?: unknown;
  contextualCompetencyCatalogItemId?: unknown;
  contextual_competency_catalog_item_id?: unknown;
};
export type InterviewScheduleInput = {
  [key: string]: unknown;
  scheduledStartAt?: unknown;
  scheduled_start_at?: unknown;
  scheduledEndAt?: unknown;
  scheduled_end_at?: unknown;
  timezone?: unknown;
  locationType?: unknown;
  location_type?: unknown;
  locationDetails?: unknown;
  location_details?: unknown;
};
export type InterviewResponseInput = {
  [key: string]: unknown;
  interviewQuestionId?: unknown;
  interview_question_id?: unknown;
  responseValue?: unknown;
  response_value?: unknown;
  interviewerObservation?: unknown;
  interviewer_observation?: unknown;
};
export type InterviewEvaluationInput = {
  [key: string]: unknown;
  recommendation?: unknown;
  summary?: unknown;
  strengths?: unknown;
  attentionPoints?: unknown;
  attention_points?: unknown;
  overallRating?: unknown;
  overall_rating?: unknown;
};
export type InterviewReasonInput = { [key: string]: unknown; reason?: unknown };
export type InterviewAdminReadInput = { [key: string]: unknown; reason?: unknown };

export type InterviewContext = {
  actor: Actor;
  organization: Organization;
  role: MembershipRole;
};

export type InterviewAggregate = {
  interview: Interview;
  application: InterviewApplicationContext | null;
  candidate: CandidateApplicationCandidateContext | null;
  jobOpening: InterviewJobOpeningContext | null;
  jobOpeningVersion: InterviewJobOpeningVersionContext | null;
  participants: InterviewParticipant[];
  questions: InterviewQuestion[];
  responses: InterviewResponse[];
  evaluations: InterviewEvaluation[];
  events?: InterviewEvent[];
};
