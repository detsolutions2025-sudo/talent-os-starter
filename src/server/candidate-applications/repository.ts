import type {
  CandidateApplication,
  CandidateApplicationCandidateContext,
  CandidateApplicationConsentContext,
  CandidateApplicationEvent,
  CandidateApplicationJobOpeningContext,
  CandidateApplicationJobOpeningVersionContext,
  CandidateApplicationNote
} from "./types";

export interface CandidateApplicationRepository {
  nextId(prefix: string): string;
  now(): string;
  createApplication(application: CandidateApplication): Promise<void>;
  updateApplication(application: CandidateApplication): Promise<void>;
  findApplicationById(applicationId: string): Promise<CandidateApplication | null>;
  findApplicationForUpdate(applicationId: string): Promise<CandidateApplication | null>;
  findActiveApplication(
    organizationId: string,
    candidateId: string,
    jobOpeningId: string
  ): Promise<CandidateApplication | null>;
  listApplications(organizationId: string): Promise<CandidateApplication[]>;
  addEvent(event: CandidateApplicationEvent): Promise<void>;
  listEvents(applicationId: string): Promise<CandidateApplicationEvent[]>;
  addNote(note: CandidateApplicationNote): Promise<void>;
  listNotes(applicationId: string): Promise<CandidateApplicationNote[]>;
  findCandidate(candidateId: string): Promise<CandidateApplicationCandidateContext | null>;
  findJobOpening(jobOpeningId: string): Promise<CandidateApplicationJobOpeningContext | null>;
  findJobOpeningVersion(
    versionId: string
  ): Promise<CandidateApplicationJobOpeningVersionContext | null>;
  latestConsent(candidateId: string): Promise<CandidateApplicationConsentContext | null>;
}
