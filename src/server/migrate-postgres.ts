import "dotenv/config";
import { applyMigration, ensureMigrationTable, hasMigration, readMigrations } from "./migrations";
import {
  assertSafeMigrationEnvironment,
  createPostgresClient,
  redactDatabaseUrl,
  requirePostgresDatabaseUrl
} from "./postgres";

assertSafeMigrationEnvironment();

const connectionString = requirePostgresDatabaseUrl();
const client = createPostgresClient(connectionString);
const migrations = readMigrations();

await client.connect();

try {
  await ensureMigrationTable(client);

  for (const migration of migrations) {
    if (await hasMigration(client, migration.id)) {
      console.log(`Skipping ${migration.name}`);
      continue;
    }

    await applyMigration(client, migration);
    console.log(`Applied ${migration.name}`);
  }

  console.log(`Supabase migrations completed for ${redactDatabaseUrl(connectionString)}`);
} finally {
  await client.end();
}
