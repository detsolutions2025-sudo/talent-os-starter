import "dotenv/config";
import {
  assertSafeMigrationEnvironment,
  createPostgresClient,
  redactDatabaseUrl,
  requirePostgresDatabaseUrl
} from "./postgres";

assertSafeMigrationEnvironment();

const connectionString = requirePostgresDatabaseUrl();
const client = createPostgresClient(connectionString);

await client.connect();

try {
  const result = await client.query<{ current_database: string; current_user: string }>(
    "SELECT current_database(), current_user"
  );
  const [{ current_database: database, current_user: user }] = result.rows;

  console.log(`Connected to ${redactDatabaseUrl(connectionString)}`);
  console.log(`Database: ${database}`);
  console.log(`User: ${user}`);
} finally {
  await client.end();
}
