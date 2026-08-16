import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

describe("Fase 23 - migration de Onboarding", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("cria exatamente as tres tabelas da Fase 23 e nenhuma tabela futura", async () => {
    const result = await database.pool.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name LIKE 'onboarding%'
        ORDER BY table_name
      `,
      [database.schema]
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      "onboarding_idempotency_keys",
      "onboarding_tasks",
      "onboardings"
    ]);
  });

  it("adiciona UNIQUE tenant-safe em memberships e protege cardinalidade", async () => {
    const constraints = await database.pool.query(
      `
        SELECT conname, pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = $1
          AND t.relname IN ('memberships', 'onboardings')
        ORDER BY conname
      `,
      [database.schema]
    );
    const defs = constraints.rows.map((row) => `${row.conname}: ${row.def}`);
    expect(defs.some((def) => def.includes("UNIQUE (organization_id, id)"))).toBe(true);
    expect(
      defs.some((def) => def.includes("UNIQUE (organization_id, candidate_application_id)"))
    ).toBe(true);
  });

  it("bloqueia estados inexistentes, transicoes invalidas e delete fisico por SQL direto", async () => {
    await expect(
      database.pool.query(
        "INSERT INTO onboardings (id, organization_id, candidate_application_id, candidate_id, status, created_by_user_id) VALUES ('x', 'org', 'app', 'cand', 'pending', 'usr')"
      )
    ).rejects.toThrow(/onboarding_insert_must_be_draft/);

    const trigger = await database.pool.query(
      `
        SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1
          AND p.proname IN (
            'enforce_onboarding_update_rules',
            'enforce_onboarding_task_write_rules',
            'enforce_onboarding_insert_rules',
            'prevent_onboarding_delete',
            'prevent_onboarding_task_delete'
          )
      `,
      [database.schema]
    );
    expect(trigger.rowCount).toBe(5);
  });
});
