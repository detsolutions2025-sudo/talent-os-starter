import type pg from "pg";
import { conflict } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresAccessGrantRepository } from "../persistence/postgres-access-grant-repository";
import type { AccessGrantRepository } from "./repository";

// GATE CRITICO da Fase 28 (ADR-0025 "Revogacao"; SPEC-027 s13/s27/s29): `core` aqui e o MESMO
// `PostgresCoreRepository` com `inTransaction=true` sobre o MESMO `pg.PoolClient` usado por
// `accessGrants`. Isso e o que torna possivel `new CoreService(tx.core).updateMembership(...)`
// rodar na MESMA transacao fisica de `revoke` sem nested transaction real -- `transaction()`
// em `PostgresCoreRepository` vira um no-op de passagem quando `inTransaction=true`
// (`postgres-core-repository.ts`). Mesmo padrao ja usado por
// `employments/transaction.ts`/`offboardings/transaction.ts`, exercitado aqui pela primeira vez
// para uma MUTACAO real de `Membership`, nunca so leitura.
export type AccessGrantTransaction = {
  core: CoreRepository;
  accessGrants: AccessGrantRepository;
};

export type AccessGrantTransactionRunner = <T>(
  callback: (tx: AccessGrantTransaction) => Promise<T>
) => Promise<T>;

export function createAccessGrantTransactionRunner(pool: pg.Pool): AccessGrantTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        accessGrants: new PostgresAccessGrantRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if (isPostgresConcurrentConflict(error)) {
        throw conflict(
          "access_grant_concurrent_change",
          "AccessGrant changed concurrently; retry the operation."
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
        "idx_access_grants_one_active_per_membership",
        "access_grant_idempotency_keys_organization_id_operation_scope_id_key_hash_key"
      ].includes(constraint))
  );
}
