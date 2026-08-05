import { describe, expect, it } from "vitest";
import {
  assertSafeMigrationEnvironment,
  redactDatabaseUrl,
  requirePostgresDatabaseUrl
} from "../src/server/postgres";

describe("postgres configuration", () => {
  it("requires a postgres connection string", () => {
    expect(() => requirePostgresDatabaseUrl("file:./dev.db")).toThrow(
      "SUPABASE_DATABASE_URL must be a PostgreSQL connection string."
    );
  });

  it("does not leak invalid connection strings in validation errors", () => {
    const secretValue = "not-a-url-with-secret-password";

    expect(() => requirePostgresDatabaseUrl(secretValue)).toThrow(
      "SUPABASE_DATABASE_URL must be a valid PostgreSQL connection string."
    );

    try {
      requirePostgresDatabaseUrl(secretValue);
    } catch (error) {
      expect(String(error)).not.toContain(secretValue);
    }
  });

  it("rejects production migrations", () => {
    expect(() => assertSafeMigrationEnvironment("production")).toThrow(
      "Refusing to run migrations with APP_ENV=production."
    );
  });

  it("redacts credentials before logging", () => {
    expect(
      redactDatabaseUrl("postgresql://user:secret-password@db.example.supabase.co:5432/postgres")
    ).toBe("postgresql://user:***@db.example.supabase.co:5432/postgres");
  });
});
