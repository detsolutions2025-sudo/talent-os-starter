import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  accessTokenHeaders,
  addMembership,
  createApp,
  createConfiguredApplicationFixture,
  createUser,
  platformHeaders,
  userHeaders
} from "./helpers";

describe("Fase 18 - Candidate inativo, Consentimento invalido, CandidateApplication finalizada, Organization arquivada", () => {
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

  it("bloqueia criacao/start/save/submit/retry quando Candidate esta inativo, mas preserva historico", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "candidate-inactive-a");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);
    const token = created.body.rawAccessToken as string;

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidates/${fixture.candidate.id}/inactivate`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(200);

    const blockedStart = await request(app)
      .post("/api/public/pre-interviews/start")
      .set(accessTokenHeaders(token));
    expect(blockedStart.status).toBe(409);

    const stillReadable = await request(app)
      .get(`/api/organizations/${fixture.organization.id}/pre-interviews/${created.body.id}`)
      .set(userHeaders(fixture.owner.id))
      .expect(200);
    expect(stillReadable.body.id).toBe(created.body.id);

    // Cancelamento administrativo continua permitido.
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/pre-interviews/${created.body.id}/cancel`
      )
      .set(userHeaders(fixture.owner.id))
      .send({ reason: "Candidate inativado" })
      .expect(200);
  });

  it("bloqueia operacoes quando o consentimento do Candidate e revogado", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "consent-a");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);
    const token = created.body.rawAccessToken as string;

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidates/${fixture.candidate.id}/consents/revoke`
      )
      .set(userHeaders(fixture.owner.id))
      .send({ reason: "Solicitado pelo titular" })
      .expect(201);

    const blockedStart = await request(app)
      .post("/api/public/pre-interviews/start")
      .set(accessTokenHeaders(token));
    expect(blockedStart.status).toBe(409);

    const responses = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interview_responses WHERE pre_interview_id = $1",
      [created.body.id]
    );
    expect(responses.rows[0].count).toBe(0);
  });

  it("bloqueia nova instancia e novas operacoes quando a CandidateApplication ja foi finalizada", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "app-final-a");
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/withdraw`
      )
      .set(userHeaders(fixture.owner.id))
      .send({ reason: "Candidato desistiu" })
      .expect(200);

    const blockedCreate = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id));
    expect(blockedCreate.status).toBe(409);
  });

  it("bloqueia start/save/submit em token cuja CandidateApplication foi finalizada apos a criacao", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "app-final-b");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);
    const token = created.body.rawAccessToken as string;

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/reject`
      )
      .set(userHeaders(fixture.owner.id))
      .send({ reason: "Perfil nao aderente" })
      .expect(200);

    const blockedStart = await request(app)
      .post("/api/public/pre-interviews/start")
      .set(accessTokenHeaders(token));
    expect(blockedStart.status).toBe(409);
  });

  it("Organization arquivada bloqueia toda operacao funcional", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "org-archived-a");
    await request(app)
      .post(`/api/organizations/${fixture.organization.id}/archive`)
      .set(platformHeaders)
      .expect(200);

    const blockedSettings = await request(app)
      .put(
        `/api/organizations/${fixture.organization.id}/job-openings/${fixture.job.id}/pre-interview-settings`
      )
      .set(userHeaders(fixture.owner.id))
      .send({ enabled: true, questions: [] });
    expect(blockedSettings.status).toBe(403);

    const blockedCreate = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id));
    expect(blockedCreate.status).toBe(403);
  });

  it("member visualiza somente o DTO positivo (id/status/attemptNumber), nunca respostas", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "member-a");
    const member = await createUser(app, "member-pint-a");
    await addMembership(app, fixture.organization.id, fixture.owner.id, member.id, "member");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);

    const memberView = await request(app)
      .get(`/api/organizations/${fixture.organization.id}/pre-interviews/${created.body.id}`)
      .set(userHeaders(member.id))
      .expect(200);
    expect(Object.keys(memberView.body).sort()).toEqual(["attemptNumber", "id", "status"]);

    const memberCancel = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/pre-interviews/${created.body.id}/cancel`
      )
      .set(userHeaders(member.id))
      .send({ reason: "tentativa" });
    expect(memberCancel.status).toBe(403);

    const memberSettings = await request(app)
      .put(
        `/api/organizations/${fixture.organization.id}/job-openings/${fixture.job.id}/pre-interview-settings`
      )
      .set(userHeaders(member.id))
      .send({ enabled: false, questions: [] });
    expect(memberSettings.status).toBe(403);
  });

  it("Platform Admin nunca opera funcionalmente; leitura administrativa exige motivo e retorna DTO minimizado", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "platform-a");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);

    const platformCancel = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/pre-interviews/${created.body.id}/cancel`
      )
      .set(platformHeaders)
      .send({ reason: "tentativa" });
    expect(platformCancel.status).toBe(403);

    const withoutReason = await request(app)
      .post(`/api/platform/organizations/${fixture.organization.id}/pre-interviews/admin-read`)
      .set(platformHeaders)
      .send({});
    expect(withoutReason.status).toBe(400);

    const adminRead = await request(app)
      .post(`/api/platform/organizations/${fixture.organization.id}/pre-interviews/admin-read`)
      .set(platformHeaders)
      .send({ reason: "Auditoria de suporte" })
      .expect(200);
    expect(adminRead.body).toHaveLength(1);
    expect(Object.keys(adminRead.body[0]).sort()).toEqual(
      [
        "attemptNumber",
        "candidateApplicationId",
        "createdAt",
        "id",
        "organizationId",
        "status",
        "updatedAt"
      ].sort()
    );
  });

  it("acesso cruzado entre Organizations e recusado sem vazar existencia (settings, criacao, leitura, cancelamento)", async () => {
    const fixtureA = await createConfiguredApplicationFixture(app, "cross-a");
    const fixtureB = await createConfiguredApplicationFixture(app, "cross-b");

    // owner de B tenta configurar a vaga de A -- bloqueado explicitamente no servidor (nunca
    // depende apenas da FK, que produziria um erro cru de banco em vez de 404 generico).
    const crossSettings = await request(app)
      .put(
        `/api/organizations/${fixtureB.organization.id}/job-openings/${fixtureA.job.id}/pre-interview-settings`
      )
      .set(userHeaders(fixtureB.owner.id))
      .send({ enabled: true, questions: [] });
    expect(crossSettings.status).toBe(404);

    const crossCreate = await request(app)
      .post(
        `/api/organizations/${fixtureB.organization.id}/candidate-applications/${fixtureA.application.id}/pre-interviews`
      )
      .set(userHeaders(fixtureB.owner.id));
    expect(crossCreate.status).toBe(404);

    const createdA = await request(app)
      .post(
        `/api/organizations/${fixtureA.organization.id}/candidate-applications/${fixtureA.application.id}/pre-interviews`
      )
      .set(userHeaders(fixtureA.owner.id))
      .expect(201);

    const crossRead = await request(app)
      .get(`/api/organizations/${fixtureB.organization.id}/pre-interviews/${createdA.body.id}`)
      .set(userHeaders(fixtureB.owner.id));
    expect(crossRead.status).toBe(404);

    const crossCancel = await request(app)
      .post(
        `/api/organizations/${fixtureB.organization.id}/pre-interviews/${createdA.body.id}/cancel`
      )
      .set(userHeaders(fixtureB.owner.id))
      .send({ reason: "tentativa cruzada" });
    expect(crossCancel.status).toBe(404);
  });

  it("token de uma Organization nunca resolve dado de outra, mesmo com manipulacao", async () => {
    const fixtureA = await createConfiguredApplicationFixture(app, "cross-token-a");
    const createdA = await request(app)
      .post(
        `/api/organizations/${fixtureA.organization.id}/candidate-applications/${fixtureA.application.id}/pre-interviews`
      )
      .set(userHeaders(fixtureA.owner.id))
      .expect(201);

    const invalidToken = await request(app)
      .get("/api/public/pre-interviews/current")
      .set(accessTokenHeaders("not-a-real-token"));
    expect(invalidToken.status).toBe(404);

    const validToken = await request(app)
      .get("/api/public/pre-interviews/current")
      .set(accessTokenHeaders(createdA.body.rawAccessToken))
      .expect(200);
    expect(validToken.body.status).toBe("available");
  });

  it("mass assignment de campos protegidos e bloqueado no salvamento de resposta", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "mass-assign-a");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);
    const token = created.body.rawAccessToken as string;
    const questions = await database.pool.query(
      "SELECT id FROM pre_interview_questions WHERE pre_interview_id = $1",
      [created.body.id]
    );
    await request(app)
      .post("/api/public/pre-interviews/start")
      .set(accessTokenHeaders(token))
      .expect(200);

    const blocked = await request(app)
      .put(`/api/public/pre-interviews/responses/${questions.rows[0].id}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: "answer", submitted: true, organizationId: "org_hacked" });
    expect(blocked.status).toBe(400);
  });

  it("tipo de resposta invalido e recusado, validado contra o snapshot da pergunta", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "type-a");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);
    const token = created.body.rawAccessToken as string;
    const questions = await database.pool.query(
      "SELECT id FROM pre_interview_questions WHERE pre_interview_id = $1",
      [created.body.id]
    );
    await request(app)
      .post("/api/public/pre-interviews/start")
      .set(accessTokenHeaders(token))
      .expect(200);

    // Pergunta e open_text (SPEC-009 default do fixture) -- valor vazio nunca e valido para
    // ela (mesma regra ja usada por InterviewService para o mesmo tipo, reaproveitada aqui).
    const blocked = await request(app)
      .put(`/api/public/pre-interviews/responses/${questions.rows[0].id}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: "" });
    expect(blocked.status).toBe(400);
  });
});
