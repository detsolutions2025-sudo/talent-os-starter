import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  applicationPayload,
  createFullApp,
  createOrganizationWithPublicJobOpeningFixture,
  submitPublicApplication,
  userHeaders
} from "./helpers";

// Fase 33 (E2E + Estabilizacao minima) -- cenario C. Caminho critico publico: vaga publica ->
// candidatura publica, SEM nenhuma autenticacao (a Organization e sempre derivada do slug,
// nunca aceita do cliente -- SPEC-020) -- atravessando HTTP real, parsing, o rate limiter
// publico ja migrado para store distribuido (Fase 32), persistencia real de Candidate +
// CandidateApplication, e visivel de volta pelo lado administrativo da MESMA Organization.
describe("E2E - Fluxo publico (vaga publica -> candidatura publica, sem autenticacao)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("candidato anonimo se candidata a uma vaga publica e a candidatura fica visivel para a Organization correta", async () => {
    const app = createFullApp(database);
    const fixture = await createOrganizationWithPublicJobOpeningFixture(app, "public-e2e");
    const payload = applicationPayload();

    const response = await submitPublicApplication(app, fixture.slug, payload).expect(201);
    expect(response.body).toMatchObject({ status: "received" });
    expect(response.body.submissionId).toBeTruthy();
    // DTO publico nunca expoe candidateApplicationId (SPEC-020 s25) -- nenhum identificador
    // interno de negocio deve vazar na resposta ao candidato anonimo.
    expect(response.body.candidateApplicationId).toBeUndefined();

    // Visivel do lado administrativo, na Organization correta -- persistencia real, nao so a
    // resposta HTTP do candidato.
    const list = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/candidate-applications`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    const applications = list.body as Array<{ id: string; source: string }>;
    expect(applications.length).toBe(1);
    expect(applications[0].source).toBe("public_portal");

    const persisted = await database.pool.query(
      "SELECT full_name, email FROM candidates WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(persisted.rows[0].full_name).toBe(payload.fullName);
    expect(persisted.rows[0].email).toBe(payload.email.toLowerCase());
  });

  it("candidatura publica para uma vaga inexistente/nao publicada recebe 404 generico, nunca 500", async () => {
    const app = createFullApp(database);
    const response = await submitPublicApplication(
      app,
      "slug-que-nao-existe-e2e",
      applicationPayload()
    );
    expect(response.status).toBe(404);
  });

  it("candidatura publica exige consentimento explicito (nao aceita payload sem consent)", async () => {
    const app = createFullApp(database);
    const fixture = await createOrganizationWithPublicJobOpeningFixture(app, "public-e2e-consent");
    const payload = applicationPayload({ consent: { granted: false, termsVersion: "1.0" } });

    const response = await submitPublicApplication(app, fixture.slug, payload);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});
