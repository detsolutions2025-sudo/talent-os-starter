import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createAdministrativeApplication,
  createFullApp,
  createOrganizationWithPublicJobOpeningFixture,
  userHeaders
} from "./helpers";

// Fase 33 (E2E + Estabilizacao minima) -- cenario D. Caminho critico de ciclo de vida de
// pessoas: candidatura contratada -> Onboarding (SPEC-016, Fase 23) criado, iniciado e
// concluido, atravessando HTTP real -> RBAC (owner/admin) -> services -> Postgres real, com
// verificacao de estado persistido em cada transicao.
describe("E2E - Ciclo de vida de pessoas (contratacao -> Onboarding)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("cria, inicia e conclui um Onboarding a partir de uma candidatura contratada", async () => {
    const app = createFullApp(database);
    const fixture = await createOrganizationWithPublicJobOpeningFixture(app, "lifecycle-e2e");
    const applicationId = await createAdministrativeApplication(app, fixture);

    await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/hire`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Contratado, inicia onboarding." })
      .expect(200);

    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/onboarding`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ expectedPersonStartDate: "2026-02-01" })
      .expect(201);
    expect(created.body).toMatchObject({ status: "draft", candidateApplicationId: applicationId });
    const onboardingId = created.body.id as string;

    const started = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/onboardings/${onboardingId}/start`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(200);
    expect(started.body.status).toBe("in_progress");
    expect(started.body.startedAt).toBeTruthy();

    const completed = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/onboardings/${onboardingId}/complete`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(200);
    expect(completed.body.status).toBe("completed");

    // Estado persistido, lido diretamente do Postgres.
    const persisted = await database.pool.query(
      "SELECT status, started_at, completed_at FROM onboardings WHERE id = $1",
      [onboardingId]
    );
    expect(persisted.rows[0].status).toBe("completed");
    expect(persisted.rows[0].started_at).not.toBeNull();
    expect(persisted.rows[0].completed_at).not.toBeNull();
  });

  it("um Member (sem owner/admin) nao pode criar Onboarding -- RBAC real aplicado dentro do dominio", async () => {
    const app = createFullApp(database);
    const fixture = await createOrganizationWithPublicJobOpeningFixture(app, "lifecycle-e2e-rbac");
    const applicationId = await createAdministrativeApplication(app, fixture);
    await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/hire`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Contratado." })
      .expect(200);

    const memberUser = await request(app)
      .post("/api/dev/users")
      .set({ "x-dev-platform-admin": "true" })
      .send({
        name: "member-lifecycle",
        email: `member-lifecycle-${crypto.randomUUID()}@example.com`
      })
      .expect(201);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/memberships`)
      .set(userHeaders(fixture.ownerId))
      .send({ organizationId: fixture.organizationId, userId: memberUser.body.id, role: "member" })
      .expect(201);

    const response = await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/onboarding`
      )
      .set(userHeaders(memberUser.body.id))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({});

    expect(response.status).toBe(403);
  });
});
