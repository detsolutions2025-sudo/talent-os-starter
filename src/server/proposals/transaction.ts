import type pg from "pg";
import { conflict } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresProposalRepository } from "../persistence/postgres-proposal-repository";
import type { ProposalRepository } from "./repository";

export type ProposalTransaction = {
  core: CoreRepository;
  proposals: ProposalRepository;
};

export type ProposalTransactionRunner = <T>(
  callback: (tx: ProposalTransaction) => Promise<T>
) => Promise<T>;

export function createProposalTransactionRunner(pool: pg.Pool): ProposalTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        proposals: new PostgresProposalRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if (isPostgresTransientConflict(error)) {
        throw conflict(
          "proposal_concurrent_change",
          "Proposal changed concurrently; retry the operation."
        );
      }
      throw error;
    } finally {
      client.release();
    }
  };
}

function isPostgresTransientConflict(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "40P01" || code === "40001" || code === "55P03";
}
