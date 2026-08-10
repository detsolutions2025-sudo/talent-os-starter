import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  applicationPayload,
  createApp,
  createPublicJobOpeningFixture,
  submitApplication,
  userHeaders
} from "./helpers";

// SPEC-020 v1.1, secao 14 -- matriz completa de reaplicacao publica por status anterior.
describe("Fase 17 - Candidatura Publica - reaplicacao (SPEC-020 v1.1, secao 14)", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  beforeEach(() => {
    app = createApp(database);
  });

  afterAll(async () => {
    await database.cleanup();
  });

  async function firstApplication(suffix: string) {
    const fixture = await createPublicJobOpeningFixture(app, suffix);
    const email = `${crypto.randomUUID()}@example.com`;
    await submitApplication(app, fixture.slug, applicationPayload({ email })).expect(201);
    const applicationRow = await database.pool.query(
      "SELECT id FROM candidate_applications WHERE organization_id = $1",
      [fixture.organizationId]
    );
    return { fixture, email, applicationId: applicationRow.rows[0].id as string };
  }

  it("active: bloqueia nova candidatura (duplicidade)", async () => {
    const { fixture, email } = await firstApplication("reapp-active");
    const response = await submitApplication(app, fixture.slug, applicationPayload({ email }));
    expect(response.status).toBe(409);
  });

  it("withdrawn: permite nova candidatura, com novo id e novo historico", async () => {
    const { fixture, email, applicationId } = await firstApplication("reapp-withdrawn");
    await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/withdraw`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Candidato desistiu." })
      .expect(200);

    const response = await submitApplication(app, fixture.slug, applicationPayload({ email }));
    expect(response.status).toBe(201);

    const applications = await database.pool.query(
      "SELECT id, application_status FROM candidate_applications WHERE organization_id = $1 ORDER BY applied_at",
      [fixture.organizationId]
    );
    expect(applications.rows).toHaveLength(2);
    expect(applications.rows[0].id).toBe(applicationId);
    expect(applications.rows[0].application_status).toBe("withdrawn");
    expect(applications.rows[1].id).not.toBe(applicationId);
    expect(applications.rows[1].application_status).toBe("active");
  });

  it("cancelled: bloqueia nesta primeira versao, de forma deterministica", async () => {
    const { fixture, email, applicationId } = await firstApplication("reapp-cancelled");
    await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/cancel`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Candidatura criada por engano, causa nao impede nova submissao." })
      .expect(200);

    const response = await submitApplication(app, fixture.slug, applicationPayload({ email }));
    expect(response.status).toBe(409);

    const applications = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(applications.rows[0].count).toBe(1);
  });

  it("rejected: bloqueia nesta primeira versao", async () => {
    const { fixture, email, applicationId } = await firstApplication("reapp-rejected");
    await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/reject`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Perfil nao atende aos requisitos." })
      .expect(200);

    const response = await submitApplication(app, fixture.slug, applicationPayload({ email }));
    expect(response.status).toBe(409);

    const applications = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(applications.rows[0].count).toBe(1);
  });

  it("hired: bloqueia", async () => {
    const { fixture, email, applicationId } = await firstApplication("reapp-hired");
    await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/hire`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Candidato aprovado." })
      .expect(200);

    const response = await submitApplication(app, fixture.slug, applicationPayload({ email }));
    expect(response.status).toBe(409);

    const applications = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(applications.rows[0].count).toBe(1);
  });

  it("candidatura historica permanece intacta apos qualquer tentativa de reaplicacao", async () => {
    const { fixture, email, applicationId } = await firstApplication("reapp-immutable");
    await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/reject`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Nao selecionado." })
      .expect(200);
    await submitApplication(app, fixture.slug, applicationPayload({ email }));

    const original = await database.pool.query(
      "SELECT application_status, finalization_reason FROM candidate_applications WHERE id = $1",
      [applicationId]
    );
    expect(original.rows[0].application_status).toBe("rejected");
    expect(original.rows[0].finalization_reason).toBe("Nao selecionado.");
  });

  it("resposta publica de bloqueio de reaplicacao e identica para active, cancelled, rejected e hired (protecao contra enumeracao)", async () => {
    const active = await firstApplication("reapp-enum-active");
    const activeResponse = await submitApplication(
      app,
      active.fixture.slug,
      applicationPayload({ email: active.email })
    );

    const rejected = await firstApplication("reapp-enum-rejected");
    await request(app)
      .post(
        `/api/organizations/${rejected.fixture.organizationId}/candidate-applications/${rejected.applicationId}/reject`
      )
      .set(userHeaders(rejected.fixture.ownerId))
      .send({ reason: "Nao selecionado." })
      .expect(200);
    const rejectedResponse = await submitApplication(
      app,
      rejected.fixture.slug,
      applicationPayload({ email: rejected.email })
    );

    expect(activeResponse.status).toBe(rejectedResponse.status);
    expect(activeResponse.body.error.code).toBe(rejectedResponse.body.error.code);
    expect(activeResponse.body.error.message).toBe(rejectedResponse.body.error.message);
  });
});
