import type pg from "pg";
import { conflict } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresEmploymentRepository } from "../persistence/postgres-employment-repository";
import type { EmploymentRepository } from "./repository";

export type EmploymentTransaction = {
  core: CoreRepository;
  employments: EmploymentRepository;
};

export type EmploymentTransactionRunner = <T>(
  callback: (tx: EmploymentTransaction) => Promise<T>
) => Promise<T>;

export function createEmploymentTransactionRunner(pool: pg.Pool): EmploymentTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        employments: new PostgresEmploymentRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if (isPostgresConcurrentConflict(error)) {
        throw conflict(
          "employment_concurrent_change",
          "Employment changed concurrently; retry the operation."
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
        "idx_organization_people_origin_candidate",
        "idx_employments_one_non_final",
        "employment_idempotency_keys_organization_id_operation_scope_id_key_hash_key"
      ].includes(constraint))
  );
}
