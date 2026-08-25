import type pg from "pg";
import { conflict } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresAuthRepository } from "../persistence/postgres-auth-repository";
import type { AuthRepository } from "./repository";

// Mesmo padrao de `access-grants/transaction.ts`/`employments/transaction.ts`: `core` e o MESMO
// `PostgresCoreRepository` com `inTransaction=true` sobre o MESMO `pg.PoolClient` usado por
// `auth` -- permite `new CoreService(tx.core).createMembership(...)`/`createOrganization(...)`
// rodar na MESMA transacao fisica do aceite/bootstrap, sem nested transaction real.
export type AuthTransaction = {
  core: CoreRepository;
  auth: AuthRepository;
};

export type AuthTransactionRunner = <T>(
  callback: (tx: AuthTransaction) => Promise<T>
) => Promise<T>;

export function createAuthTransactionRunner(pool: pg.Pool): AuthTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        auth: new PostgresAuthRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if (isPostgresConcurrentConflict(error)) {
        throw conflict(
          "auth_concurrent_change",
          "Invitation or Membership changed concurrently; retry the operation."
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
        "idx_invitations_one_pending_per_org_email",
        "idx_invitations_one_pending_bootstrap_per_email",
        "idx_invitation_idempotency_org",
        "idx_invitation_idempotency_bootstrap"
      ].includes(constraint))
  );
}
