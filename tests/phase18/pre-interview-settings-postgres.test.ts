import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  createApp,
  createOrganization,
  createPublishedOpenJob,
  createQuestionCatalogItem,
  createUser,
  enablePreInterviewSettings,
  platformHeaders,
  userHeaders
} from "./helpers";

describe("Fase 18 - Configuracao de Pre-Entrevista da Vaga (SPEC-021, secao 4.2)", () => {
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

  it("owner habilita a configuracao com uma pergunta", async () => {
    const owner = await createUser(app, "owner-settings-a");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "settings-a");
    const question = await createQuestionCatalogItem(app, organization.id, owner.id, "settings-a");

    const response = await enablePreInterviewSettings(app, organization.id, job.id, owner.id, [
      question.questionCatalogItemId
    ]).expect(200);

    expect(response.body.enabled).toBe(true);
    expect(response.body.questions).toHaveLength(1);
  });

  it("admin tambem configura (mesmos poderes de owner nesta versao, SPEC-021 secao 24.1)", async () => {
    const owner = await createUser(app, "owner-settings-b");
    const admin = await createUser(app, "admin-settings-b");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, admin.id, "admin");
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "settings-b");
    const question = await createQuestionCatalogItem(app, organization.id, owner.id, "settings-b");

    await enablePreInterviewSettings(app, organization.id, job.id, admin.id, [
      question.questionCatalogItemId
    ]).expect(200);
  });

  it("member nao configura", async () => {
    const owner = await createUser(app, "owner-settings-c");
    const member = await createUser(app, "member-settings-c");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, member.id, "member");
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "settings-c");
    const question = await createQuestionCatalogItem(app, organization.id, owner.id, "settings-c");

    const response = await enablePreInterviewSettings(app, organization.id, job.id, member.id, [
      question.questionCatalogItemId
    ]);
    expect(response.status).toBe(403);
  });

  it("Platform Admin nao configura", async () => {
    const owner = await createUser(app, "owner-settings-d");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "settings-d");

    const response = await request(app)
      .put(`/api/organizations/${organization.id}/job-openings/${job.id}/pre-interview-settings`)
      .set(platformHeaders)
      .send({ enabled: true, questions: [] });
    expect(response.status).toBe(403);
  });

  it("recusa pergunta de outra Organization", async () => {
    const owner = await createUser(app, "owner-settings-e");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "settings-e");

    const otherOwner = await createUser(app, "owner-settings-e-other");
    const { organization: otherOrganization } = await createOrganization(app, otherOwner.id);
    const otherQuestion = await createQuestionCatalogItem(
      app,
      otherOrganization.id,
      otherOwner.id,
      "settings-e-other"
    );

    const response = await enablePreInterviewSettings(app, organization.id, job.id, owner.id, [
      otherQuestion.questionCatalogItemId
    ]);
    expect(response.status).toBe(404);
  });

  it("reorder reconstroi a colecao completa dentro da mesma transacao (Plano Tecnico, item 10)", async () => {
    const owner = await createUser(app, "owner-settings-f");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "settings-f");
    const questionA = await createQuestionCatalogItem(
      app,
      organization.id,
      owner.id,
      "settings-f-a"
    );
    const questionB = await createQuestionCatalogItem(
      app,
      organization.id,
      owner.id,
      "settings-f-b"
    );

    await enablePreInterviewSettings(app, organization.id, job.id, owner.id, [
      questionA.questionCatalogItemId,
      questionB.questionCatalogItemId
    ]).expect(200);

    // Inverte a ordem -- nunca updates 1->2/2->1 que colidiriam com o UNIQUE intermediario.
    const reordered = await enablePreInterviewSettings(app, organization.id, job.id, owner.id, [
      questionB.questionCatalogItemId,
      questionA.questionCatalogItemId
    ]).expect(200);

    expect(reordered.body.questions[0].questionCatalogItemId).toBe(questionB.questionCatalogItemId);
    expect(reordered.body.questions[1].questionCatalogItemId).toBe(questionA.questionCatalogItemId);

    const rows = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM job_opening_pre_interview_question_settings WHERE settings_id = (SELECT id FROM job_opening_pre_interview_settings WHERE job_opening_id = $1)",
      [job.id]
    );
    expect(rows.rows[0].count).toBe(2);
  });

  it("perguntas duplicadas na configuracao sao recusadas", async () => {
    const owner = await createUser(app, "owner-settings-g");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "settings-g");
    const question = await createQuestionCatalogItem(app, organization.id, owner.id, "settings-g");

    const response = await enablePreInterviewSettings(app, organization.id, job.id, owner.id, [
      question.questionCatalogItemId,
      question.questionCatalogItemId
    ]);
    expect(response.status).toBe(400);
  });

  it("desabilitar a configuracao e reversivel e nunca apaga historico ja existente", async () => {
    const owner = await createUser(app, "owner-settings-h");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "settings-h");
    const question = await createQuestionCatalogItem(app, organization.id, owner.id, "settings-h");
    await enablePreInterviewSettings(app, organization.id, job.id, owner.id, [
      question.questionCatalogItemId
    ]).expect(200);

    const disabled = await request(app)
      .put(`/api/organizations/${organization.id}/job-openings/${job.id}/pre-interview-settings`)
      .set(userHeaders(owner.id))
      .send({ enabled: false, questions: [] })
      .expect(200);
    expect(disabled.body.enabled).toBe(false);
    expect(disabled.body.questions).toHaveLength(0);
  });

  it("mass assignment de campos protegidos e bloqueado", async () => {
    const owner = await createUser(app, "owner-settings-i");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "settings-i");

    const response = await request(app)
      .put(`/api/organizations/${organization.id}/job-openings/${job.id}/pre-interview-settings`)
      .set(userHeaders(owner.id))
      .send({
        enabled: true,
        questions: [],
        organizationId: "org_hacked",
        createdByUserId: "usr_hacked"
      });
    expect(response.status).toBe(400);
  });
});
