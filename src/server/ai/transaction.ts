import type { CoreRepository } from "../core/repository";
import type { AIRepository } from "./repository";

// Every AI infrastructure write (state change + its audit event) happens inside a single
// PostgreSQL transaction spanning both `core` (audit_events, and User/Organization/Membership
// reads for authorization) and `ai` (the nine Phase 11 tables) -- mirroring
// InterviewTransactionRunner. A failed audit write rolls back the whole operation
// (CONSTITUICAO_DO_PROJETO.md / SPEC-014: "Falha em auditoria critica deve causar rollback").
export type AITransaction = {
  core: CoreRepository;
  ai: AIRepository;
};

export type AITransactionRunner = <T>(
  callback: (transaction: AITransaction) => Promise<T>
) => Promise<T>;
