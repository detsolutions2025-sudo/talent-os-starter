import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { createHiredFixture, createRecruitmentEmployment } from "./helpers";

describe("Fase 24 - migration OrganizationPerson e Employment", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("cria exatamente as tres tabelas fisicas da Fase 24", async () => {
    const result = await database.pool.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name IN (
            'organization_people',
            'employments',
            'employment_idempotency_keys'
          )
        ORDER BY table_name
      `
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      "employment_idempotency_keys",
      "employments",
      "organization_people"
    ]);

    const forbidden = await database.pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name IN ('employees', 'employee_profiles', 'employment_documents')
      `
    );
    expect(forbidden.rows[0].count).toBe(0);
  });

  it("possui unicidade, triggers de no-delete e lifecycle fisico", async () => {
    const indexes = await database.pool.query(
      `
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname IN (
            'idx_organization_people_origin_candidate',
            'idx_employments_one_non_final'
          )
        ORDER BY indexname
      `
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "idx_employments_one_non_final",
      "idx_organization_people_origin_candidate"
    ]);
    expect(indexes.rows.map((row) => row.indexdef).join("\n")).toContain("WHERE");

    const triggers = await database.pool.query(
      `
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE trigger_schema = current_schema()
          AND trigger_name IN (
            'trg_organization_person_no_delete',
            'trg_organization_person_invalid_update',
            'trg_employment_no_delete',
            'trg_employment_insert_rules',
            'trg_employment_update_rules',
            'trg_employment_idempotency_no_delete'
          )
        ORDER BY trigger_name
      `
    );
    expect(triggers.rows).toHaveLength(6);
  });

  it("bloqueia delete fisico e estados incoerentes por SQL direto", async () => {
    const fixture = await createHiredFixture(database, "migration-physical");
    const created = await createRecruitmentEmployment(fixture).expect(201);
    await expect(
      database.pool.query("DELETE FROM employments WHERE id = $1", [created.body.id])
    ).rejects.toThrow(/employment_no_physical_delete/);
    await expect(
      database.pool.query("UPDATE employments SET status = 'active' WHERE id = $1", [
        created.body.id
      ])
    ).rejects.toThrow(/employments_status_lifecycle_check/);
    await expect(
      database.pool.query(
        "UPDATE organization_people SET origin_candidate_id = NULL WHERE id = $1",
        [created.body.organizationPersonId]
      )
    ).rejects.toThrow(/organization_person_context_immutable/);
  });
});
