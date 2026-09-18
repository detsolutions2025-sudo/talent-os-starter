import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createAdministrativeApplication,
  createFullApp,
  createOrganizationWithPublicJobOpeningFixture,
  userHeaders
} from "./helpers";

// Fase 33 (E2E + Estabilizacao minima) -- cenario B. Caminho critico de recrutamento de ponta a
// ponta: Vaga -> Candidatura -> processo seletivo (mudanca real de estagio) -> contratacao,
// atravessando HTTP real (parsing, dev-auth, RBAC via authorize(), services, Postgres real) e
// verificando tanto a resposta HTTP quanto o estado persistido (nunca so o status code).
describe("E2E - Recrutamento (vaga -> candidatura -> processo seletivo -> contratacao)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("avanca uma candidatura por applied -> screening -> interview -> hired, persistindo cada transicao", async () => {
    const app = createFullApp(database);
    const fixture = await createOrganizationWithPublicJobOpeningFixture(app, "recruit-e2e");
    const applicationId = await createAdministrativeApplication(app, fixture);

    // Estado inicial real, lido de volta via HTTP (nunca assumido).
    const initial = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(initial.body).toMatchObject({ applicationStatus: "active", currentStage: "applied" });

    // Processo seletivo real: duas transicoes de estagio via o mesmo endpoint que o produto usa.
    const toScreening = await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/stage`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ currentStage: "screening" })
      .expect(200);
    expect(toScreening.body.currentStage).toBe("screening");

    const toInterview = await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/stage`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ currentStage: "interview" })
      .expect(200);
    expect(toInterview.body.currentStage).toBe("interview");

    // Contratacao: transicao final de status, nao apenas de estagio.
    const hired = await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/hire`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Aprovado no processo seletivo E2E." })
      .expect(200);
    expect(hired.body.applicationStatus).toBe("hired");

    // Estado persistido: lido diretamente do Postgres, nao apenas confiado na resposta HTTP.
    const persisted = await database.pool.query(
      "SELECT application_status, current_stage, finalized_at FROM candidate_applications WHERE id = $1",
      [applicationId]
    );
    expect(persisted.rows[0].application_status).toBe("hired");
    expect(persisted.rows[0].current_stage).toBe("interview");
    expect(persisted.rows[0].finalized_at).not.toBeNull();

    // Trilha de auditoria real: cada transicao de estagio e a contratacao geraram evento.
    const events = await request(app)
      .get(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/events`
      )
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    const eventTypes = (events.body as Array<{ eventType: string }>).map((e) => e.eventType);
    expect(eventTypes).toContain("stage_changed");
    expect(eventTypes).toContain("hired");
  });

  it("uma candidatura ja contratada nao pode ser contratada de novo (invariante de status final)", async () => {
    const app = createFullApp(database);
    const fixture = await createOrganizationWithPublicJobOpeningFixture(app, "recruit-e2e-dup");
    const applicationId = await createAdministrativeApplication(app, fixture);

    await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/hire`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Primeira contratacao." })
      .expect(200);

    const secondHire = await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/hire`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Segunda tentativa, deve falhar." });

    expect(secondHire.status).toBeGreaterThanOrEqual(400);
    expect(secondHire.status).toBeLessThan(500);
  });
});
