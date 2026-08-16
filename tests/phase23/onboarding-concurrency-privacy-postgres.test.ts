import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  createHiredFixture,
  createOnboarding,
  startOnboarding,
  userHeaders
} from "./helpers";

describe("Fase 23 - Onboarding concorrencia, audit e escopo negativo", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("create concorrente preserva um unico Onboarding por candidatura", async () => {
    const fixture = await createHiredFixture(database, "create-race");
    const [a, b] = await Promise.allSettled([
      createOnboarding(fixture, crypto.randomUUID()),
      createOnboarding(fixture, crypto.randomUUID())
    ]);
    const statuses = [a, b].map((item) => (item.status === "fulfilled" ? item.value.status : 500));
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(
      statuses.filter((status) => status === 409 || status === 500).length
    ).toBeGreaterThanOrEqual(1);

    const count = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM onboardings WHERE candidate_application_id = $1",
      [fixture.applicationId]
    );
    expect(count.rows[0].count).toBe(1);
  });

  it("complete Onboarding x add required produz resultado deterministico", async () => {
    const fixture = await createHiredFixture(database, "complete-add");
    const created = await createOnboarding(fixture).expect(201);
    await startOnboarding(fixture, created.body.id).expect(200);
    const [complete, add] = await Promise.allSettled([
      request(fixture.app)
        .post(
          `/api/organizations/${fixture.organizationId}/onboardings/${created.body.id}/complete`
        )
        .set(userHeaders(fixture.ownerId))
        .set("Idempotency-Key", crypto.randomUUID())
        .send({}),
      request(fixture.app)
        .post(`/api/organizations/${fixture.organizationId}/onboardings/${created.body.id}/tasks`)
        .set(userHeaders(fixture.ownerId))
        .send({ title: "Obrigatoria tardia", isRequired: true, creationReason: "Ajuste." })
    ]);
    const statuses = [complete, add].map((item) =>
      item.status === "fulfilled" ? item.value.status : 500
    );
    expect(statuses.some((status) => status >= 200 && status < 300)).toBe(true);
    expect(statuses.every((status) => status !== 500)).toBe(true);
  });

  it("reassign x complete task respeita lock e autoria real", async () => {
    const fixture = await createHiredFixture(database, "task-race");
    const first = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "first"
    );
    const second = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "second"
    );
    const created = await createOnboarding(fixture).expect(201);
    const task = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/onboardings/${created.body.id}/tasks`)
      .set(userHeaders(fixture.ownerId))
      .send({ title: "Concorrente", assigneeMembershipId: first.membershipId })
      .expect(201);

    const [complete, reassign] = await Promise.allSettled([
      request(fixture.app)
        .post(
          `/api/organizations/${fixture.organizationId}/onboarding-tasks/${task.body.id}/complete`
        )
        .set(userHeaders(first.userId))
        .send({}),
      request(fixture.app)
        .patch(
          `/api/organizations/${fixture.organizationId}/onboarding-tasks/${task.body.id}/assignment`
        )
        .set(userHeaders(fixture.ownerId))
        .send({ assigneeMembershipId: second.membershipId })
    ]);
    const statuses = [complete, reassign].map((item) =>
      item.status === "fulfilled" ? item.value.status : 500
    );
    expect(statuses.every((status) => status !== 500)).toBe(true);
  });

  it("nao cria IA, User/Membership automatico, Employee ou documentos e audita sem PII", async () => {
    const fixture = await createHiredFixture(database, "zero-future");
    const before = await database.pool.query(
      `
        SELECT
          (SELECT COUNT(*)::int FROM ai_executions) AS ai,
          (SELECT COUNT(*)::int FROM users) AS users,
          (SELECT COUNT(*)::int FROM memberships) AS memberships
      `
    );
    const created = await createOnboarding(fixture).expect(201);
    const after = await database.pool.query(
      `
        SELECT
          (SELECT COUNT(*)::int FROM ai_executions) AS ai,
          (SELECT COUNT(*)::int FROM users) AS users,
          (SELECT COUNT(*)::int FROM memberships) AS memberships,
          (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = $1 AND table_name ILIKE '%employee%') AS employee_tables,
          (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = $1 AND table_name ILIKE '%document%') AS document_tables
      `,
      [database.schema]
    );
    expect(after.rows[0].ai).toBe(before.rows[0].ai);
    expect(after.rows[0].users).toBe(before.rows[0].users);
    expect(after.rows[0].memberships).toBe(before.rows[0].memberships);
    expect(after.rows[0].employee_tables).toBe(0);
    expect(after.rows[0].document_tables).toBe(0);

    const audit = await database.pool.query(
      "SELECT metadata::text AS metadata FROM audit_events WHERE metadata::text LIKE $1",
      [`%${created.body.id}%`]
    );
    expect(audit.rows.map((row) => row.metadata).join(" ")).not.toContain("@example.com");
  });
});
