import type pg from "pg";
import { conflict } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresOffboardingRepository } from "../persistence/postgres-offboarding-repository";
import type { OffboardingRepository } from "./repository";

export type OffboardingTransaction = {
  core: CoreRepository;
  offboardings: OffboardingRepository;
};

export type OffboardingTransactionRunner = <T>(
  callback: (tx: OffboardingTransaction) => Promise<T>
) => Promise<T>;

export function createOffboardingTransactionRunner(pool: pg.Pool): OffboardingTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        offboardings: new PostgresOffboardingRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if (isPostgresConcurrentConflict(error)) {
        throw conflict(
          "offboarding_concurrent_change",
          "Offboarding changed concurrently; retry the operation."
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
  const code = (error as { code?: unknown }).code;
  const constraint = String((error as { constraint?: unknown }).constraint ?? "");
  return (
    code === "40P01" ||
    code === "40001" ||
    code === "55P03" ||
    (code === "23505" &&
      [
        "idx_offboardings_one_non_final",
        "offboarding_idempotency_keys_organization_id_operation_scope_id_key_hash_key"
      ].includes(constraint))
  );
}
