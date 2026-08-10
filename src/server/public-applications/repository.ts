import type { PublicApplicationSubmission } from "./types";

export type BeginSubmissionInput = {
  organizationId: string;
  jobOpeningId: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
};

export type BeginSubmissionResult = {
  submission: PublicApplicationSubmission;
  // true quando esta chamada criou a linha (primeira tentativa desta Idempotency-Key); false
  // quando ja existia uma submissao anterior com a mesma chave (replay ou conflito).
  created: boolean;
};

// Sempre ligado ao `pg.Pool` (nunca a um `PoolClient` transacional): a bookkeeping de
// idempotencia precisa sobreviver ao rollback da transacao de negocio principal (mesmo padrao
// de "preflight fora da transacao" ja usado pela Fase 15 para auditoria de negacao).
export interface PublicApplicationRepository {
  nextId(prefix: string): string;
  now(): string;
  beginSubmission(input: BeginSubmissionInput): Promise<BeginSubmissionResult>;
  markSubmissionCompleted(submissionId: string, candidateApplicationId: string): Promise<void>;
  markSubmissionFailed(submissionId: string): Promise<void>;
  resetSubmissionToPending(submissionId: string): Promise<void>;
}
