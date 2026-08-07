import "dotenv/config";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  createPostgresClient,
  createPostgresPool,
  requirePostgresDatabaseUrl
} from "../../src/server/postgres";
import { applyMigration, ensureMigrationTable, readMigrations } from "../../src/server/migrations";

export type PostgresTestDatabase = {
  pool: pg.Pool;
  schema: string;
  cleanup: () => Promise<void>;
};

export async function createPostgresTestDatabase(): Promise<PostgresTestDatabase> {
  if (process.env.APP_ENV === "production") {
    throw new Error("Refusing to run PostgreSQL tests with APP_ENV=production.");
  }

  const connectionString = process.env.TEST_DATABASE_URL ?? requirePostgresDatabaseUrl();
  const schema = `test_phase_1_1_${randomUUID().replaceAll("-", "_")}`;
  const setupClient = createPostgresClient(connectionString);

  await setupClient.connect();

  try {
    await setupClient.query(`CREATE SCHEMA ${schema}`);
    await setupClient.query(`SET search_path TO ${schema}`);
    await ensureMigrationTable(setupClient);

    for (const migration of readMigrations()) {
      await applyMigration(setupClient, migration);
    }
  } catch (error) {
    await setupClient.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    throw error;
  } finally {
    await setupClient.end();
  }

  // A small, bounded pool keeps the peak number of simultaneous connections against the
  // shared remote test database low across the (sequential, fileParallelism:false) suite of
  // Postgres test files, each of which opens its own pool for the lifetime of one file.
  const pool = createPostgresPool(withSearchPath(connectionString, schema), {
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000
  });
  // node-postgres Pool is an EventEmitter: a backend error on an otherwise-idle pooled
  // client (e.g. a connection reset between tests) emits "error" with no default handler.
  // An EventEmitter "error" event with zero listeners throws and kills the process, which
  // is exactly the intermittent "Worker exited unexpectedly" crash the Vitest run showed —
  // unrelated to whichever test happened to be running when the idle connection dropped.
  // Attaching a listener here turns that into a safely logged, non-fatal event.
  pool.on("error", (error) => {
    console.error(`Idle PostgreSQL client error in test schema ${schema}:`, error);
  });

  return {
    pool,
    schema,
    cleanup: async () => {
      await pool.end();
      const cleanupClient = createPostgresClient(connectionString);
      await cleanupClient.connect();
      try {
        await cleanupClient.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await cleanupClient.end();
      }
    }
  };
}

function withSearchPath(connectionString: string, schema: string) {
  const url = new URL(connectionString);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}
