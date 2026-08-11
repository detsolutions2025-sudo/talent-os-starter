import type pg from "pg";
import type { CandidateApplicationRepository } from "../candidate-applications/repository";
import type { CoreRepository } from "../core/repository";
import { PostgresCandidateApplicationRepository } from "../persistence/postgres-candidate-application-repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresPreInterviewRepository } from "../persistence/postgres-pre-interview-repository";
import type { PreInterviewRepository } from "./repository";

// Uma unica transacao fisica (um unico PoolClient), mesmo padrao ja usado por
// interviews/service.ts e public-applications/transaction.ts. `candidateApplications` e
// incluido porque `createNextAttempt` (service.ts) trava a linha da CandidateApplication --
// a autoridade estavel de serializacao de attempt_number (Plano Tecnico, correcao final,
// item 1) -- na MESMA transacao fisica desta.
export type PreInterviewTransaction = {
  core: CoreRepository;
  preInterviews: PreInterviewRepository;
  candidateApplications: CandidateApplicationRepository;
};

export type PreInterviewTransactionRunner = <T>(
  callback: (tx: PreInterviewTransaction) => Promise<T>
) => Promise<T>;

export function createPreInterviewTransactionRunner(pool: pg.Pool): PreInterviewTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        preInterviews: new PostgresPreInterviewRepository(client),
        candidateApplications: new PostgresCandidateApplicationRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}
