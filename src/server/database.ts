import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveDatabasePath(databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db") {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Only local SQLite file URLs are allowed in development.");
  }

  const filePath = databaseUrl.replace("file:", "");
  return resolve(projectRoot, filePath);
}

export function openDevelopmentDatabase(databaseUrl?: string) {
  return new DatabaseSync(resolveDatabasePath(databaseUrl));
}

export function applySchema(database: DatabaseSync, schema: string) {
  database.exec(schema);
}
