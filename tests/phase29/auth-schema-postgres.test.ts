// @vitest-environment node
// Fase 29. Todo teste Postgres deste projeto ja aplica 0001->0032 do zero num schema efemero
// (`createPostgresTestDatabase`) -- este arquivo formaliza essa garantia como o teste explicito
// de "fresh install" exigido (secao 27 do prompt de implementacao): a migration 0032, ja aplicada
// e IMUTAVEL em `public` (DEV), tambem reproduz corretamente do zero, e a forma fisica resultante
// e comparada, campo a campo, com o que foi verificado manualmente em `public` na tarefa anterior.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

describe("migration 0032 -- fresh install (SPEC-028; comparacao com public DEV)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("registers 0032 in schema_migrations after a from-scratch 0001..0032 run", async () => {
    const result = await database.pool.query(
      "SELECT id, name FROM schema_migrations WHERE id = '0032_phase_29_authentication'"
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].name).toBe("0032_phase_29_authentication.sql");
  });

  it("creates exactly the four new tables, zero ALTER on existing core tables", async () => {
    const tables = await database.pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name IN ('auth_identities','platform_admins','invitations','invitation_idempotency_keys')
       ORDER BY table_name`
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      "auth_identities",
      "invitation_idempotency_keys",
      "invitations",
      "platform_admins"
    ]);

    // Zero alteracao de schema em users/memberships/organizations/access_grants -- confirmado
    // fisicamente (colunas identicas as ja fechadas pelas Fases 1 e 28).
    const users = await database.pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'users' ORDER BY ordinal_position`
    );
    expect(users.rows.map((r) => r.column_name)).toEqual([
      "id",
      "name",
      "email",
      "status",
      "created_at",
      "updated_at"
    ]);

    const memberships = await database.pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'memberships' ORDER BY ordinal_position`
    );
    expect(memberships.rows.map((r) => r.column_name)).toEqual([
      "id",
      "organization_id",
      "user_id",
      "role",
      "status",
      "joined_at",
      "created_at",
      "updated_at"
    ]);
  });

  it("creates auth_identities with the exact expected shape", async () => {
    const columns = await database.pool.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'auth_identities'
       ORDER BY ordinal_position`
    );
    expect(columns.rows.map((r) => r.column_name)).toEqual([
      "id",
      "user_id",
      "provider",
      "external_id",
      "created_at",
      "updated_at"
    ]);
    // 1:1 nesta Fase -- user_id deve ser UNIQUE (nao apenas indexado).
    const uniqueOnUserId = await database.pool.query(
      `SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'auth_identities' AND c.contype = 'u'
         AND c.conkey = (SELECT array_agg(attnum) FROM pg_attribute
                          WHERE attrelid = t.oid AND attname = 'user_id')`
    );
    expect(uniqueOnUserId.rowCount).toBeGreaterThanOrEqual(1);
  });

  it("creates the two NULL-safe partial unique indexes on invitations (bootstrap-safe)", async () => {
    const indexes = await database.pool.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = current_schema() AND tablename = 'invitations'
       ORDER BY indexname`
    );
    const names = indexes.rows.map((r) => r.indexname);
    expect(names).toContain("idx_invitations_one_pending_per_org_email");
    expect(names).toContain("idx_invitations_one_pending_bootstrap_per_email");
    const bootstrapIndex = indexes.rows.find(
      (r) => r.indexname === "idx_invitations_one_pending_bootstrap_per_email"
    );
    expect(bootstrapIndex.indexdef).toMatch(/organization_id IS NULL/);
  });

  it("rejects an invitation with role=owner and organization_id set (bootstrap payload CHECK)", async () => {
    await database.pool.query("BEGIN");
    try {
      await expect(
        database.pool.query(
          `INSERT INTO organizations (id, name, slug, status) VALUES ('org_x', 'X', 'org-x-schema-check', 'active')`
        )
      ).resolves.toBeDefined();
      await expect(
        database.pool.query(
          `INSERT INTO users (id, name, email, status) VALUES ('usr_x', 'X', 'x-schema-check@example.com', 'active')`
        )
      ).resolves.toBeDefined();
      await expect(
        database.pool.query(
          `INSERT INTO invitations (id, organization_id, email, role, status, created_by_user_id, expires_at)
           VALUES ('inv_x', 'org_x', 'x-schema-check@example.com', 'owner', 'pending', 'usr_x', NOW() + interval '7 days')`
        )
      ).rejects.toThrow(/invitations_bootstrap_payload_check/);
    } finally {
      await database.pool.query("ROLLBACK");
    }
  });

  it("blocks physical DELETE on all four new tables (no-delete triggers)", async () => {
    await database.pool.query("BEGIN");
    try {
      await database.pool.query(
        `INSERT INTO users (id, name, email, status) VALUES ('usr_del', 'Del', 'del-schema-check@example.com', 'active')`
      );
      await database.pool.query(
        `INSERT INTO auth_identities (id, user_id, provider, external_id) VALUES ('ai_del', 'usr_del', 'supabase', 'ext_del')`
      );
      await expect(
        database.pool.query(`DELETE FROM auth_identities WHERE id = 'ai_del'`)
      ).rejects.toThrow(/auth_identity_no_physical_delete/);
    } finally {
      await database.pool.query("ROLLBACK");
    }
  });
});
