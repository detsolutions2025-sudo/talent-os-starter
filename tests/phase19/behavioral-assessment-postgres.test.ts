import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { registerCalculator } from "../../src/server/behavioral-assessments/calculations";
import {
  accessTokenHeaders,
  createApplication,
  createApp,
  createConfiguredAssessmentFixture,
  createCandidateWithConsent,
  createCandidateWithoutBehavioralConsent,
  createOrganization,
  createPrivateInstrument,
  createPublishedOpenJob,
  createUser,
  platformHeaders,
  registerTestCalculator,
  scaleItem,
  TEST_CALCULATION_VERSION,
  unique,
  userHeaders
} from "./helpers";

describe("Fase 19 - Perfil Comportamental: instancias e fluxo publico (SPEC-022, secoes 8-15/20-25)", () => {
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

  it("criacao via preferencia da vaga: draft->available na MESMA transacao (nunca observavel como draft)", async () => {
    const fixture = await createConfiguredAssessmentFixture(app, "flow-a");

    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({})
      .expect(201);
    expect(created.body.status).toBe("available");
    expect(created.body.originType).toBe("internal_application");
    expect(created.body.createdSource).toBe("internal_user");
    expect(typeof created.body.rawAccessToken).toBe("string");

    const rows = await database.pool.query(
      "SELECT status, created_source, created_by_user_id, attempt_number FROM behavioral_assessments WHERE organization_id = $1",
      [fixture.organization.id]
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].status).toBe("available");
    expect(rows.rows[0].created_source).toBe("internal_user");
    expect(rows.rows[0].created_by_user_id).toBe(fixture.owner.id);
    expect(rows.rows[0].attempt_number).toBe(1);

    const events = await database.pool.query(
      "SELECT event_type FROM behavioral_assessment_events WHERE behavioral_assessment_id = $1 ORDER BY created_at ASC",
      [created.body.id]
    );
    expect(events.rows.map((row) => row.event_type)).toEqual(["created", "available"]);
  });

  it("fluxo publico completo: start -> saveResponse -> submit calcula e persiste resultado atomicamente", async () => {
    const fixture = await createConfiguredAssessmentFixture(app, "flow-b");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({})
      .expect(201);
    const token = created.body.rawAccessToken as string;

    const current = await request(app)
      .get("/api/public/behavioral-assessments/current")
      .set(accessTokenHeaders(token))
      .expect(200);
    expect(current.body.status).toBe("available");
    expect(current.body.items).toHaveLength(1);
    const itemId = current.body.items[0].id as string;

    await request(app)
      .post("/api/public/behavioral-assessments/start")
      .set(accessTokenHeaders(token))
      .expect(200);

    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 5 })
      .expect(200);

    const submitted = await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(200);
    expect(submitted.body.status).toBe("completed");
    // candidateResultVisibility="summary" na fixture -> apenas summaryText, nunca dimensoes.
    expect(submitted.body.result.summaryText).toEqual(expect.any(String));
    expect(submitted.body.result.dimensions).toBeUndefined();

    const resultRow = await database.pool.query(
      "SELECT origin, summary_text FROM behavioral_assessment_results WHERE behavioral_assessment_id = $1",
      [created.body.id]
    );
    expect(resultRow.rows).toHaveLength(1);
    expect(resultRow.rows[0].origin).toBe("calculated");

    const dimensionRows = await database.pool.query(
      `SELECT dimension_code, raw_value FROM behavioral_assessment_result_dimensions
       WHERE behavioral_assessment_result_id = (SELECT id FROM behavioral_assessment_results WHERE behavioral_assessment_id = $1)`,
      [created.body.id]
    );
    expect(dimensionRows.rows).toHaveLength(1);
    expect(dimensionRows.rows[0].dimension_code).toBe("energy");

    const events = await database.pool.query(
      "SELECT event_type FROM behavioral_assessment_events WHERE behavioral_assessment_id = $1 ORDER BY created_at ASC",
      [created.body.id]
    );
    expect(events.rows.map((row) => row.event_type)).toEqual([
      "created",
      "available",
      "started",
      "response_saved",
      "submitted",
      "calculation_completed"
    ]);

    // Auditoria do fluxo publico usa ator sistema (sem User autenticado).
    const audits = await database.pool.query(
      "SELECT action, actor_user_id FROM audit_events WHERE organization_id = $1 AND action = 'behavioral_assessment.submitted'",
      [fixture.organization.id]
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0].actor_user_id).toBeNull();
  });

  it("falha no calculo NUNCA persiste resultado parcial nem marca completed -- ROLLBACK integral, respostas preservadas", async () => {
    const owner = await createUser(app, "owner-fail-a");
    const { organization } = await createOrganization(app, owner.id);
    const candidate = await createCandidateWithConsent(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "fail-a");
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );

    const methodologyKey = unique("failing-methodology");
    registerCalculator({
      identity: { methodologyKey, calculationMethodVersion: TEST_CALCULATION_VERSION },
      validateVersionManifest() {
        // sempre valido na ativacao -- a falha so ocorre em calculate().
      },
      calculate() {
        throw new Error("simulated calculation failure");
      }
    });

    const instrument = await createPrivateInstrument(app, organization.id, owner.id, "fail-a");
    const draft = await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions`
      )
      .set(userHeaders(owner.id))
      .send({
        methodologyKey,
        calculationMethodVersion: TEST_CALCULATION_VERSION,
        dimensions: [{ code: "energy", name: "Energia", required: true }],
        items: [scaleItem("energy-1", "energy", 0)]
      })
      .expect(201);
    const versionId = (draft.body.version as { id: string }).id;
    await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions/${versionId}/activate`
      )
      .set(userHeaders(owner.id))
      .expect(200);

    const created = await request(app)
      .post(
        `/api/organizations/${organization.id}/candidate-applications/${application.id}/behavioral-assessments`
      )
      .set(userHeaders(owner.id))
      .send({ behavioralInstrumentId: instrument.id, behavioralInstrumentVersionId: versionId })
      .expect(201);
    const token = created.body.rawAccessToken as string;
    const current = await request(app)
      .get("/api/public/behavioral-assessments/current")
      .set(accessTokenHeaders(token))
      .expect(200);
    const itemId = current.body.items[0].id as string;

    await request(app)
      .post("/api/public/behavioral-assessments/start")
      .set(accessTokenHeaders(token))
      .expect(200);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 5 })
      .expect(200);

    const submit = await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(409);
    expect(submit.body.error.code).toBe("behavioral_assessment_calculation_failed");

    const assessmentRow = await database.pool.query(
      "SELECT status FROM behavioral_assessments WHERE id = $1",
      [created.body.id]
    );
    expect(assessmentRow.rows[0].status).toBe("in_progress");

    const resultRows = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM behavioral_assessment_results WHERE behavioral_assessment_id = $1",
      [created.body.id]
    );
    expect(resultRows.rows[0].count).toBe(0);

    // A resposta salva antes da falha continua preservada -- o rollback e apenas do submit.
    const responseRows = await database.pool.query(
      "SELECT submitted FROM behavioral_assessment_responses WHERE behavioral_assessment_id = $1",
      [created.body.id]
    );
    expect(responseRows.rows).toHaveLength(1);
    expect(responseRows.rows[0].submitted).toBe(false);

    const retryView = await request(app)
      .get("/api/public/behavioral-assessments/current")
      .set(accessTokenHeaders(token))
      .expect(200);
    expect(retryView.body.status).toBe("in_progress");
  });

  it("consentimento generico (purpose diferente) nunca autoriza -- exige purpose='behavioral_assessment' concedido", async () => {
    const owner = await createUser(app, "owner-consent-a");
    const { organization } = await createOrganization(app, owner.id);
    const candidate = await createCandidateWithoutBehavioralConsent(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "consent-a");
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );

    const methodologyKey = unique("consent-methodology");
    registerTestCalculator(methodologyKey, TEST_CALCULATION_VERSION);
    const instrument = await createPrivateInstrument(app, organization.id, owner.id, "consent-a");
    const draft = await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions`
      )
      .set(userHeaders(owner.id))
      .send({
        methodologyKey,
        calculationMethodVersion: TEST_CALCULATION_VERSION,
        dimensions: [{ code: "energy", name: "Energia", required: true }],
        items: [scaleItem("energy-1", "energy", 0)]
      })
      .expect(201);
    const versionId = (draft.body.version as { id: string }).id;
    await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions/${versionId}/activate`
      )
      .set(userHeaders(owner.id))
      .expect(200);

    const response = await request(app)
      .post(
        `/api/organizations/${organization.id}/candidate-applications/${application.id}/behavioral-assessments`
      )
      .set(userHeaders(owner.id))
      .send({ behavioralInstrumentId: instrument.id, behavioralInstrumentVersionId: versionId })
      .expect(409);
    expect(response.body.error.code).toBe("behavioral_assessment_consent_invalid");

    const rows = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM behavioral_assessments WHERE organization_id = $1",
      [organization.id]
    );
    expect(rows.rows[0].count).toBe(0);
  });

  it("cancelamento revoga tokens ativos; retry cria nova tentativa resolvendo a versao ATIVA atual do mesmo instrumento", async () => {
    const fixture = await createConfiguredAssessmentFixture(app, "cancel-retry-a");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({})
      .expect(201);
    const token = created.body.rawAccessToken as string;

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/behavioral-assessments/${created.body.id}/cancel`
      )
      .set(userHeaders(fixture.owner.id))
      .send({ reason: "Vaga encerrada" })
      .expect(200);

    await request(app)
      .get("/api/public/behavioral-assessments/current")
      .set(accessTokenHeaders(token))
      .expect(404);

    const retry = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/behavioral-assessments/${created.body.id}/retry`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);
    expect(retry.body.attemptNumber).toBe(2);
    expect(retry.body.previousAttemptId).toBe(created.body.id);
    expect(retry.body.behavioralInstrumentVersionId).toBe(fixture.version.id);
  });

  it("nao e possivel criar segunda instancia OPERACIONAL do mesmo instrumento enquanto a primeira nao for finalizada", async () => {
    const fixture = await createConfiguredAssessmentFixture(app, "dup-a");
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({})
      .expect(201);

    const duplicate = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({})
      .expect(409);
    expect(duplicate.body.error.code).toBe("behavioral_assessment_already_operational");
  });

  it("importacao externa: nasce completed diretamente (nunca passa por available/in_progress) e e idempotente por externalReferenceId", async () => {
    const fixture = await createConfiguredAssessmentFixture(app, "import-a");
    const externalReferenceId = unique("ext-ref");

    const payload = {
      behavioralInstrumentId: fixture.instrument.id,
      behavioralInstrumentVersionId: fixture.version.id,
      externalProvider: "manual-upload",
      externalReferenceId,
      appliedAtExternal: new Date().toISOString(),
      completedAtExternal: new Date().toISOString(),
      summaryText: "Resultado importado manualmente.",
      dimensions: [{ code: "energy", value: 7, label: "Energia" }]
    };

    const first = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments/external-import`
      )
      .set(userHeaders(fixture.owner.id))
      .send(payload)
      .expect(201);
    expect(first.body.status).toBe("completed");
    expect(first.body.originType).toBe("external_import");

    const replay = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments/external-import`
      )
      .set(userHeaders(fixture.owner.id))
      .send(payload)
      .expect(201);
    expect(replay.body.id).toBe(first.body.id);

    const rows = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM behavioral_assessments WHERE organization_id = $1 AND origin_type = 'external_import'",
      [fixture.organization.id]
    );
    expect(rows.rows[0].count).toBe(1);

    const events = await database.pool.query(
      "SELECT event_type FROM behavioral_assessment_events WHERE behavioral_assessment_id = $1 ORDER BY created_at ASC",
      [first.body.id]
    );
    expect(events.rows.map((row) => row.event_type)).toEqual([
      "created",
      "external_result_imported"
    ]);
  });

  it("isolamento entre Organizations: instancia de A e invisivel para B, nunca 403 (404 generico)", async () => {
    const fixtureA = await createConfiguredAssessmentFixture(app, "iso-a");
    const created = await request(app)
      .post(
        `/api/organizations/${fixtureA.organization.id}/candidate-applications/${fixtureA.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixtureA.owner.id))
      .send({})
      .expect(201);

    const ownerB = await createUser(app, "owner-iso-b");
    const { organization: orgB } = await createOrganization(app, ownerB.id);

    const response = await request(app)
      .get(`/api/organizations/${orgB.id}/behavioral-assessments/${created.body.id}`)
      .set(userHeaders(ownerB.id))
      .expect(404);
    expect(response.body.error.code).toBe("behavioral_assessment_not_found");
  });

  it("member ve apenas status (DTO minimizado), nunca detalhes/resultado/attemptNumber", async () => {
    const fixture = await createConfiguredAssessmentFixture(app, "member-view-a");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({})
      .expect(201);

    const member = await createUser(app, "member-view-a");
    await request(app)
      .post(`/api/organizations/${fixture.organization.id}/memberships`)
      .set(userHeaders(fixture.owner.id))
      .send({ userId: member.id, role: "member" })
      .expect(201);

    const memberView = await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/behavioral-assessments/${created.body.id}`
      )
      .set(userHeaders(member.id))
      .expect(200);
    expect(Object.keys(memberView.body).sort()).toEqual(["id", "status"]);
  });

  it("admin-read (Platform Admin) exige motivo e retorna DTO minimizado", async () => {
    const fixture = await createConfiguredAssessmentFixture(app, "admin-read-a");
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({})
      .expect(201);

    await request(app)
      .post(
        `/api/platform/organizations/${fixture.organization.id}/behavioral-assessments/admin-read`
      )
      .set(platformHeaders)
      .send({})
      .expect(400);

    const response = await request(app)
      .post(
        `/api/platform/organizations/${fixture.organization.id}/behavioral-assessments/admin-read`
      )
      .set(platformHeaders)
      .send({ reason: "Investigacao de suporte" })
      .expect(200);
    expect(response.body).toHaveLength(1);
    expect(Object.keys(response.body[0]).sort()).toEqual(
      [
        "attemptNumber",
        "behavioralInstrumentId",
        "candidateApplicationId",
        "createdAt",
        "id",
        "organizationId",
        "status",
        "updatedAt"
      ].sort()
    );

    const audits = await database.pool.query(
      "SELECT action, reason FROM audit_events WHERE organization_id = $1 AND action = 'behavioral_assessment.administrative_read'",
      [fixture.organization.id]
    );
    expect(audits.rows).toHaveLength(1);
  });

  it("rate limiting publico por token: a 31a chamada com o MESMO token e bloqueada (429)", async () => {
    const fixture = await createConfiguredAssessmentFixture(app, "ratelimit-a");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({})
      .expect(201);
    const token = created.body.rawAccessToken as string;

    let rateLimitedAt = -1;
    for (let index = 0; index < 35; index += 1) {
      const response = await request(app)
        .get("/api/public/behavioral-assessments/current")
        .set(accessTokenHeaders(token));
      if (response.status === 429) {
        rateLimitedAt = index;
        break;
      }
      expect(response.status).toBe(200);
    }
    expect(rateLimitedAt).toBe(30);
  });

  it("token forjado nunca diferencia 'ausente' de 'invalido' -- sempre 404 generico ate esgotar o rate limit", async () => {
    const response = await request(app)
      .get("/api/public/behavioral-assessments/current")
      .set(accessTokenHeaders("token-completamente-forjado"))
      .expect(404);
    expect(response.body.error.code).toBe("behavioral_assessment_access_denied");
  });
});
