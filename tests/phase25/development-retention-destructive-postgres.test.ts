import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createActiveEmploymentFixture,
  createConcern,
  createGoal,
  createPlan,
  planAction,
  userHeaders
} from "./helpers";

describe("Fase 25 - cenarios destrutivos de runtime", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("create plan x create plan concorrente nunca gera dois planos nao finais; audita conflito", async () => {
    const fixture = await createActiveEmploymentFixture(database, "race-create-plan");
    const responses = await Promise.all([
      createPlan(fixture, `race-a-${crypto.randomUUID()}`),
      createPlan(fixture, `race-b-${crypto.randomUUID()}`)
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);

    const count = await database.pool.query(
      `
        SELECT COUNT(*)::int AS count FROM development_plans
        WHERE organization_id = $1 AND status IN ('draft', 'active')
      `,
      [fixture.organizationId]
    );
    expect(count.rows[0].count).toBe(1);

    const auditEvents = await database.pool.query(
      `
        SELECT COUNT(*)::int AS count FROM audit_events
        WHERE organization_id = $1 AND action = 'development_retention.concurrent_operation_conflict'
      `,
      [fixture.organizationId]
    );
    expect(auditEvents.rows[0].count).toBeGreaterThanOrEqual(1);
  });

  it("activate x cancel concorrente: cancel sempre vence ao final; activate soh falha se perder a corrida pelo lock", async () => {
    // SPEC-017 s6 (state machine do DevelopmentPlan): cancel e valido a partir de `draft` OU de
    // `active` (`draft -> cancelled` e `active -> cancelled` sao ambas transicoes legitimas).
    // Isso significa que ambos [200, 409] (cancel venceu o lock primeiro, sobre `draft`) e
    // [200, 200] (activate venceu o lock primeiro, e o cancel concorrente re-le o plano ja
    // `active` e cancela a partir dali -- tambem permitido) sao resultados corretos e
    // deterministicos, dependendo apenas de qual transacao adquire o `SELECT ... FOR UPDATE`
    // primeiro. O invariante real e mais forte que "um vence, um perde": cancel deve SEMPRE
    // suceder eventualmente, e o estado fisico final deve SEMPRE ser `cancelled` -- nunca
    // `active` sobrevivendo a uma tentativa de cancelamento concorrente confirmada.
    const fixture = await createActiveEmploymentFixture(database, "race-activate-cancel");
    const plan = await createPlan(fixture).expect(201);
    const [activateResponse, cancelResponse] = await Promise.all([
      planAction(fixture, plan.body.id, "activate", `act-${crypto.randomUUID()}`),
      planAction(fixture, plan.body.id, "cancel", `can-${crypto.randomUUID()}`, {
        reason: "Cancelamento concorrente."
      })
    ]);

    expect(cancelResponse.status).toBe(200);
    expect([200, 409]).toContain(activateResponse.status);

    const planRow = await database.pool.query(
      "SELECT status FROM development_plans WHERE id = $1",
      [plan.body.id]
    );
    expect(planRow.rows[0].status).toBe("cancelled");
  });

  it("complete plan x add goal concorrente: nunca coexistem goal aberto e plano completed", async () => {
    const fixture = await createActiveEmploymentFixture(database, "race-complete-goal");
    const plan = await createPlan(fixture).expect(201);
    await planAction(fixture, plan.body.id, "activate").expect(200);

    const responses = await Promise.all([
      planAction(fixture, plan.body.id, "complete", `complete-${crypto.randomUUID()}`),
      createGoal(fixture, plan.body.id, `goal-${crypto.randomUUID()}`)
    ]);
    expect([200, 409]).toContain(responses[0].status);
    expect([201, 409]).toContain(responses[1].status);

    const planRow = await database.pool.query(
      "SELECT status FROM development_plans WHERE id = $1",
      [plan.body.id]
    );
    if (planRow.rows[0].status === "completed") {
      const openGoals = await database.pool.query(
        "SELECT COUNT(*)::int AS count FROM development_goals WHERE development_plan_id = $1 AND status = 'open'",
        [plan.body.id]
      );
      expect(openGoals.rows[0].count).toBe(0);
    }
  });

  it("resolve x cancel concern concorrente: uma transicao vence, a outra recebe conflito seguro", async () => {
    const fixture = await createActiveEmploymentFixture(database, "race-resolve-cancel");
    const concern = await createConcern(fixture).expect(201);
    const responses = await Promise.all([
      request(fixture.app)
        .post(
          `/api/organizations/${fixture.organizationId}/retention-concerns/${concern.body.id}/resolve`
        )
        .set(userHeaders(fixture.ownerId))
        .set("Idempotency-Key", `resolve-${crypto.randomUUID()}`)
        .send({ resolutionSummary: "Resolvido." }),
      request(fixture.app)
        .post(
          `/api/organizations/${fixture.organizationId}/retention-concerns/${concern.body.id}/cancel`
        )
        .set(userHeaders(fixture.ownerId))
        .set("Idempotency-Key", `cancel-${crypto.randomUUID()}`)
        .send({ reason: "Cancelado." })
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it("falha de auditoria critica reverte a criacao do plano inteira", async () => {
    const fixture = await createActiveEmploymentFixture(database, "audit-rollback");
    const key = `audit-fail-${crypto.randomUUID()}`;
    await database.pool.query(`
      CREATE OR REPLACE FUNCTION fail_development_plan_created_audit()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.action = 'development_plan.created' THEN
          RAISE EXCEPTION 'simulated_audit_failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await database.pool.query(`
      CREATE TRIGGER trg_fail_development_plan_created_audit
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_development_plan_created_audit();
    `);
    try {
      await createPlan(fixture, key).expect(500);
    } finally {
      await database.pool.query(
        "DROP TRIGGER IF EXISTS trg_fail_development_plan_created_audit ON audit_events"
      );
    }

    const counts = await database.pool.query(
      `
        SELECT
          (SELECT COUNT(*)::int FROM development_plans WHERE organization_id = $1) AS plans,
          (SELECT status FROM development_retention_idempotency_keys WHERE organization_id = $1 LIMIT 1)
            AS idem_status
      `,
      [fixture.organizationId]
    );
    expect(counts.rows[0].plans).toBe(0);
    expect(counts.rows[0].idem_status).toBe("failed");
  });

  it("bloqueia mass assignment e FK fisica cross-tenant", async () => {
    const fixture = await createActiveEmploymentFixture(database, "mass-assignment");
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/development-plans`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        title: "Tentativa com campos protegidos",
        status: "active",
        organizationId: "org_forged",
        createdByMembershipId: "mem_forged"
      })
      .expect(400);

    // SPEC-017 s28: development_retention.mass_assignment_denied e evento obrigatorio.
    const auditEvents = await database.pool.query(
      `
        SELECT COUNT(*)::int AS count FROM audit_events
        WHERE organization_id = $1 AND action = 'development_retention.mass_assignment_denied'
      `,
      [fixture.organizationId]
    );
    expect(auditEvents.rows[0].count).toBeGreaterThanOrEqual(1);

    const other = await createActiveEmploymentFixture(database, "physical-cross-tenant");
    const otherPlan = await createPlan(other).expect(201);
    await expect(
      database.pool.query(
        `
          INSERT INTO development_plans (
            id, organization_id, employment_id, title, status, created_by_membership_id
          )
          SELECT $1, $2, $3, 'cross tenant bruto', 'draft', m.id
          FROM memberships m WHERE m.organization_id = $2 LIMIT 1
        `,
        [`devplan_${crypto.randomUUID()}`, fixture.organizationId, other.employmentId]
      )
    ).rejects.toThrow();
    void otherPlan;
  });

  it("bloqueia IDOR de plano e de employment entre tenants", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idor-a");
    const other = await createActiveEmploymentFixture(database, "idor-b");
    const otherPlan = await createPlan(other).expect(201);

    await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/development-plans/${otherPlan.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(404);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${other.employmentId}/development-plans`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ title: "Tentativa cross-tenant" })
      .expect(404);
  });

  it("RetentionAction com Concern de outro Employment e recusada", async () => {
    const fixture = await createActiveEmploymentFixture(database, "action-concern-mismatch");
    const other = await createActiveEmploymentFixture(database, "action-concern-mismatch-other");
    const otherConcern = await createConcern(other).expect(201);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/retention-actions`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        actionType: "conversation",
        description: "x",
        retentionConcernId: otherConcern.body.id
      })
      .expect(404);
  });
});
