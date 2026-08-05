import pg from "pg";

const { Client } = pg;

export function requirePostgresDatabaseUrl(value = process.env.SUPABASE_DATABASE_URL) {
  if (!value) {
    throw new Error("SUPABASE_DATABASE_URL is required to run Supabase migrations.");
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SUPABASE_DATABASE_URL must be a valid PostgreSQL connection string.");
  }
  const isPostgres = parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";

  if (!isPostgres) {
    throw new Error("SUPABASE_DATABASE_URL must be a PostgreSQL connection string.");
  }

  return value;
}

export function assertSafeMigrationEnvironment(appEnv = process.env.APP_ENV ?? "development") {
  if (appEnv === "production") {
    throw new Error("Refusing to run migrations with APP_ENV=production.");
  }
}

export function redactDatabaseUrl(value: string) {
  const parsed = new URL(value);
  const user = parsed.username ? `${parsed.username}:***@` : "";
  const port = parsed.port ? `:${parsed.port}` : "";

  return `${parsed.protocol}//${user}${parsed.hostname}${port}${parsed.pathname}`;
}

export function createPostgresClient(connectionString: string) {
  return new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
}
