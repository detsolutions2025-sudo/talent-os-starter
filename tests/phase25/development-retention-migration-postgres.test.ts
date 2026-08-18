import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { createActiveEmploymentFixture, createConcern, createPlan, planAction } from "./helpers";

describe("Fase 25 - migration Desenvolvimento e Retencao", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("cria exatamente as seis tabelas fisicas da Fase 25", async () => {
    const result = await database.pool.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name IN (
            'development_plans',
            'development_goals',
            'development_checkins',
            'retention_concerns',
            'retention_actions',
            'development_retention_idempotency_keys'
          )
        ORDER BY table_name
      `
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      "development_checkins",
      "development_goals",
      "development_plans",
      "development_retention_idempotency_keys",
      "retention_actions",
      "retention_concerns"
    ]);

    const forbidden = await database.pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND (
            table_name IN (
              'performance_reviews', 'performance_scores', 'retention_scores', 'flight_risk',
              'promotions', 'succession', 'development_events', 'retention_events'
            )
          )
      `
    );
    expect(forbidden.rows[0].count).toBe(0);
  });

  it("possui unicidade de plano nao final, triggers de no-delete e lifecycle fisico", async () => {
    const indexes = await database.pool.query(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = 'idx_development_plans_one_non_final'
      `
    );
    expect(indexes.rows).toHaveLength(1);

    const triggers = await database.pool.query(
      `
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE trigger_schema = current_schema()
          AND trigger_name IN (
            'trg_development_plan_no_delete',
            'trg_development_goal_no_delete',
            'trg_development_checkin_no_delete',
            'trg_development_checkin_no_update',
            'trg_retention_concern_no_delete',
            'trg_retention_action_no_delete',
            'trg_development_retention_idempotency_no_delete',
            'trg_reconcile_development_plans_on_employment_end'
          )
      `
    );
    expect(triggers.rows).toHaveLength(8);
  });

  it("bloqueia delete fisico e transicoes incoerentes por SQL direto", async () => {
    const fixture = await createActiveEmploymentFixture(database, "migration-physical");
    const plan = await createPlan(fixture).expect(201);

    await expect(
      database.pool.query("DELETE FROM development_plans WHERE id = $1", [plan.body.id])
    ).rejects.toThrow(/development_plan_no_physical_delete/);

    await expect(
      database.pool.query("UPDATE development_plans SET status = 'completed' WHERE id = $1", [
        plan.body.id
      ])
    ).rejects.toThrow(
      /development_plans_status_lifecycle_check|development_plan_invalid_status_transition/
    );

    await expect(
      database.pool.query("UPDATE development_plans SET employment_id = $2 WHERE id = $1", [
        plan.body.id,
        `empl_${crypto.randomUUID()}`
      ])
    ).rejects.toThrow(/development_plan_context_immutable/);
  });

  it("check-in e imutavel: nenhum UPDATE e permitido apos submissao", async () => {
    const fixture = await createActiveEmploymentFixture(database, "checkin-immutable");
    const plan = await createPlan(fixture).expect(201);
    await planAction(fixture, plan.body.id, "activate").expect(200);
    const checkIn = await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/development-plans/${plan.body.id}/check-ins`
      )
      .set({ "x-dev-user-id": fixture.ownerId })
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ summary: "Progresso inicial.", visibility: "owner_admin_only" })
      .expect(201);

    await expect(
      database.pool.query("UPDATE development_checkins SET summary = 'alterado' WHERE id = $1", [
        checkIn.body.id
      ])
    ).rejects.toThrow(/development_checkin_immutable/);
    await expect(
      database.pool.query("DELETE FROM development_checkins WHERE id = $1", [checkIn.body.id])
    ).rejects.toThrow(/development_checkin_no_physical_delete/);
  });

  it("RetentionConcern nunca e criada sem ator humano (source sempre da lista permitida)", async () => {
    const fixture = await createActiveEmploymentFixture(database, "migration-concern-source");
    await expect(
      database.pool.query(
        `
          INSERT INTO retention_concerns (
            id, organization_id, employment_id, source, category, description, status,
            visibility, created_by_membership_id
          )
          SELECT $1, $2, $3, 'ai_inferred', 'career_growth', 'x', 'open', 'owner_admin_only', m.id
          FROM memberships m WHERE m.organization_id = $2 LIMIT 1
        `,
        [`retconcern_${crypto.randomUUID()}`, fixture.organizationId, fixture.employmentId]
      )
    ).rejects.toThrow();
    const created = await createConcern(fixture).expect(201);
    expect(created.body.source).not.toBe("ai_inferred");
  });
});
