import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Client } from "pg";

export type Migration = {
  id: string;
  name: string;
  sql: string;
};

export function readMigrations(directory = resolve("db/migrations")) {
  return readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => {
      const id = basename(fileName, ".sql");

      return {
        id,
        name: fileName,
        sql: readFileSync(resolve(directory, fileName), "utf8")
      };
    });
}

export async function ensureMigrationTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function hasMigration(client: Client, id: string) {
  const result = await client.query("SELECT 1 FROM schema_migrations WHERE id = $1", [id]);

  return (result.rowCount ?? 0) > 0;
}

export async function applyMigration(client: Client, migration: Migration) {
  await client.query("BEGIN");

  try {
    await client.query(migration.sql);
    await client.query("INSERT INTO schema_migrations (id, name) VALUES ($1, $2)", [
      migration.id,
      migration.name
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
