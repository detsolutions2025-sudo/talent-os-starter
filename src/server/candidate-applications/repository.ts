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
  // Fase 17 (SPEC-020 v1.1, secao 14): usado exclusivamente pela reaplicacao publica, para
  // decidir se uma nova CandidateApplication pode ser criada com base no `applicationStatus`
  // da candidatura mais recente (nao apenas da `active`, que `findActiveApplication` ja
  // cobre). Ordenado deterministicamente pela candidatura mais recente.
  findLatestApplicationByCandidateAndJobOpening(
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
