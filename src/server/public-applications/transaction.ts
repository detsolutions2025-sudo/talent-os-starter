import type pg from "pg";
import type { CandidateRepository } from "../candidates/repository";
import type { CandidateApplicationRepository } from "../candidate-applications/repository";
import type { CoreRepository } from "../core/repository";
import type { JobOpeningRepository } from "../job-openings/repository";
import { PostgresCandidateRepository } from "../persistence/postgres-candidate-repository";
import { PostgresCandidateApplicationRepository } from "../persistence/postgres-candidate-application-repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresJobOpeningRepository } from "../persistence/postgres-job-opening-repository";

// Uma unica transacao fisica (um unico PoolClient) cobrindo Vaga (lock + revalidacao),
// Candidate, CandidateConsent e CandidateApplication (SPEC-020 v1.1, secao 12 -- atomicidade).
// Isolation level: READ COMMITTED (o default do projeto) -- suficiente porque a consistencia
// critica ja e garantida por `FOR UPDATE` explicito na Job Opening (secao 21/22 do Plano
// Tecnico) e pelas constraints de unicidade de Candidate e de CandidateApplication `active`,
// nunca apenas pelo isolation level.
export type PublicApplicationTransaction = {
  core: CoreRepository;
  candidateRepository: CandidateRepository;
  applicationRepository: CandidateApplicationRepository;
  jobOpenings: JobOpeningRepository;
};

export type PublicApplicationTransactionRunner = <T>(
  callback: (tx: PublicApplicationTransaction) => Promise<T>
) => Promise<T>;

export function createPublicApplicationTransactionRunner(
  pool: pg.Pool
): PublicApplicationTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        candidateRepository: new PostgresCandidateRepository(client),
        applicationRepository: new PostgresCandidateApplicationRepository(client),
        jobOpenings: new PostgresJobOpeningRepository(client)
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
