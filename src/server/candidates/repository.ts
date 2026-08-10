import type { Candidate, CandidateConsent, CandidateInternalNote, CandidateStatus } from "./types";

export interface CandidateRepository {
  nextId(prefix: string): string;
  now(): string;
  lockCandidates(organizationId: string): Promise<void>;
  createCandidate(candidate: Candidate): Promise<void>;
  // Fase 17 (revisao destrutiva, item 15): variante usada exclusivamente pela criacao publica.
  // `INSERT ... ON CONFLICT DO NOTHING` nunca lanca 23505 -- diferente de `createCandidate`,
  // que pode falhar com unique violation e deixar a transacao em estado abortado (Postgres:
  // qualquer erro dentro de uma transacao aborta todos os comandos seguintes ate ROLLBACK,
  // inclusive um SELECT de releitura). Retorna `true` quando esta chamada de fato inseriu a
  // linha; `false` quando uma corrida concorrente ja havia inserido o mesmo e-mail primeiro
  // (a transacao permanece utilizavel para releitura normal).
  createCandidateIfAbsent(candidate: Candidate): Promise<boolean>;
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
