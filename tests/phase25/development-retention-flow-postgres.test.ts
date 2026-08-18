import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  createActiveEmploymentFixture,
  createAction,
  createConcern,
  createGoal,
  createPlan,
  planAction,
  userHeaders
} from "./helpers";

describe("Fase 25 - Desenvolvimento e Retencao fluxo", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("cria plano somente com Employment active; ciclo completo draft->active->completed", async () => {
    const fixture = await createActiveEmploymentFixture(database, "plan-lifecycle");
    const created = await createPlan(fixture).expect(201);
    expect(created.body.status).toBe("draft");

    const goal = await createGoal(fixture, created.body.id).expect(201);
    expect(goal.body.status).toBe("open");

    // completar o plano com goal aberto deve falhar
    await planAction(fixture, created.body.id, "complete").expect(409);

    await planAction(fixture, created.body.id, "activate").expect(200);
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/development-goals/${goal.body.id}/complete`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(200);

    const completed = await planAction(fixture, created.body.id, "complete").expect(200);
    expect(completed.body.status).toBe("completed");

    // segundo plano nao final e bloqueado enquanto o primeiro esta ativo -- mas agora que o
    // primeiro esta completed, um segundo pode ser criado.
    const second = await createPlan(fixture, crypto.randomUUID(), {
      title: "Segundo plano"
    }).expect(201);
    expect(second.body.id).not.toBe(created.body.id);
  });

  it("bloqueia segundo plano nao final enquanto o primeiro esta draft/active", async () => {
    const fixture = await createActiveEmploymentFixture(database, "plan-one-non-final");
    await createPlan(fixture).expect(201);
    await createPlan(fixture, crypto.randomUUID(), { title: "Outro" }).expect(409);
  });

  it("bloqueia criacao de plano quando Employment nao esta active", async () => {
    const fixture = await createActiveEmploymentFixture(database, "plan-employment-not-active");
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/end`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ endDate: "2026-12-01", reason: "Fim do contrato." })
      .expect(200);

    await createPlan(fixture, crypto.randomUUID(), { title: "Depois do fim" }).expect(409);
  });

  it("Employment ended fecha DevelopmentPlan nao final como closed_due_to_employment_end", async () => {
    const fixture = await createActiveEmploymentFixture(database, "plan-employment-end-reconcile");
    const plan = await createPlan(fixture).expect(201);
    await planAction(fixture, plan.body.id, "activate").expect(200);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/end`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ endDate: "2026-12-01", reason: "Fim do contrato." })
      .expect(200);

    const row = await database.pool.query("SELECT status FROM development_plans WHERE id = $1", [
      plan.body.id
    ]);
    expect(row.rows[0].status).toBe("closed_due_to_employment_end");

    const auditEvent = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM audit_events WHERE action = 'development_plan.closed_due_to_employment_end'"
    );
    expect(auditEvent.rows[0].count).toBeGreaterThanOrEqual(1);
  });

  it("RBAC: member sem autorizacao e bloqueado; assignee explicito do plano pode criar goal/check-in", async () => {
    const fixture = await createActiveEmploymentFixture(database, "rbac-member");
    const outsider = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "rbac-outsider"
    );
    const assignee = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "rbac-assignee"
    );
    const plan = await createPlan(fixture, crypto.randomUUID(), {
      assigneeMembershipId: assignee.membershipId
    }).expect(201);
    await planAction(fixture, plan.body.id, "activate").expect(200);

    // member fora do plano nunca pode
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/development-plans/${plan.body.id}/goals`)
      .set(userHeaders(outsider.userId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ title: "Goal indevido" })
      .expect(403);

    // assignee explicito pode criar goal e check-in
    const goal = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/development-plans/${plan.body.id}/goals`)
      .set(userHeaders(assignee.userId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ title: "Goal do assignee" })
      .expect(201);
    expect(goal.body.status).toBe("open");

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/development-plans/${plan.body.id}/check-ins`
      )
      .set(userHeaders(assignee.userId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ summary: "Check-in do assignee.", visibility: "owner_admin_and_assignee" })
      .expect(201);

    // member nunca cria concern/action, mesmo sendo o assignee do plano
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/retention-concerns`
      )
      .set(userHeaders(assignee.userId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        source: "human_observation",
        category: "career_growth",
        description: "x",
        visibility: "owner_admin_only"
      })
      .expect(403);
  });

  it("RetentionConcern e RetentionAction: fluxo completo, action pode existir sem concern", async () => {
    const fixture = await createActiveEmploymentFixture(database, "retention-flow");
    const concern = await createConcern(fixture).expect(201);
    expect(concern.body.status).toBe("open");

    const actionWithConcern = await createAction(fixture, crypto.randomUUID(), {
      retentionConcernId: concern.body.id
    }).expect(201);
    expect(actionWithConcern.body.retentionConcernId).toBe(concern.body.id);

    const actionWithoutConcern = await createAction(fixture).expect(201);
    expect(actionWithoutConcern.body.retentionConcernId).toBeNull();

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/retention-actions/${actionWithoutConcern.body.id}/complete`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(200);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/retention-concerns/${concern.body.id}/resolve`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ resolutionSummary: "Conversa resolveu a situacao." })
      .expect(200);
  });

  it("Organization archived bloqueia mutacao mas preserva leitura historica", async () => {
    const fixture = await createActiveEmploymentFixture(database, "org-archived");
    const plan = await createPlan(fixture).expect(201);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/archive`)
      .set({ "x-dev-platform-admin": "true" })
      .send({})
      .expect(200);

    await createPlan(fixture, crypto.randomUUID(), { title: "Depois do arquivamento" }).expect(403);
    await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/development-plans/${plan.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
  });

  it("zero automacao: hired/proposal/onboarding nao criam DevelopmentPlan nem RetentionConcern", async () => {
    const fixture = await createActiveEmploymentFixture(database, "zero-auto");
    const counts = await database.pool.query(
      `
        SELECT
          (SELECT COUNT(*)::int FROM development_plans WHERE organization_id = $1) AS plans,
          (SELECT COUNT(*)::int FROM retention_concerns WHERE organization_id = $1) AS concerns
      `,
      [fixture.organizationId]
    );
    expect(counts.rows[0].plans).toBe(0);
    expect(counts.rows[0].concerns).toBe(0);
  });

  it("zero IA: ai_executions permanece inalterado apos fluxo completo", async () => {
    const before = await database.pool.query("SELECT COUNT(*)::int AS count FROM ai_executions");
    const fixture = await createActiveEmploymentFixture(database, "zero-ai");
    const plan = await createPlan(fixture).expect(201);
    await planAction(fixture, plan.body.id, "activate").expect(200);
    await createGoal(fixture, plan.body.id).expect(201);
    await createConcern(fixture).expect(201);
    const after = await database.pool.query("SELECT COUNT(*)::int AS count FROM ai_executions");
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });
});
