import type pg from "pg";
import { conflict } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresOnboardingRepository } from "../persistence/postgres-onboarding-repository";
import type { OnboardingRepository } from "./repository";

export type OnboardingTransaction = {
  core: CoreRepository;
  onboardings: OnboardingRepository;
};

export type OnboardingTransactionRunner = <T>(
  callback: (tx: OnboardingTransaction) => Promise<T>
) => Promise<T>;

export function createOnboardingTransactionRunner(pool: pg.Pool): OnboardingTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        onboardings: new PostgresOnboardingRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if (isPostgresTransientConflict(error)) {
        throw conflict(
          "onboarding_concurrent_change",
          "Onboarding changed concurrently; retry the operation."
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
  const constraint = String((error as { constraint?: unknown }).constraint ?? "");
  return (
    code === "40P01" ||
    code === "40001" ||
    code === "55P03" ||
    // Fase 26 (SPEC-016 v1.1 s46, s50): dois Onboardings disputando o mesmo
    // Employment colidem no indice unico parcial -- conflito seguro, nunca
    // erro generico 500.
    (code === "23505" && constraint === "idx_onboardings_employment_link")
  );
}
