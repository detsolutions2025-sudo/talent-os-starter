import type pg from "pg";
import { conflict } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresDevelopmentRetentionRepository } from "../persistence/postgres-development-retention-repository";
import type { DevelopmentRetentionRepository } from "./repository";

export type DevelopmentRetentionTransaction = {
  core: CoreRepository;
  developmentRetention: DevelopmentRetentionRepository;
};

export type DevelopmentRetentionTransactionRunner = <T>(
  callback: (tx: DevelopmentRetentionTransaction) => Promise<T>
) => Promise<T>;

export function createDevelopmentRetentionTransactionRunner(
  pool: pg.Pool
): DevelopmentRetentionTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        developmentRetention: new PostgresDevelopmentRetentionRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if (isPostgresConcurrentConflict(error)) {
        throw conflict(
          "development_retention_concurrent_change",
          "Record changed concurrently; retry the operation."
        );
      }
      throw error;
    } finally {
      client.release();
    }
  };
}

function isPostgresConcurrentConflict(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown; constraint?: unknown }).code;
  const constraint = String((error as { constraint?: unknown }).constraint ?? "");
  return (
    code === "40P01" ||
    code === "40001" ||
    code === "55P03" ||
    (code === "23505" &&
      [
        "idx_development_plans_one_non_final",
        "development_retention_idempotency_keys_organization_id_operation_scope_id_key_hash_key"
      ].includes(constraint))
  );
}
