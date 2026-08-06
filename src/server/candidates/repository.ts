import type { Candidate, CandidateConsent, CandidateInternalNote, CandidateStatus } from "./types";

export interface CandidateRepository {
  nextId(prefix: string): string;
  now(): string;
  lockCandidates(organizationId: string): Promise<void>;
  createCandidate(candidate: Candidate): Promise<void>;
  updateCandidate(candidate: Candidate): Promise<void>;
  findCandidateById(candidateId: string): Promise<Candidate | null>;
  findCandidateByNormalizedEmail(
    organizationId: string,
    normalizedEmail: string
  ): Promise<Candidate | null>;
  listCandidates(organizationId: string, statuses: CandidateStatus[]): Promise<Candidate[]>;
  addConsent(consent: CandidateConsent): Promise<void>;
  listConsents(candidateId: string): Promise<CandidateConsent[]>;
  latestOperationalConsent(candidateId: string): Promise<CandidateConsent | null>;
  addInternalNote(note: CandidateInternalNote): Promise<void>;
  listInternalNotes(candidateId: string): Promise<CandidateInternalNote[]>;
}
