import type { MembershipRole } from "../core/types";
import type { CandidateApplicationCandidateContext } from "../candidate-applications/types";
import type {
  Interview,
  InterviewApplicationContext,
  InterviewConsentContext,
  InterviewEvaluation,
  InterviewEvent,
  InterviewJobOpeningContext,
  InterviewJobOpeningVersionContext,
  InterviewParticipant,
  InterviewQuestion,
  InterviewQuestionCatalogContext,
  InterviewResponse
} from "./types";

export interface InterviewRepository {
  nextId(prefix: string): string;
  now(): string;
  createInterview(interview: Interview): Promise<void>;
  updateInterview(interview: Interview): Promise<void>;
  findInterviewById(interviewId: string): Promise<Interview | null>;
  findInterviewForUpdate(interviewId: string): Promise<Interview | null>;
  listInterviews(organizationId: string): Promise<Interview[]>;
  listInterviewsByApplication(organizationId: string, applicationId: string): Promise<Interview[]>;
  listInterviewsByParticipant(organizationId: string, userId: string): Promise<Interview[]>;
  addParticipant(participant: InterviewParticipant): Promise<void>;
  updateParticipant(participant: InterviewParticipant): Promise<void>;
  findParticipant(interviewId: string, userId: string): Promise<InterviewParticipant | null>;
  listParticipants(interviewId: string): Promise<InterviewParticipant[]>;
  addQuestion(question: InterviewQuestion): Promise<void>;
  listQuestions(interviewId: string): Promise<InterviewQuestion[]>;
  countQuestions(interviewId: string): Promise<number>;
  addResponse(response: InterviewResponse): Promise<void>;
  updateResponse(response: InterviewResponse): Promise<void>;
  findResponseByQuestion(interviewQuestionId: string): Promise<InterviewResponse | null>;
  listResponses(interviewId: string): Promise<InterviewResponse[]>;
  addEvaluation(evaluation: InterviewEvaluation): Promise<void>;
  updateEvaluation(evaluation: InterviewEvaluation): Promise<void>;
  findEvaluation(interviewId: string, evaluatorUserId: string): Promise<InterviewEvaluation | null>;
  listEvaluations(interviewId: string): Promise<InterviewEvaluation[]>;
  addEvent(event: InterviewEvent): Promise<void>;
  listEvents(interviewId: string): Promise<InterviewEvent[]>;
  findApplication(applicationId: string): Promise<InterviewApplicationContext | null>;
  findCandidate(candidateId: string): Promise<CandidateApplicationCandidateContext | null>;
  findJobOpening(jobOpeningId: string): Promise<InterviewJobOpeningContext | null>;
  findJobOpeningVersion(versionId: string): Promise<InterviewJobOpeningVersionContext | null>;
  latestConsent(candidateId: string): Promise<InterviewConsentContext | null>;
  findQuestionCatalogItem(catalogItemId: string): Promise<InterviewQuestionCatalogContext | null>;
  findMembershipRole(organizationId: string, userId: string): Promise<MembershipRole | null>;
}
