import type pg from "pg";
import type { CandidateApplicationRepository } from "../candidate-applications/repository";
import type { CoreRepository } from "../core/repository";
import { PostgresCandidateApplicationRepository } from "../persistence/postgres-candidate-application-repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresPreAnalysisRepository } from "../persistence/postgres-pre-analysis-repository";
import type { PreAnalysisRepository } from "./repository";

// Uma unica transacao fisica (um unico PoolClient) por TX -- mesmo padrao ja usado por
// pre-interviews/transaction.ts (Fase 18) e behavioral-assessments/transaction.ts (Fase 19).
// `candidateApplications` e incluido porque a criacao de uma nova tentativa trava a linha da
// CandidateApplication -- a autoridade estavel de serializacao de attempt_number -- na MESMA
// transacao fisica de TX1 (mesmo principio ja exigido pela Fase 19).
//
// Boundary transacional final da Fase 20 (Plano Tecnico Consolidado, item 1): esta unica
// factory produz transacoes curtas e independentes, usadas tres vezes por execucao completa
// (TX1 preparacao, TX-running revalidacao, TX2 finalizacao) -- nunca uma unica transacao que
// abranja a chamada de rede ao AIGateway, que ocorre inteiramente FORA de qualquer chamada a
// este runner.
export type PreAnalysisTransaction = {
  core: CoreRepository;
  preAnalyses: PreAnalysisRepository;
  candidateApplications: CandidateApplicationRepository;
};

export type PreAnalysisTransactionRunner = <T>(
  callback: (tx: PreAnalysisTransaction) => Promise<T>
) => Promise<T>;

export function createPreAnalysisTransactionRunner(pool: pg.Pool): PreAnalysisTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        preAnalyses: new PostgresPreAnalysisRepository(client),
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
