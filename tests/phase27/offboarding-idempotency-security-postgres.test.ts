import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addTask,
  createActiveEmploymentFixture,
  createOffboarding,
  taskAction,
  userHeaders
} from "./helpers";

describe("Fase 27 - Offboarding idempotencia, concorrencia e seguranca", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  // ---------------------------------------------------------------------------------------
  // GATE CRITICO P-02: as 8 operacoes exigem Idempotency-Key e sao idempotentes -- diferente
  // do precedente de Onboarding, que nao exige chave para as 4 operacoes de task.
  // ---------------------------------------------------------------------------------------
  it("GATE P-02: as 8 operacoes exigem Idempotency-Key", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-key-required");

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/offboardings`
      )
      .set(userHeaders(fixture.ownerId))
      .send({})
      .expect(400);

    const created = await createOffboarding(fixture).expect(201);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/offboardings/${created.body.id}/start`)
      .set(userHeaders(fixture.ownerId))
      .send({})
      .expect(400);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/offboardings/${created.body.id}/tasks`)
      .set(userHeaders(fixture.ownerId))
      .send({ title: "x" })
      .expect(400);

    const task = await addTask(fixture, created.body.id).expect(201);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/offboarding-tasks/${task.body.id}/assign`)
      .set(userHeaders(fixture.ownerId))
      .send({ assigneeMembershipId: "irrelevant" })
      .expect(400);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/offboarding-tasks/${task.body.id}/complete`
      )
      .set(userHeaders(fixture.ownerId))
      .send({})
      .expect(400);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/offboarding-tasks/${task.body.id}/cancel`)
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "x" })
      .expect(400);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/offboardings/${created.body.id}/complete`)
      .set(userHeaders(fixture.ownerId))
      .send({})
      .expect(400);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/offboardings/${created.body.id}/cancel`)
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "x" })
      .expect(400);
  });

  it("retry idempotente de create retorna o mesmo recurso", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-create-retry");
    const key = crypto.randomUUID();
    const first = await createOffboarding(fixture, key, { exitCategory: "end_of_contract" }).expect(
      201
    );
    const second = await createOffboarding(fixture, key, {
      exitCategory: "end_of_contract"
    }).expect(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it("mesma chave com fingerprint divergente gera conflito seguro", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-fingerprint-conflict");
    const key = crypto.randomUUID();
    await createOffboarding(fixture, key, { exitCategory: "end_of_contract" }).expect(201);
    await createOffboarding(fixture, key, { exitCategory: "mutual_agreement" }).expect(409);
  });

  it("retry idempotente das 4 operacoes de task retorna o mesmo resultado", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-task-ops");
    const created = await createOffboarding(fixture).expect(201);

    const taskKey = crypto.randomUUID();
    const taskA = await addTask(fixture, created.body.id, taskKey, { title: "Repetida" }).expect(
      201
    );
    const taskB = await addTask(fixture, created.body.id, taskKey, { title: "Repetida" }).expect(
      201
    );
    expect(taskB.body.id).toBe(taskA.body.id);

    const membershipResponse = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/memberships`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    const ownerMembershipId = membershipResponse.body.find(
      (membership: { userId: string }) => membership.userId === fixture.ownerId
    ).id;

    const assignKey = crypto.randomUUID();
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/offboarding-tasks/${taskA.body.id}/assign`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", assignKey)
      .send({ assigneeMembershipId: ownerMembershipId })
      .expect(200);
    const secondAssign = await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/offboarding-tasks/${taskA.body.id}/assign`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", assignKey)
      .send({ assigneeMembershipId: ownerMembershipId })
      .expect(200);
    expect(secondAssign.body.assigneeMembershipId).toBe(ownerMembershipId);

    const completeKey = crypto.randomUUID();
    await taskAction(fixture, taskA.body.id, "complete", completeKey).expect(200);
    const secondComplete = await taskAction(fixture, taskA.body.id, "complete", completeKey).expect(
      200
    );
    expect(secondComplete.body.status).toBe("completed");
  });

  // ---------------------------------------------------------------------------------------
  // Concorrencia
  // ---------------------------------------------------------------------------------------
  it("create x create concorrente para o mesmo Employment produz no maximo um nao-final", async () => {
    const fixture = await createActiveEmploymentFixture(database, "concurrency-create");
    const results = await Promise.allSettled([
      createOffboarding(fixture, crypto.randomUUID()),
      createOffboarding(fixture, crypto.randomUUID())
    ]);
    const succeeded = results.filter(
      (result) => result.status === "fulfilled" && result.value.status === 201
    );
    expect(succeeded.length).toBe(1);

    const rows = await database.pool.query(
      "SELECT COUNT(*) AS count FROM offboardings WHERE employment_id = $1 AND status IN ('draft', 'in_progress')",
      [fixture.employmentId]
    );
    expect(Number(rows.rows[0].count)).toBe(1);
  });

  it("complete x cancel concorrente da mesma task e deterministico", async () => {
    const fixture = await createActiveEmploymentFixture(database, "concurrency-task");
    const created = await createOffboarding(fixture).expect(201);
    const task = await addTask(fixture, created.body.id, crypto.randomUUID(), {
      isRequired: false
    }).expect(201);

    const results = await Promise.allSettled([
      taskAction(fixture, task.body.id, "complete", crypto.randomUUID()),
      taskAction(fixture, task.body.id, "cancel", crypto.randomUUID(), { reason: "Race." })
    ]);
    const statuses = results.map((result) =>
      result.status === "fulfilled" ? result.value.status : 0
    );
    expect(statuses.filter((status) => status === 200).length).toBe(1);

    const row = await database.pool.query("SELECT status FROM offboarding_tasks WHERE id = $1", [
      task.body.id
    ]);
    expect(["completed", "cancelled"]).toContain(row.rows[0].status);
  });

  it("Employment.end concorrente com create Offboarding nao gera conflito por si so", async () => {
    const fixture = await createActiveEmploymentFixture(database, "concurrency-end-create");
    const [endResult, createResult] = await Promise.allSettled([
      request(fixture.app)
        .post(
          `/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/end`
        )
        .set(userHeaders(fixture.ownerId))
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ endDate: "2026-06-01", reason: "Fim para teste de concorrencia." }),
      createOffboarding(fixture, crypto.randomUUID())
    ]);
    // ambos active/ended sao elegiveis -- create nunca falha apenas por causa do end() concorrente.
    expect(endResult.status === "fulfilled" && endResult.value.status).toBe(200);
    expect(createResult.status === "fulfilled" && createResult.value.status).toBe(201);
  });

  // ---------------------------------------------------------------------------------------
  // Multiempresa, IDOR, mass assignment
  // ---------------------------------------------------------------------------------------
  it("bloqueia cross-tenant: Employment de outra Organization nao cria Offboarding", async () => {
    const fixtureA = await createActiveEmploymentFixture(database, "tenant-a");
    const fixtureB = await createActiveEmploymentFixture(database, "tenant-b");

    await request(fixtureA.app)
      .post(
        `/api/organizations/${fixtureA.organizationId}/employments/${fixtureB.employmentId}/offboardings`
      )
      .set(userHeaders(fixtureA.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(404);
  });

  it("bloqueia IDOR de Offboarding e OffboardingTask entre Organizations", async () => {
    const fixtureA = await createActiveEmploymentFixture(database, "idor-a");
    const fixtureB = await createActiveEmploymentFixture(database, "idor-b");
    const createdA = await createOffboarding(fixtureA).expect(201);
    const taskA = await addTask(fixtureA, createdA.body.id).expect(201);

    await request(fixtureB.app)
      .get(`/api/organizations/${fixtureB.organizationId}/offboardings/${createdA.body.id}`)
      .set(userHeaders(fixtureB.ownerId))
      .expect(404);

    await request(fixtureB.app)
      .post(
        `/api/organizations/${fixtureB.organizationId}/offboarding-tasks/${taskA.body.id}/complete`
      )
      .set(userHeaders(fixtureB.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(404);
  });

  it("bloqueia assignee Membership de outra Organization", async () => {
    const fixtureA = await createActiveEmploymentFixture(database, "cross-membership-a");
    const fixtureB = await createActiveEmploymentFixture(database, "cross-membership-b");
    const created = await createOffboarding(fixtureA).expect(201);

    const membershipsB = await request(fixtureB.app)
      .get(`/api/organizations/${fixtureB.organizationId}/memberships`)
      .set(userHeaders(fixtureB.ownerId))
      .expect(200);
    const foreignMembershipId = membershipsB.body[0].id as string;

    await addTask(fixtureA, created.body.id, crypto.randomUUID(), {
      assigneeMembershipId: foreignMembershipId
    }).expect(409);
  });

  it("bloqueia mass assignment de organization_id/status/autoria via payload", async () => {
    const fixture = await createActiveEmploymentFixture(database, "mass-assignment");
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/offboardings`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        status: "completed",
        organizationId: "outra-organizacao",
        createdByUserId: "outro-user"
      })
      .expect(400);
  });

  it("bloqueia exit_category fora do enum fechado", async () => {
    const fixture = await createActiveEmploymentFixture(database, "exit-category-invalid");
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/offboardings`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ exitCategory: "performance_termination_score" })
      .expect(400);
  });

  it("rejeita campos de PII proibida no payload de criacao e de task", async () => {
    const fixture = await createActiveEmploymentFixture(database, "privacy-forbidden-fields");
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/offboardings`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ cpf: "000.000.000-00" })
      .expect(400);

    const created = await createOffboarding(fixture).expect(201);
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/offboardings/${created.body.id}/tasks`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ title: "x", bankAccount: "123456" })
      .expect(400);
  });

  it("auditoria nao registra PII: eventos de Offboarding contem apenas identificadores", async () => {
    const fixture = await createActiveEmploymentFixture(database, "audit-no-pii");
    const created = await createOffboarding(fixture, crypto.randomUUID(), {
      exitCategory: "voluntary_resignation"
    }).expect(201);

    const events = await database.pool.query(
      "SELECT metadata FROM audit_events WHERE action = 'offboarding.created' AND organization_id = $1",
      [fixture.organizationId]
    );
    expect(events.rowCount).toBeGreaterThan(0);
    for (const row of events.rows) {
      const metadata = JSON.stringify(row.metadata);
      expect(metadata).not.toMatch(/voluntary_resignation/);
      expect(metadata).not.toContain(created.body.exitCategory);
    }
  });
});
