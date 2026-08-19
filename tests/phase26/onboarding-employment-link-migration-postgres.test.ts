import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

// Fase 26 (SPEC-016 v1.1 s51): schema fisico esperado da migration 0029.
// `createPostgresTestDatabase()` aplica 0001..0029 em sequencia num schema
// efemero novo -- isso ja e o "fresh install" completo. Como 0029 e a ultima
// migration da sequencia, aplica-la logo apos 0001..0028 terem acabado de
// rodar no mesmo schema E, por definicao, a aplicacao incremental de 0029
// sobre 0028 (nao ha modo de "aplicar so um subconjunto" no mecanismo
// oficial fora deste teste).
describe("Fase 26 - migration 0029 (schema fisico)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  // Revisao final da Fase 27 (gate destrutivo pre-aplicacao da 0030): a asserção original desta
  // suite ("0029 foi aplicada e nenhuma 0030+ existe") media uma propriedade temporal, nao uma
  // propriedade historica -- era verdadeira apenas enquanto nenhuma fase seguinte existisse, e
  // deixou de ser valida no momento em que a Fase 27 adicionou 0030 legitimamente. Substituida
  // pelo mesmo padrao robusto ja usado pelo teste seguinte desta suite ("nenhuma migration antiga
  // (0001-0028) foi alterada"): prova que 0029 existe e que a sequencia 0001-0029 permanece
  // intacta, sem afirmar que 0029 e ou sera eternamente a ultima migration do projeto.
  it("0029 esta aplicada e a sequencia 0001-0029 permanece intacta (nao afirma ser a ultima)", async () => {
    const applied = await database.pool.query(
      "SELECT 1 FROM schema_migrations WHERE id = '0029_phase_26_onboarding_employment_link'"
    );
    expect(applied.rowCount).toBe(1);

    const upToAndIncluding29 = await database.pool.query(
      "SELECT count(*)::int AS count FROM schema_migrations WHERE id <= '0029_phase_26_onboarding_employment_link'"
    );
    expect(upToAndIncluding29.rows[0].count).toBe(29);
  });

  it("onboardings.employment_id existe como TEXT nullable", async () => {
    const result = await database.pool.query(
      `
        SELECT data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'onboardings' AND column_name = 'employment_id'
      `,
      [database.schema]
    );
    expect(result.rows[0].data_type).toBe("text");
    expect(result.rows[0].is_nullable).toBe("YES");
  });

  it("nenhuma tabela nova foi criada pela Fase 26", async () => {
    const result = await database.pool.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name LIKE '%employment_link%'
      `,
      [database.schema]
    );
    expect(result.rowCount).toBe(0);
  });

  it("FK composta tenant-safe existe apontando para employments(organization_id, id)", async () => {
    const columns = await database.pool.query(
      `
        SELECT kcu.column_name
        FROM information_schema.key_column_usage kcu
        WHERE kcu.table_schema = $1
          AND kcu.table_name = 'onboardings'
          AND kcu.constraint_name = 'onboardings_organization_id_employment_id_fkey'
        ORDER BY kcu.ordinal_position
      `,
      [database.schema]
    );
    expect(columns.rows.map((row) => row.column_name).sort()).toEqual([
      "employment_id",
      "organization_id"
    ]);

    const ftable = await database.pool.query(
      `
        SELECT DISTINCT ccu.table_name AS ftable
        FROM information_schema.constraint_column_usage ccu
        WHERE ccu.constraint_schema = $1
          AND ccu.constraint_name = 'onboardings_organization_id_employment_id_fkey'
      `,
      [database.schema]
    );
    expect(ftable.rowCount).toBe(1);
    expect(ftable.rows[0].ftable).toBe("employments");
  });

  it("indice unico parcial garante 0..1 Onboarding por Employment", async () => {
    const result = await database.pool.query(
      `
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = $1
          AND tablename = 'onboardings'
          AND indexname = 'idx_onboardings_employment_link'
      `,
      [database.schema]
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].indexdef).toContain("UNIQUE INDEX");
    expect(result.rows[0].indexdef).toContain("WHERE (employment_id IS NOT NULL)");
  });

  it("CHECK de operation em onboarding_idempotency_keys aceita link_employment", async () => {
    const result = await database.pool.query(
      `
        SELECT pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conrelid = ($1 || '.onboarding_idempotency_keys')::regclass
          AND conname = 'onboarding_idempotency_keys_operation_check'
      `,
      [database.schema]
    );
    expect(result.rows[0].def).toContain("link_employment");
  });

  it("nenhuma migration antiga (0001-0028) foi alterada por esta suite", async () => {
    const result = await database.pool.query(
      "SELECT count(*)::int AS count FROM schema_migrations WHERE id <= '0028_phase_25_development_retention'"
    );
    expect(result.rows[0].count).toBe(28);
  });
});
