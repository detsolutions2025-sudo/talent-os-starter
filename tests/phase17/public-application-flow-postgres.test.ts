import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addPublicJobOpeningToOrganization,
  applicationPayload,
  createApp,
  createPublicJobOpeningFixture,
  submitApplication,
  userHeaders
} from "./helpers";

describe("Fase 17 - Candidatura Publica - fluxo principal", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  // Uma nova `app` (e, com ela, um novo `PublicApplicationService`/RateLimiter em memoria) a
  // cada teste evita que o rate limit por IP (compartilhado entre chamadas supertest, que
  // sempre se originam do mesmo IP local) vaze de um teste para o outro -- mesmo padrao ja
  // usado por `tests/phase7/job-openings-postgres.test.ts`.
  beforeEach(() => {
    app = createApp(database);
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("cria Candidate novo com creation_origin publico, Consent e CandidateApplication corretos, sem User/Membership", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "flow-a");
    const usersBefore = await database.pool.query("SELECT COUNT(*)::int AS count FROM users");
    const membershipsBefore = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM memberships"
    );

    const payload = applicationPayload();
    const response = await submitApplication(app, fixture.slug, payload).expect(201);
    // Fase 18: `nextStep` e um campo aditivo novo no DTO publico (Plano Tecnico da Fase 18,
    // correcao final, item 1/23) -- `null` aqui porque esta suite da Fase 17 nao conecta
    // `preInterviews` a `createApp` (tests/phase17/helpers.ts), e nunca contem
    // `candidateApplicationId` (sempre interno, nunca serializado).
    expect(response.body).toEqual({
      status: "received",
      submissionId: expect.any(String),
      nextStep: null
    });

    const candidateRow = await database.pool.query(
      "SELECT * FROM candidates WHERE organization_id = $1 AND normalized_email = $2",
      [fixture.organizationId, String(payload.email).toLowerCase()]
    );
    expect(candidateRow.rows).toHaveLength(1);
    expect(candidateRow.rows[0].creation_origin).toBe("public_application");
    expect(candidateRow.rows[0].created_by_user_id).toBeNull();
    expect(candidateRow.rows[0].status).toBe("active");

    const consentRow = await database.pool.query(
      "SELECT * FROM candidate_consents WHERE candidate_id = $1",
      [candidateRow.rows[0].id]
    );
    expect(consentRow.rows).toHaveLength(1);
    expect(consentRow.rows[0].source).toBe("public_application");
    expect(consentRow.rows[0].created_by_user_id).toBeNull();
    expect(consentRow.rows[0].status).toBe("granted");

    const applicationRow = await database.pool.query(
      "SELECT * FROM candidate_applications WHERE candidate_id = $1",
      [candidateRow.rows[0].id]
    );
    expect(applicationRow.rows).toHaveLength(1);
    expect(applicationRow.rows[0].source).toBe("public_portal");
    expect(applicationRow.rows[0].created_by_user_id).toBeNull();
    expect(applicationRow.rows[0].application_status).toBe("active");
    expect(applicationRow.rows[0].current_stage).toBe("applied");
    expect(applicationRow.rows[0].job_opening_id).toBe(fixture.jobOpeningId);

    const eventRow = await database.pool.query(
      "SELECT * FROM candidate_application_events WHERE candidate_application_id = $1",
      [applicationRow.rows[0].id]
    );
    expect(eventRow.rows).toHaveLength(1);
    expect(eventRow.rows[0].actor_user_id).toBeNull();

    const usersAfter = await database.pool.query("SELECT COUNT(*)::int AS count FROM users");
    const membershipsAfter = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM memberships"
    );
    expect(usersAfter.rows[0].count).toBe(usersBefore.rows[0].count);
    expect(membershipsAfter.rows[0].count).toBe(membershipsBefore.rows[0].count);
  });

  it("reutiliza Candidate ativo existente ao se candidatar a uma segunda Vaga da mesma Organization", async () => {
    const fixtureA = await createPublicJobOpeningFixture(app, "flow-b1");
    const email = `${crypto.randomUUID()}@example.com`;
    await submitApplication(app, fixtureA.slug, applicationPayload({ email })).expect(201);

    const { slug: secondSlug, jobOpeningId: secondJobOpeningId } =
      await addPublicJobOpeningToOrganization(
        app,
        fixtureA.organizationId,
        fixtureA.ownerId,
        "flow-b2"
      );

    const beforeCount = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidates WHERE organization_id = $1 AND normalized_email = $2",
      [fixtureA.organizationId, email.toLowerCase()]
    );
    expect(beforeCount.rows[0].count).toBe(1);

    await submitApplication(app, secondSlug, applicationPayload({ email })).expect(201);

    const afterCount = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidates WHERE organization_id = $1 AND normalized_email = $2",
      [fixtureA.organizationId, email.toLowerCase()]
    );
    // Mesma Organization: reutiliza o mesmo Candidate, nunca duplica.
    expect(afterCount.rows[0].count).toBe(1);

    const applications = await database.pool.query(
      "SELECT job_opening_id FROM candidate_applications WHERE organization_id = $1 AND candidate_id = (SELECT id FROM candidates WHERE organization_id = $1 AND normalized_email = $2)",
      [fixtureA.organizationId, email.toLowerCase()]
    );
    expect(
      applications.rows.map((row: { job_opening_id: string }) => row.job_opening_id).sort()
    ).toEqual([fixtureA.jobOpeningId, secondJobOpeningId].sort());
  });

  it("nunca reutiliza Candidate de outra Organization, mesmo com e-mail identico", async () => {
    const email = `${crypto.randomUUID()}@example.com`;
    const fixtureA = await createPublicJobOpeningFixture(app, "flow-x1");
    const fixtureB = await createPublicJobOpeningFixture(app, "flow-x2");
    await submitApplication(app, fixtureA.slug, applicationPayload({ email })).expect(201);
    await submitApplication(app, fixtureB.slug, applicationPayload({ email })).expect(201);

    const candidates = await database.pool.query(
      "SELECT organization_id FROM candidates WHERE normalized_email = $1",
      [email.toLowerCase()]
    );
    expect(candidates.rows).toHaveLength(2);
    expect(
      new Set(candidates.rows.map((row: { organization_id: string }) => row.organization_id)).size
    ).toBe(2);
  });

  it("Candidate inativo nunca e reutilizado, nunca reativado, nunca recebe CandidateApplication", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "flow-c");
    const payload = applicationPayload();
    await submitApplication(app, fixture.slug, payload).expect(201);

    const candidateRow = await database.pool.query(
      "SELECT id FROM candidates WHERE organization_id = $1 AND normalized_email = $2",
      [fixture.organizationId, String(payload.email).toLowerCase()]
    );
    const candidateId = candidateRow.rows[0].id as string;

    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/candidates/${candidateId}/inactivate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const applicationCountBefore = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE candidate_id = $1",
      [candidateId]
    );
    expect(applicationCountBefore.rows[0].count).toBe(1);

    const response = await submitApplication(
      app,
      fixture.slug,
      applicationPayload({ email: payload.email })
    );
    expect(response.status).toBe(409);
    expect(response.body.error.code).not.toContain("inactive");

    const statusRow = await database.pool.query("SELECT status FROM candidates WHERE id = $1", [
      candidateId
    ]);
    expect(statusRow.rows[0].status).toBe("inactive");

    const applicationCountAfter = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE candidate_id = $1",
      [candidateId]
    );
    expect(applicationCountAfter.rows[0].count).toBe(applicationCountBefore.rows[0].count);

    const denialAudit = await database.pool.query(
      "SELECT * FROM audit_events WHERE action = 'public_application.denied_inactive_candidate' AND organization_id = $1",
      [fixture.organizationId]
    );
    expect(denialAudit.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("bloqueia mass assignment de campos protegidos (creationOrigin, createdByUserId, source, applicationStatus, organizationId)", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "flow-d");
    const response = await submitApplication(
      app,
      fixture.slug,
      applicationPayload({
        organizationId: "org_forged",
        creationOrigin: "internal_user",
        createdByUserId: "usr_forged",
        source: "manual",
        applicationStatus: "hired",
        currentStage: "offer"
      })
    ).expect(201);
    expect(response.body.status).toBe("received");

    const applicationRow = await database.pool.query(
      "SELECT * FROM candidate_applications WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1",
      [fixture.organizationId]
    );
    expect(applicationRow.rows[0].source).toBe("public_portal");
    expect(applicationRow.rows[0].application_status).toBe("active");
    expect(applicationRow.rows[0].current_stage).toBe("applied");
  });

  it("recusa Vaga privada, fechada e com prazo expirado", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "flow-e");
    await request(app)
      .patch(
        `/api/organizations/${fixture.organizationId}/job-openings/${fixture.jobOpeningId}/publication`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ isPublic: false })
      .expect(200);
    const privateResponse = await submitApplication(app, fixture.slug, applicationPayload());
    expect(privateResponse.status).toBe(404);

    const fixture2 = await createPublicJobOpeningFixture(app, "flow-f");
    await request(app)
      .post(
        `/api/organizations/${fixture2.organizationId}/job-openings/${fixture2.jobOpeningId}/close`
      )
      .set(userHeaders(fixture2.ownerId))
      .expect(200);
    const closedResponse = await submitApplication(app, fixture2.slug, applicationPayload());
    // `transition()` (job-openings/service.ts) sempre forca `isPublic = false` ao sair de
    // `open` -- fechar uma Vaga a torna simultaneamente nao-publica, entao a candidatura
    // publica recebe 404 (mesmo motivo/generico de uma Vaga que nunca existiu), nao 410.
    expect(closedResponse.status).toBe(404);

    const fixture3 = await createPublicJobOpeningFixture(app, "flow-g");
    await database.pool.query(
      "UPDATE job_openings SET application_deadline = NOW() - INTERVAL '1 hour' WHERE id = $1",
      [fixture3.jobOpeningId]
    );
    const expiredResponse = await submitApplication(app, fixture3.slug, applicationPayload());
    expect(expiredResponse.status).toBe(410);
  });

  it("nunca chama nenhuma infraestrutura de IA durante o fluxo", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "flow-h");
    const before = await database.pool
      .query("SELECT COUNT(*)::int AS count FROM ai_executions")
      .catch(() => ({ rows: [{ count: 0 }] }));
    await submitApplication(app, fixture.slug, applicationPayload()).expect(201);
    const after = await database.pool
      .query("SELECT COUNT(*)::int AS count FROM ai_executions")
      .catch(() => ({ rows: [{ count: 0 }] }));
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });
});
