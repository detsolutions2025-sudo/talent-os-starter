import pg from "pg";

const { Client, Pool } = pg;

export function requirePostgresDatabaseUrl(value = process.env.SUPABASE_DATABASE_URL) {
  if (!value) {
    throw new Error("SUPABASE_DATABASE_URL is required for PostgreSQL operations.");
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
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false
  });
}

export function createPostgresPool(
  connectionString: string,
  options: { max?: number; idleTimeoutMillis?: number; connectionTimeoutMillis?: number } = {}
) {
  const pool = new Pool({
    connectionString,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
    // TCP keepalive stops NATs, load balancers or the remote database's own proxy from
    // silently dropping a connection that sits idle in the pool between requests (e.g. while
    // another test file runs). Without it, the next query on that connection fails with a
    // connection-reset error instead of a normal query rejection.
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
    ...options
  });
  // pg.Pool is an EventEmitter: a backend error on a client that is idle in the pool (e.g. the
  // remote server resetting a connection) is reported through an "error" event, not through any
  // pending query promise. An EventEmitter "error" with no listener throws and brings down the
  // whole Node process. Without this handler, that single event can crash the entire server (or,
  // in tests, the Vitest worker) over one otherwise-harmless idle-connection blip.
  pool.on("error", (error) => {
    console.error("Unexpected idle PostgreSQL client error:", error);
  });
  return pool;
}

function shouldUseSsl(connectionString: string) {
  const parsed = new URL(connectionString);

  if (parsed.searchParams.get("sslmode") === "disable") {
    return false;
  }

  return parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1";
}
