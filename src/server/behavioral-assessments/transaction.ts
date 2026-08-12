import type pg from "pg";
import type { CandidateApplicationRepository } from "../candidate-applications/repository";
import type { CoreRepository } from "../core/repository";
import { PostgresCandidateApplicationRepository } from "../persistence/postgres-candidate-application-repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresBehavioralAssessmentRepository } from "../persistence/postgres-behavioral-assessment-repository";
import type { BehavioralAssessmentRepository } from "./repository";

// Uma unica transacao fisica (um unico PoolClient), mesmo padrao ja usado por
// pre-interviews/transaction.ts (Fase 18). `candidateApplications` e incluido porque a
// criacao de uma nova tentativa trava a linha da CandidateApplication -- a autoridade estavel
// de serializacao de attempt_number -- na MESMA transacao fisica desta (Correcao Final do
// Plano Tecnico, item 22).
export type BehavioralAssessmentTransaction = {
  core: CoreRepository;
  behavioralAssessments: BehavioralAssessmentRepository;
  candidateApplications: CandidateApplicationRepository;
};

export type BehavioralAssessmentTransactionRunner = <T>(
  callback: (tx: BehavioralAssessmentTransaction) => Promise<T>
) => Promise<T>;

export function createBehavioralAssessmentTransactionRunner(
  pool: pg.Pool
): BehavioralAssessmentTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        behavioralAssessments: new PostgresBehavioralAssessmentRepository(client),
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
