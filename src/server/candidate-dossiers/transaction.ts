import type pg from "pg";
import type { CoreRepository } from "../core/repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresCandidateDossierRepository } from "../persistence/postgres-candidate-dossier-repository";
import type { CandidateDossierRepository } from "./repository";

export type CandidateDossierTransaction = {
  core: CoreRepository;
  candidateDossiers: CandidateDossierRepository;
};

export type CandidateDossierTransactionRunner = <T>(
  callback: (tx: CandidateDossierTransaction) => Promise<T>
) => Promise<T>;

export function createCandidateDossierTransactionRunner(
  pool: pg.Pool
): CandidateDossierTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        candidateDossiers: new PostgresCandidateDossierRepository(client)
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
