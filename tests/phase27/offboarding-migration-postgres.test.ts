import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

// Fase 27 (SPEC-026 v1.0): schema fisico esperado da migration 0030.
// `createPostgresTestDatabase()` aplica 0001..0030 em sequencia num schema efemero novo -- isso
// ja e o "fresh install" completo (0001 -> 0030). A migration NUNCA e aplicada em `public` por
// este teste; apenas neste schema efemero, que e destruido em `afterAll`.
describe("Fase 27 - migration 0030 (schema fisico)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  // Revisao final (gate destrutivo pre-aplicacao): "nenhuma 0031+ existe" seria uma propriedade
  // temporal, nao historica -- verdadeira so enquanto a Fase 28 nao existir, e ficaria
  // inevitavelmente desatualizada assim que ela adicionar sua propria migration (mesma divida
  // ja diagnosticada e corrigida em tests/phase26/onboarding-employment-link-migration-postgres.test.ts).
  // Usa o mesmo padrao robusto: prova que 0030 existe e que a sequencia 0001-0030 permanece
  // intacta, sem afirmar que 0030 e ou sera eternamente a ultima migration do projeto.
  it("0030 esta aplicada e a sequencia 0001-0030 permanece intacta (nao afirma ser a ultima)", async () => {
    const applied = await database.pool.query(
      "SELECT 1 FROM schema_migrations WHERE id = '0030_phase_27_offboarding'"
    );
    expect(applied.rowCount).toBe(1);

    const upToAndIncluding30 = await database.pool.query(
      "SELECT count(*)::int AS count FROM schema_migrations WHERE id <= '0030_phase_27_offboarding'"
    );
    expect(upToAndIncluding30.rows[0].count).toBe(30);
  });

  it("nenhuma alteracao foi feita na tabela employments pela Fase 27", async () => {
    const columns = await database.pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'employments'
        ORDER BY ordinal_position
      `,
      [database.schema]
    );
    const names = columns.rows.map((row) => row.column_name);
    expect(names).not.toContain("offboarding_id");
    const triggers = await database.pool.query(
      `
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE trigger_schema = $1 AND event_object_table = 'employments'
      `,
      [database.schema]
    );
    const triggerNames = triggers.rows.map((row) => row.trigger_name);
    expect(triggerNames.some((name: string) => name.includes("offboard"))).toBe(false);
  });

  it("offboardings existe com employment_id TEXT NOT NULL", async () => {
    const result = await database.pool.query(
      `
        SELECT data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'offboardings' AND column_name = 'employment_id'
      `,
      [database.schema]
    );
    expect(result.rows[0].data_type).toBe("text");
    expect(result.rows[0].is_nullable).toBe("NO");
  });

  it("todas as colunas de offboardings usam TEXT para ids (nunca UUID)", async () => {
    const result = await database.pool.query(
      `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'offboardings'
          AND column_name IN ('id', 'organization_id', 'employment_id', 'created_by_user_id')
      `,
      [database.schema]
    );
    for (const row of result.rows) {
      expect(row.data_type).toBe("text");
    }
  });

  it("FK composta tenant-safe existe apontando para employments(organization_id, id)", async () => {
    const columns = await database.pool.query(
      `
        SELECT kcu.column_name
        FROM information_schema.key_column_usage kcu
        WHERE kcu.table_schema = $1
          AND kcu.table_name = 'offboardings'
          AND kcu.constraint_name = 'offboardings_organization_id_employment_id_fkey'
        ORDER BY kcu.ordinal_position
      `,
      [database.schema]
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "organization_id",
      "employment_id"
    ]);
  });

  it("indice parcial unico de cardinalidade existe com o predicado correto", async () => {
    const result = await database.pool.query(
      `
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = $1 AND indexname = 'idx_offboardings_one_non_final'
      `,
      [database.schema]
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].indexdef).toContain("WHERE");
    expect(result.rows[0].indexdef).toMatch(/draft/);
    expect(result.rows[0].indexdef).toMatch(/in_progress/);
  });

  it("offboarding_tasks existe com FKs tenant-safe para offboardings e memberships", async () => {
    const fks = await database.pool.query(
      `
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = $1 AND table_name = 'offboarding_tasks' AND constraint_type = 'FOREIGN KEY'
      `,
      [database.schema]
    );
    const names = fks.rows.map((row) => row.constraint_name);
    expect(names).toContain("offboarding_tasks_organization_id_offboarding_id_fkey");
    expect(names).toContain("offboarding_tasks_organization_id_assignee_membership_id_fkey");
  });

  it("offboarding_idempotency_keys existe com as 8 operacoes no CHECK", async () => {
    const result = await database.pool.query(
      `
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'offboarding_idempotency_keys'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%operation%'
      `
    );
    const definition = result.rows.map((row) => row.definition).join(" ");
    for (const operation of [
      "create",
      "start",
      "add_task",
      "assign",
      "task_complete",
      "task_cancel",
      "complete",
      "cancel"
    ]) {
      expect(definition).toContain(operation);
    }
  });

  it("triggers de no-delete existem nas 3 tabelas", async () => {
    const result = await database.pool.query(
      `
        SELECT event_object_table, trigger_name
        FROM information_schema.triggers
        WHERE trigger_schema = $1 AND trigger_name LIKE '%no_delete%'
          AND event_object_table IN ('offboardings', 'offboarding_tasks', 'offboarding_idempotency_keys')
      `,
      [database.schema]
    );
    const tables = result.rows.map((row) => row.event_object_table);
    expect(new Set(tables)).toEqual(
      new Set(["offboardings", "offboarding_tasks", "offboarding_idempotency_keys"])
    );
  });

  it("COMMENT ON TABLE existe nas 3 tabelas", async () => {
    const result = await database.pool.query(
      `
        SELECT c.relname, obj_description(c.oid) AS comment
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname IN ('offboardings', 'offboarding_tasks', 'offboarding_idempotency_keys')
      `,
      [database.schema]
    );
    for (const row of result.rows) {
      expect(row.comment).toBeTruthy();
    }
  });
});
