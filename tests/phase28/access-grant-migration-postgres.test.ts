import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

// Fase 28 (ADR-0025; SPEC-027 v1.0): schema fisico esperado da migration 0031.
// `createPostgresTestDatabase()` aplica 0001..0031 em sequencia num schema efemero novo -- este
// e o "fresh install" completo (0001 -> 0031). A migration NUNCA e aplicada em `public` por este
// teste; apenas neste schema efemero, destruido em `afterAll`.
describe("Fase 28 - migration 0031 (schema fisico)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("0031 esta aplicada e a sequencia 0001-0031 permanece intacta", async () => {
    const applied = await database.pool.query(
      "SELECT 1 FROM schema_migrations WHERE id = '0031_phase_28_access_grants'"
    );
    expect(applied.rowCount).toBe(1);

    const upToAndIncluding31 = await database.pool.query(
      "SELECT count(*)::int AS count FROM schema_migrations WHERE id <= '0031_phase_28_access_grants'"
    );
    expect(upToAndIncluding31.rows[0].count).toBe(31);
  });

  // ADR-0025 (esclarecimento 2026-08-20): a Fase 28 nao ALTERA `memberships` -- apenas confirma,
  // de forma idempotente, uma constraint que ja existe desde a Fase 23 (0025_phase_23_onboarding).
  it("memberships_organization_id_id_key existe (auxiliar, ja herdada da Fase 23, nao criada aqui)", async () => {
    const result = await database.pool.query(
      `
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.conname = 'memberships_organization_id_id_key'
          AND t.relname = 'memberships'
          AND n.nspname = $1
      `,
      [database.schema]
    );
    expect(result.rowCount).toBe(1);
  });

  it("nenhuma alteracao de dominio foi feita em employments/offboardings pela Fase 28", async () => {
    const triggers = await database.pool.query(
      `
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE trigger_schema = $1
          AND event_object_table IN ('employments', 'offboardings', 'memberships', 'users')
      `,
      [database.schema]
    );
    const triggerNames = triggers.rows.map((row) => row.trigger_name);
    expect(triggerNames.some((name: string) => name.includes("access_grant"))).toBe(false);
  });

  it("access_grants existe com todas as colunas TEXT para ids (nunca UUID)", async () => {
    const result = await database.pool.query(
      `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'access_grants'
          AND column_name IN (
            'id', 'organization_id', 'organization_person_id', 'membership_id', 'employment_id',
            'created_by_user_id', 'revoked_by_user_id'
          )
      `,
      [database.schema]
    );
    expect(result.rows.length).toBe(7);
    for (const row of result.rows) {
      expect(row.data_type).toBe("text");
    }
  });

  it("FK composta tenant-safe existe para organization_people, memberships e employments", async () => {
    const fks = await database.pool.query(
      `
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = $1 AND table_name = 'access_grants' AND constraint_type = 'FOREIGN KEY'
      `,
      [database.schema]
    );
    const names = fks.rows.map((row) => row.constraint_name);
    expect(names).toContain("access_grants_organization_id_organization_person_id_fkey");
    expect(names).toContain("access_grants_organization_id_membership_id_fkey");
    expect(names).toContain("access_grants_organization_id_employment_id_fkey");
  });

  it("indice parcial unico de cardinalidade (um active por Membership) existe com o predicado correto", async () => {
    const result = await database.pool.query(
      `
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = $1 AND indexname = 'idx_access_grants_one_active_per_membership'
      `,
      [database.schema]
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].indexdef).toContain("WHERE");
    expect(result.rows[0].indexdef).toMatch(/active/);
  });

  it("CHECK de exclusividade mutua de provenance existe", async () => {
    const result = await database.pool.query(
      `
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'access_grants'::regclass
          AND conname = 'access_grants_provenance_payload_check'
      `
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].definition).toContain("employment_id");
    expect(result.rows[0].definition).toContain("grant_reason");
  });

  it("access_grant_idempotency_keys existe com grant/revoke no CHECK de operation", async () => {
    const result = await database.pool.query(
      `
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'access_grant_idempotency_keys'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%operation%'
      `
    );
    const definition = result.rows.map((row) => row.definition).join(" ");
    expect(definition).toContain("grant");
    expect(definition).toContain("revoke");
  });

  it("triggers de no-delete existem nas 2 tabelas", async () => {
    const result = await database.pool.query(
      `
        SELECT event_object_table, trigger_name
        FROM information_schema.triggers
        WHERE trigger_schema = $1 AND trigger_name LIKE '%no_delete%'
          AND event_object_table IN ('access_grants', 'access_grant_idempotency_keys')
      `,
      [database.schema]
    );
    const tables = result.rows.map((row) => row.event_object_table);
    expect(new Set(tables)).toEqual(new Set(["access_grants", "access_grant_idempotency_keys"]));
  });

  it("trigger de regras de update existe em access_grants", async () => {
    const result = await database.pool.query(
      `
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE trigger_schema = $1 AND event_object_table = 'access_grants'
          AND trigger_name = 'trg_access_grant_update_rules'
      `,
      [database.schema]
    );
    expect(result.rowCount).toBe(1);
  });

  it("COMMENT ON TABLE existe nas 2 tabelas", async () => {
    const result = await database.pool.query(
      `
        SELECT c.relname, obj_description(c.oid) AS comment
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('access_grants', 'access_grant_idempotency_keys')
      `,
      [database.schema]
    );
    expect(result.rows.length).toBe(2);
    for (const row of result.rows) {
      expect(row.comment).toBeTruthy();
    }
  });
});
