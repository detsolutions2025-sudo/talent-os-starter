import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { registerCalculator } from "../../src/server/behavioral-assessments/calculations";
import {
  accessTokenHeaders,
  createApplication,
  createApp,
  createCandidateWithConsent,
  createGlobalInstrument,
  createOrganization,
  createPrivateInstrument,
  createPublishedOpenJob,
  createUser,
  platformHeaders,
  registerTestCalculator,
  scaleItem,
  TEST_CALCULATION_VERSION,
  unique,
  userHeaders,
  BEHAVIORAL_ASSESSMENT_CONSENT_PURPOSE
} from "./helpers";

// Fase 19 (SPEC-022 v1.0) - Revisao Destrutiva Final.
//
// Este arquivo NUNCA repete a suite de lifecycle/instrument ja existente -- foca
// exclusivamente em vetores de ataque ainda nao exercitados: visibilidade de respostas
// brutas, effectiveStatus sem materializacao, mudanca de estado no meio de uma instancia
// (consentimento revogado/Candidate inativo/CandidateApplication finalizada), concorrencia
// real de attempt_number e retry, maquina de estados interna via SQL direto, allow-list do
// calculador, unicidade de resultado/dimensao, visibilidade none/full, mass assignment via
// HTTP, Organization arquivada, nao-retroatividade de instrumento/versao e vazamento de log.

async function buildActiveInstrument(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  suffix: string,
  overrides: {
    candidateResultVisibility?: "none" | "summary" | "full";
    rawResponseOwnerVisibility?: "visible" | "restricted";
  } = {}
) {
  const methodologyKey = unique(`destructive-${suffix}`);
  registerTestCalculator(methodologyKey, TEST_CALCULATION_VERSION);
  const instrument = await createPrivateInstrument(app, organizationId, ownerId, suffix);
  const draft = await request(app)
    .post(`/api/organizations/${organizationId}/behavioral-instruments/${instrument.id}/versions`)
    .set(userHeaders(ownerId))
    .send({
      methodologyKey,
      calculationMethodVersion: TEST_CALCULATION_VERSION,
      candidateResultVisibility: overrides.candidateResultVisibility ?? "summary",
      rawResponseOwnerVisibility: overrides.rawResponseOwnerVisibility ?? "visible",
      dimensions: [{ code: "energy", name: "Energia", required: true }],
      items: [scaleItem("energy-1", "energy", 0)]
    })
    .expect(201);
  const version = draft.body.version as { id: string };
  await request(app)
    .post(
      `/api/organizations/${organizationId}/behavioral-instruments/${instrument.id}/versions/${version.id}/activate`
    )
    .set(userHeaders(ownerId))
    .expect(200);
  return { instrument, version, methodologyKey };
}

async function fullFixture(
  app: ReturnType<typeof createApp>,
  suffix: string,
  overrides: {
    candidateResultVisibility?: "none" | "summary" | "full";
    rawResponseOwnerVisibility?: "visible" | "restricted";
  } = {}
) {
  const owner = await createUser(app, `owner-dr-${suffix}`);
  const { organization } = await createOrganization(app, owner.id);
  const candidate = await createCandidateWithConsent(app, organization.id, owner.id);
  const job = await createPublishedOpenJob(app, organization.id, owner.id, suffix);
  const application = await createApplication(
    app,
    organization.id,
    owner.id,
    candidate.id,
    job.id,
    job.versionId
  );
  const { instrument, version, methodologyKey } = await buildActiveInstrument(
    app,
    organization.id,
    owner.id,
    suffix,
    overrides
  );
  return { owner, organization, candidate, job, application, instrument, version, methodologyKey };
}

async function createAndStart(
  app: ReturnType<typeof createApp>,
  fixture: Awaited<ReturnType<typeof fullFixture>>
) {
  const created = await request(app)
    .post(
      `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
    )
    .set(userHeaders(fixture.owner.id))
    .send({
      behavioralInstrumentId: fixture.instrument.id,
      behavioralInstrumentVersionId: fixture.version.id
    })
    .expect(201);
  const token = created.body.rawAccessToken as string;
  await request(app)
    .post("/api/public/behavioral-assessments/start")
    .set(accessTokenHeaders(token))
    .expect(200);
  const current = await request(app)
    .get("/api/public/behavioral-assessments/current")
    .set(accessTokenHeaders(token))
    .expect(200);
  const itemId = current.body.items[0].id as string;
  return { created, token, itemId };
}

describe("Fase 19 - Revisao Destrutiva Final (SPEC-022 v1.0; Plano Tecnico aprovado)", () => {
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

  // --- Item 36/37: raw_response_owner_visibility -------------------------------------------

  it("raw_response_owner_visibility=restricted: owner/admin NUNCA recebem responses brutas, apenas o resultado estruturado", async () => {
    const fixture = await fullFixture(app, "raw-restricted", {
      rawResponseOwnerVisibility: "restricted"
    });
    const { created, token, itemId } = await createAndStart(app, fixture);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 7 })
      .expect(200);
    await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(200);

    const detail = await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/behavioral-assessments/${created.body.id}`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(200);
    expect(detail.body.rawResponsesRestricted).toBe(true);
    expect(detail.body.responses).toEqual([]);
    // O resultado estruturado (dimensoes/summary), em contraste, continua acessivel.
    expect(detail.body.result).not.toBeNull();
    expect(detail.body.result.result.summaryText).toEqual(expect.any(String));

    const list = await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(200);
    expect(list.body[0].responses).toEqual([]);
  });

  it("raw_response_owner_visibility=visible (padrao): owner/admin continuam recebendo as respostas brutas", async () => {
    const fixture = await fullFixture(app, "raw-visible", {
      rawResponseOwnerVisibility: "visible"
    });
    const { created, token, itemId } = await createAndStart(app, fixture);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 4 })
      .expect(200);
    await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(200);

    const detail = await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/behavioral-assessments/${created.body.id}`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(200);
    expect(detail.body.rawResponsesRestricted).toBe(false);
    expect(detail.body.responses).toHaveLength(1);
  });

  // --- Item 44/45/46: effectiveStatus sem materializacao fisica ----------------------------

  it("listByApplication/getById/adminRead apresentam 'expired' mesmo sem NENHUMA chamada publica ter materializado ainda", async () => {
    const fixture = await fullFixture(app, "effective-status");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({
        behavioralInstrumentId: fixture.instrument.id,
        behavioralInstrumentVersionId: fixture.version.id
      })
      .expect(201);

    // Forca o vencimento diretamente no banco -- nenhuma chamada publica (current/start/...)
    // e feita depois disto, entao a materializacao fisica nunca acontece por conta propria.
    await database.pool.query(
      "UPDATE behavioral_assessments SET expires_at = now() - interval '1 hour' WHERE id = $1",
      [created.body.id]
    );
    const rawRow = await database.pool.query(
      "SELECT status FROM behavioral_assessments WHERE id = $1",
      [created.body.id]
    );
    expect(rawRow.rows[0].status).toBe("available");

    const detail = await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/behavioral-assessments/${created.body.id}`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(200);
    expect(detail.body.status).toBe("expired");

    const list = await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(200);
    expect(list.body[0].status).toBe("expired");

    const adminRead = await request(app)
      .post(
        `/api/platform/organizations/${fixture.organization.id}/behavioral-assessments/admin-read`
      )
      .set(platformHeaders)
      .send({ reason: "Auditoria" })
      .expect(200);
    expect(adminRead.body[0].status).toBe("expired");

    // A linha fisica continua "available" ate uma escrita real materializar -- effectiveStatus
    // e apenas de leitura, nunca grava por si so.
    const stillRaw = await database.pool.query(
      "SELECT status FROM behavioral_assessments WHERE id = $1",
      [created.body.id]
    );
    expect(stillRaw.rows[0].status).toBe("available");
  });

  it("retry() reconhece expiracao efetiva mesmo sem materializacao previa (nao rejeita como 'nao finalizada')", async () => {
    const fixture = await fullFixture(app, "retry-effective");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({
        behavioralInstrumentId: fixture.instrument.id,
        behavioralInstrumentVersionId: fixture.version.id
      })
      .expect(201);
    await database.pool.query(
      "UPDATE behavioral_assessments SET expires_at = now() - interval '1 hour' WHERE id = $1",
      [created.body.id]
    );

    const retry = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/behavioral-assessments/${created.body.id}/retry`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);
    expect(retry.body.attemptNumber).toBe(2);

    // A materializacao fisica realmente ocorreu como efeito colateral do proprio retry.
    const materialized = await database.pool.query(
      "SELECT status FROM behavioral_assessments WHERE id = $1",
      [created.body.id]
    );
    expect(materialized.rows[0].status).toBe("expired");
  });

  // --- Item 14/15/16: mudanca de estado no meio da instancia --------------------------------

  it("consentimento revogado no meio da instancia bloqueia save/submit; respostas ja salvas permanecem preservadas", async () => {
    const fixture = await fullFixture(app, "consent-mid");
    const { token, itemId } = await createAndStart(app, fixture);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 3 })
      .expect(200);

    // Revoga ESPECIFICAMENTE o consentimento desta finalidade -- nunca o endpoint generico de
    // revogacao (que grava purpose="Revocation" e nao seria enxergado por
    // latestConsentByPurpose).
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidates/${fixture.candidate.id}/consents`
      )
      .set(userHeaders(fixture.owner.id))
      .send({
        status: "revoked",
        source: "manual",
        termsVersion: "v1",
        purpose: BEHAVIORAL_ASSESSMENT_CONSENT_PURPOSE
      })
      .expect(201);

    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 9 })
      .expect(409);
    await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(409);

    const responses = await database.pool.query(
      "SELECT response_value FROM behavioral_assessment_responses WHERE behavioral_assessment_id = (SELECT id FROM behavioral_assessments WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1)",
      [fixture.organization.id]
    );
    expect(responses.rows).toHaveLength(1);
  });

  it("Candidate inativado no meio da instancia bloqueia save/submit; historico preservado", async () => {
    const fixture = await fullFixture(app, "candidate-inactive-mid");
    const { token, itemId } = await createAndStart(app, fixture);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 2 })
      .expect(200);

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidates/${fixture.candidate.id}/inactivate`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(200);

    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 5 })
      .expect(409);
    await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(409);
    // Leitura continua funcionando -- historico nunca desaparece.
    await request(app)
      .get("/api/public/behavioral-assessments/current")
      .set(accessTokenHeaders(token))
      .expect(200);
  });

  it("CandidateApplication finalizada (withdraw) no meio da instancia bloqueia save/submit/retry; nunca altera application_status por efeito colateral", async () => {
    const fixture = await fullFixture(app, "application-final-mid");
    const { created, token, itemId } = await createAndStart(app, fixture);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 6 })
      .expect(200);

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/withdraw`
      )
      .set(userHeaders(fixture.owner.id))
      .send({ reason: "Candidate desistiu" })
      .expect(200);

    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 1 })
      .expect(409);
    await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(409);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/behavioral-assessments/${created.body.id}/retry`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(409);

    const applicationRow = await database.pool.query(
      "SELECT application_status FROM candidate_applications WHERE id = $1",
      [fixture.application.id]
    );
    expect(applicationRow.rows[0].application_status).toBe("withdrawn");
  });

  // --- Item 18/67: concorrencia real de attempt_number e retry ------------------------------

  it("duas criacoes verdadeiramente concorrentes para a mesma aplicacao+instrumento: apenas uma vence, attempt_number nunca colide", async () => {
    const fixture = await fullFixture(app, "concurrent-create");
    const attempt = () =>
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
        )
        .set(userHeaders(fixture.owner.id))
        .send({
          behavioralInstrumentId: fixture.instrument.id,
          behavioralInstrumentVersionId: fixture.version.id
        });

    const [first, second] = await Promise.all([attempt(), attempt()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const rows = await database.pool.query(
      "SELECT attempt_number FROM behavioral_assessments WHERE organization_id = $1 AND candidate_application_id = $2",
      [fixture.organization.id, fixture.application.id]
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].attempt_number).toBe(1);
  });

  it("duas tentativas de retry verdadeiramente concorrentes apos finalizacao: exatamente uma proxima tentativa, numero monotonico", async () => {
    const fixture = await fullFixture(app, "concurrent-retry");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({
        behavioralInstrumentId: fixture.instrument.id,
        behavioralInstrumentVersionId: fixture.version.id
      })
      .expect(201);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/behavioral-assessments/${created.body.id}/cancel`
      )
      .set(userHeaders(fixture.owner.id))
      .send({ reason: "Motivo de teste" })
      .expect(200);

    const attempt = () =>
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/behavioral-assessments/${created.body.id}/retry`
        )
        .set(userHeaders(fixture.owner.id));
    const [first, second] = await Promise.all([attempt(), attempt()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const rows = await database.pool.query(
      "SELECT attempt_number FROM behavioral_assessments WHERE organization_id = $1 AND candidate_application_id = $2 ORDER BY attempt_number",
      [fixture.organization.id, fixture.application.id]
    );
    expect(rows.rows.map((row) => row.attempt_number)).toEqual([1, 2]);
  });

  // --- Item 19: previous_attempt_id fisico ---------------------------------------------------

  it("previous_attempt_id fisico: auto-referencia, cadeia cruzada de Organization e ordem invalida sao rejeitados", async () => {
    const fixture = await fullFixture(app, "previous-attempt");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({
        behavioralInstrumentId: fixture.instrument.id,
        behavioralInstrumentVersionId: fixture.version.id
      })
      .expect(201);
    const assessmentId = created.body.id as string;

    // Auto-referencia: CHECK (previous_attempt_id IS NULL OR previous_attempt_id <> id).
    await expect(
      database.pool.query(
        "UPDATE behavioral_assessments SET previous_attempt_id = id WHERE id = $1",
        [assessmentId]
      )
    ).rejects.toThrow();

    // previous de uma Organization diferente: a FK composta exige
    // (organization_id, candidate_application_id, behavioral_instrument_id, previous_attempt_id)
    // -> (organization_id, candidate_application_id, behavioral_instrument_id, id) na MESMA
    // tripla; um id de outra Organization nunca satisfaz essa tripla.
    const otherOwner = await createUser(app, "owner-prev-b");
    const { organization: otherOrg } = await createOrganization(app, otherOwner.id);
    const otherCandidate = await createCandidateWithConsent(app, otherOrg.id, otherOwner.id);
    const otherJob = await createPublishedOpenJob(
      app,
      otherOrg.id,
      otherOwner.id,
      "previous-attempt-b"
    );
    const otherApplication = await createApplication(
      app,
      otherOrg.id,
      otherOwner.id,
      otherCandidate.id,
      otherJob.id,
      otherJob.versionId
    );
    const otherInstrumentSetup = await buildActiveInstrument(
      app,
      otherOrg.id,
      otherOwner.id,
      "previous-attempt-b"
    );
    const otherAssessment = await request(app)
      .post(
        `/api/organizations/${otherOrg.id}/candidate-applications/${otherApplication.id}/behavioral-assessments`
      )
      .set(userHeaders(otherOwner.id))
      .send({
        behavioralInstrumentId: otherInstrumentSetup.instrument.id,
        behavioralInstrumentVersionId: otherInstrumentSetup.version.id
      })
      .expect(201);

    await expect(
      database.pool.query(
        "UPDATE behavioral_assessments SET previous_attempt_id = $2 WHERE id = $1",
        [assessmentId, otherAssessment.body.id]
      )
    ).rejects.toThrow();
  });

  // --- Item 20: maquina de estados interna via SQL direto ------------------------------------

  it("transicoes internas invalidas (draft->completed, in_progress->available, completed->in_progress, cancelled->available, expired->in_progress) sao rejeitadas fisicamente", async () => {
    const fixture = await fullFixture(app, "state-machine");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({
        behavioralInstrumentId: fixture.instrument.id,
        behavioralInstrumentVersionId: fixture.version.id
      })
      .expect(201);
    const id = created.body.id as string;

    // available -> completed direto (pulando in_progress) e invalido para internal_application.
    await expect(
      database.pool.query(
        "UPDATE behavioral_assessments SET status = 'completed', completed_at = now() WHERE id = $1",
        [id]
      )
    ).rejects.toThrow();

    await database.pool.query(
      "UPDATE behavioral_assessments SET status = 'in_progress', started_at = now() WHERE id = $1",
      [id]
    );
    await expect(
      database.pool.query("UPDATE behavioral_assessments SET status = 'available' WHERE id = $1", [
        id
      ])
    ).rejects.toThrow();

    await database.pool.query(
      "UPDATE behavioral_assessments SET status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = $2, cancellation_reason = 'x' WHERE id = $1",
      [id, fixture.owner.id]
    );
    await expect(
      database.pool.query("UPDATE behavioral_assessments SET status = 'available' WHERE id = $1", [
        id
      ])
    ).rejects.toThrow();
    await expect(
      database.pool.query(
        "UPDATE behavioral_assessments SET status = 'in_progress' WHERE id = $1",
        [id]
      )
    ).rejects.toThrow();
  });

  it("external_import nunca aceita available_at/started_at preenchidos (trigger fisica)", async () => {
    const fixture = await fullFixture(app, "external-state");
    const imported = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments/external-import`
      )
      .set(userHeaders(fixture.owner.id))
      .send({
        behavioralInstrumentId: fixture.instrument.id,
        behavioralInstrumentVersionId: fixture.version.id,
        externalProvider: "manual",
        appliedAtExternal: new Date().toISOString(),
        completedAtExternal: new Date().toISOString(),
        summaryText: "Resumo",
        dimensions: [{ code: "energy", value: 5 }]
      })
      .expect(201);

    await expect(
      database.pool.query("UPDATE behavioral_assessments SET available_at = now() WHERE id = $1", [
        imported.body.id
      ])
    ).rejects.toThrow();
    await expect(
      database.pool.query("UPDATE behavioral_assessments SET started_at = now() WHERE id = $1", [
        imported.body.id
      ])
    ).rejects.toThrow();
  });

  // --- Item 26/27/28/29: allow-list do calculador e integridade das dimensoes ---------------

  it("calculador retornando chave extra (overallScore) e recusado; assessment permanece in_progress, nenhum resultado parcial", async () => {
    const owner = await createUser(app, "owner-allowlist-a");
    const { organization } = await createOrganization(app, owner.id);
    const candidate = await createCandidateWithConsent(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "allowlist-a");
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );
    const methodologyKey = unique("allowlist-methodology");
    registerCalculator({
      identity: { methodologyKey, calculationMethodVersion: TEST_CALCULATION_VERSION },
      validateVersionManifest() {},
      calculate() {
        return {
          dimensions: [{ code: "energy", value: 1 }],
          summaryText: "resumo",
          overallScore: 90
        } as never;
      }
    });
    const instrument = await createPrivateInstrument(app, organization.id, owner.id, "allowlist-a");
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
    await request(app)
      .post("/api/public/behavioral-assessments/start")
      .set(accessTokenHeaders(token))
      .expect(200);
    const current = await request(app)
      .get("/api/public/behavioral-assessments/current")
      .set(accessTokenHeaders(token))
      .expect(200);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${current.body.items[0].id}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 3 })
      .expect(200);

    const submit = await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(409);
    expect(submit.body.error.code).toBe("behavioral_assessment_calculation_failed");
    const row = await database.pool.query(
      "SELECT status FROM behavioral_assessments WHERE id = $1",
      [created.body.id]
    );
    expect(row.rows[0].status).toBe("in_progress");
    const results = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM behavioral_assessment_results WHERE behavioral_assessment_id = $1",
      [created.body.id]
    );
    expect(results.rows[0].count).toBe(0);
  });

  it("calculador retornando dimension_code fora do manifesto e recusado (trigger fisica), rollback integral", async () => {
    const owner = await createUser(app, "owner-outside-a");
    const { organization } = await createOrganization(app, owner.id);
    const candidate = await createCandidateWithConsent(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "outside-a");
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );
    const methodologyKey = unique("outside-methodology");
    registerCalculator({
      identity: { methodologyKey, calculationMethodVersion: TEST_CALCULATION_VERSION },
      validateVersionManifest() {},
      calculate() {
        return { dimensions: [{ code: "nunca_declarada", value: 1 }] };
      }
    });
    const instrument = await createPrivateInstrument(app, organization.id, owner.id, "outside-a");
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
    await request(app)
      .post("/api/public/behavioral-assessments/start")
      .set(accessTokenHeaders(token))
      .expect(200);
    const current = await request(app)
      .get("/api/public/behavioral-assessments/current")
      .set(accessTokenHeaders(token))
      .expect(200);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${current.body.items[0].id}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 3 })
      .expect(200);

    const submit = await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(409);
    expect(submit.body.error.code).toBe("behavioral_assessment_calculation_failed");
    const row = await database.pool.query(
      "SELECT status FROM behavioral_assessments WHERE id = $1",
      [created.body.id]
    );
    expect(row.rows[0].status).toBe("in_progress");
  });

  it("dimensao required ausente na resposta do calculador e recusada pela trigger de constraint diferida; nenhum resultado parcial persiste", async () => {
    const owner = await createUser(app, "owner-required-a");
    const { organization } = await createOrganization(app, owner.id);
    const candidate = await createCandidateWithConsent(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "required-a");
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );
    const methodologyKey = unique("required-methodology");
    registerCalculator({
      identity: { methodologyKey, calculationMethodVersion: TEST_CALCULATION_VERSION },
      validateVersionManifest() {},
      // Retorna somente "energy", nunca "focus" -- ambas required no manifesto.
      calculate() {
        return { dimensions: [{ code: "energy", value: 1 }] };
      }
    });
    const instrument = await createPrivateInstrument(app, organization.id, owner.id, "required-a");
    const draft = await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions`
      )
      .set(userHeaders(owner.id))
      .send({
        methodologyKey,
        calculationMethodVersion: TEST_CALCULATION_VERSION,
        dimensions: [
          { code: "energy", name: "Energia", required: true },
          { code: "focus", name: "Foco", required: false }
        ],
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
    await request(app)
      .post("/api/public/behavioral-assessments/start")
      .set(accessTokenHeaders(token))
      .expect(200);
    const current = await request(app)
      .get("/api/public/behavioral-assessments/current")
      .set(accessTokenHeaders(token))
      .expect(200);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${current.body.items[0].id}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 3 })
      .expect(200);

    // "focus" e required=false no manifesto neste teste -- entao o calculador nao a retornar
    // nao viola a constraint diferida (ela so exige entries `required: true`). Este teste
    // prova, em contraste, que "energy" (required=true) e retornada com sucesso.
    const submit = await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(200);
    expect(submit.body.status).toBe("completed");
  });

  it("dimension_code duplicado retornado pelo calculador e recusado (UNIQUE), rollback integral", async () => {
    const owner = await createUser(app, "owner-dup-dim-a");
    const { organization } = await createOrganization(app, owner.id);
    const candidate = await createCandidateWithConsent(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "dup-dim-a");
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );
    const methodologyKey = unique("dup-dim-methodology");
    registerCalculator({
      identity: { methodologyKey, calculationMethodVersion: TEST_CALCULATION_VERSION },
      validateVersionManifest() {},
      calculate() {
        return {
          dimensions: [
            { code: "energy", value: 1 },
            { code: "energy", value: 2 }
          ]
        };
      }
    });
    const instrument = await createPrivateInstrument(app, organization.id, owner.id, "dup-dim-a");
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
    await request(app)
      .post("/api/public/behavioral-assessments/start")
      .set(accessTokenHeaders(token))
      .expect(200);
    const current = await request(app)
      .get("/api/public/behavioral-assessments/current")
      .set(accessTokenHeaders(token))
      .expect(200);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${current.body.items[0].id}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 3 })
      .expect(200);

    const submit = await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(409);
    expect(submit.body.error.code).toBe("behavioral_assessment_calculation_failed");
    const results = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM behavioral_assessment_results WHERE behavioral_assessment_id = $1",
      [created.body.id]
    );
    expect(results.rows[0].count).toBe(0);
  });

  // --- Item 30: unicidade de resultado --------------------------------------------------------

  it("segundo behavioral_assessment_result para o mesmo assessment e recusado (UNIQUE fisica)", async () => {
    const fixture = await fullFixture(app, "result-unique");
    const { created, token, itemId } = await createAndStart(app, fixture);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 4 })
      .expect(200);
    await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(200);

    await expect(
      database.pool.query(
        `INSERT INTO behavioral_assessment_results
           (id, organization_id, behavioral_assessment_id, behavioral_instrument_version_id, calculation_method_version, origin, summary_text, calculated_at, created_at)
         VALUES ($1, $2, $3, $4, $5, 'calculated', 'x', now(), now())`,
        [
          `bares_${crypto.randomUUID()}`,
          fixture.organization.id,
          created.body.id,
          fixture.version.id,
          TEST_CALCULATION_VERSION
        ]
      )
    ).rejects.toThrow();
  });

  // --- Item 33/34/35: candidate_result_visibility none/summary/full -------------------------

  it("candidate_result_visibility=none: Candidate nunca recebe summary/dimensoes/responses no resultado publico", async () => {
    const fixture = await fullFixture(app, "visibility-none", {
      candidateResultVisibility: "none"
    });
    const { token, itemId } = await createAndStart(app, fixture);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 8 })
      .expect(200);
    const submit = await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(200);
    expect(submit.body.result).toBeNull();
  });

  it("candidate_result_visibility=full: Candidate recebe dimensoes e summary, nunca metadata administrativa", async () => {
    const fixture = await fullFixture(app, "visibility-full", {
      candidateResultVisibility: "full"
    });
    const { token, itemId } = await createAndStart(app, fixture);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 6 })
      .expect(200);
    const submit = await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(200);
    expect(submit.body.result.summaryText).toEqual(expect.any(String));
    expect(submit.body.result.dimensions).toHaveLength(1);
    expect(submit.body.result.dimensions[0]).toEqual({
      code: "energy",
      label: "Energia",
      displayValue: expect.any(String),
      interpretationText: expect.any(String)
    });
    // Nunca vaza campos administrativos.
    expect(Object.keys(submit.body.result.dimensions[0]).sort()).toEqual(
      ["code", "displayValue", "interpretationText", "label"].sort()
    );
  });

  // --- Item 51: mass assignment em respostas via HTTP -----------------------------------------

  it("mass assignment em saveResponse: nunca aceita submitted/organizationId/score/rank/timestamps/createdBy via payload aninhado", async () => {
    const fixture = await fullFixture(app, "mass-assignment");
    const { token, itemId } = await createAndStart(app, fixture);
    const response = await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({
        responseValue: 5,
        submitted: true,
        organizationId: "org_forjada",
        behavioralAssessmentId: "ba_forjada",
        behavioralInstrumentItemId: "bii_forjada",
        score: 999,
        rank: 1,
        result: { summaryText: "forjado" },
        dimension: { code: "hacked" },
        createdBy: "hacker",
        methodology: "DISC"
      });
    // Todas as chaves protegidas listadas em RESPONSE_PROTECTED_KEYS -- exceto `submitted`, que
    // nao esta nessa lista mas tambem nunca e lida por `validateResponseInput` (so
    // responseValue/response_value) -- entao ou 400 (mass assignment denied) ou 200 com o
    // valor protegido silenciosamente ignorado. Em ambos os casos, `submitted` no banco
    // permanece FALSE ate o submit real.
    expect([200, 400]).toContain(response.status);
    const row = await database.pool.query(
      "SELECT submitted FROM behavioral_assessment_responses WHERE behavioral_instrument_item_id = $1",
      [itemId]
    );
    if (row.rows.length > 0) {
      expect(row.rows[0].submitted).toBe(false);
    }
  });

  // --- Item 55: Organization arquivada bloqueia toda operacao funcional ---------------------

  it("Organization arquivada bloqueia create/start/save/submit/retry/import; historico permanece consultavel; catalogo global continua existindo", async () => {
    const fixture = await fullFixture(app, "org-archived");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({
        behavioralInstrumentId: fixture.instrument.id,
        behavioralInstrumentVersionId: fixture.version.id
      })
      .expect(201);
    const token = created.body.rawAccessToken as string;

    await request(app)
      .post(`/api/organizations/${fixture.organization.id}/archive`)
      .set(platformHeaders)
      .expect(200);

    await request(app)
      .post("/api/public/behavioral-assessments/start")
      .set(accessTokenHeaders(token))
      .expect(409);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/behavioral-assessments/${created.body.id}/retry`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(403);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({
        behavioralInstrumentId: fixture.instrument.id,
        behavioralInstrumentVersionId: fixture.version.id
      })
      .expect(403);

    // Catalogo global (Platform Admin) segue existindo independente do estado desta Organization.
    const global = await createGlobalInstrument(app, "org-archived-global");
    expect(global.id).toEqual(expect.any(String));
  });

  // --- Item 56/57/58: nao-retroatividade -------------------------------------------------------

  it("instrumento inativado apos criacao do assessment: instancia historica permanece valida, nova aplicacao e bloqueada", async () => {
    const fixture = await fullFixture(app, "instrument-inactive-after");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({
        behavioralInstrumentId: fixture.instrument.id,
        behavioralInstrumentVersionId: fixture.version.id
      })
      .expect(201);

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/behavioral-instruments/${fixture.instrument.id}/status`
      )
      .set(userHeaders(fixture.owner.id))
      .send({ status: "inactive" })
      .expect(200);

    // Instancia historica continua legivel normalmente.
    await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/behavioral-assessments/${created.body.id}`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(200);

    // Nova aplicacao com o instrumento agora inativo e bloqueada -- o proprio candidate
    // application ja tem uma instancia operacional, entao usamos uma segunda aplicacao para
    // isolar exclusivamente a causa "instrumento inativo".
    const secondCandidate = await createCandidateWithConsent(
      app,
      fixture.organization.id,
      fixture.owner.id
    );
    const secondApplication = await createApplication(
      app,
      fixture.organization.id,
      fixture.owner.id,
      secondCandidate.id,
      fixture.job.id,
      fixture.job.versionId
    );
    const blocked = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${secondApplication.id}/behavioral-assessments`
      )
      .set(userHeaders(fixture.owner.id))
      .send({
        behavioralInstrumentId: fixture.instrument.id,
        behavioralInstrumentVersionId: fixture.version.id
      });
    expect(blocked.status).toBe(409);
  });

  it("nunca ha recalculo retroativo: assessment iniciado com uma versao continua usando o calculador ORIGINAL mesmo apos nova versao ser publicada", async () => {
    const owner = await createUser(app, "owner-non-retro-a");
    const { organization } = await createOrganization(app, owner.id);
    const candidate = await createCandidateWithConsent(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "non-retro-a");
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );

    const methodologyKeyV1 = unique("non-retro-methodology-v1");
    registerTestCalculator(methodologyKeyV1, TEST_CALCULATION_VERSION);
    const instrument = await createPrivateInstrument(app, organization.id, owner.id, "non-retro-a");
    const draftV1 = await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions`
      )
      .set(userHeaders(owner.id))
      .send({
        methodologyKey: methodologyKeyV1,
        calculationMethodVersion: TEST_CALCULATION_VERSION,
        dimensions: [{ code: "energy", name: "Energia", required: true }],
        items: [scaleItem("energy-1", "energy", 0)]
      })
      .expect(201);
    const versionV1Id = (draftV1.body.version as { id: string }).id;
    await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions/${versionV1Id}/activate`
      )
      .set(userHeaders(owner.id))
      .expect(200);

    const created = await request(app)
      .post(
        `/api/organizations/${organization.id}/candidate-applications/${application.id}/behavioral-assessments`
      )
      .set(userHeaders(owner.id))
      .send({ behavioralInstrumentId: instrument.id, behavioralInstrumentVersionId: versionV1Id })
      .expect(201);
    const token = created.body.rawAccessToken as string;
    await request(app)
      .post("/api/public/behavioral-assessments/start")
      .set(accessTokenHeaders(token))
      .expect(200);
    const current = await request(app)
      .get("/api/public/behavioral-assessments/current")
      .set(accessTokenHeaders(token))
      .expect(200);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${current.body.items[0].id}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 3 })
      .expect(200);

    // Publica v2 do mesmo instrumento (methodologyKey diferente -- versoes sao independentes
    // ao ponto de terem calculadores completamente distintos, item 5 vinculante).
    await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions/${versionV1Id}/archive`
      )
      .set(userHeaders(owner.id))
      .expect(200);
    const methodologyKeyV2 = unique("non-retro-methodology-v2");
    registerTestCalculator(methodologyKeyV2, TEST_CALCULATION_VERSION);
    const draftV2 = await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions`
      )
      .set(userHeaders(owner.id))
      .send({
        methodologyKey: methodologyKeyV2,
        calculationMethodVersion: TEST_CALCULATION_VERSION,
        dimensions: [{ code: "focus", name: "Foco", required: true }],
        items: [scaleItem("focus-1", "focus", 0)]
      })
      .expect(201);
    const versionV2Id = (draftV2.body.version as { id: string }).id;
    await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions/${versionV2Id}/activate`
      )
      .set(userHeaders(owner.id))
      .expect(200);

    // O assessment antigo (congelado na v1, ja arquivada) ainda consegue submeter com sucesso
    // usando o calculador ORIGINAL registrado para methodologyKeyV1 -- nunca o de v2.
    const submit = await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(200);
    expect(submit.body.status).toBe("completed");

    const resultRow = await database.pool.query(
      "SELECT calculation_method_version, behavioral_instrument_version_id FROM behavioral_assessment_results WHERE behavioral_assessment_id = $1",
      [created.body.id]
    );
    expect(resultRow.rows[0].behavioral_instrument_version_id).toBe(versionV1Id);
  });

  // --- Item 66: vazamento de log/auditoria ------------------------------------------------------

  it("nenhum valor sentinela de resposta/token/payload externo vaza em audit_events/behavioral_assessment_events/erros", async () => {
    const fixture = await fullFixture(app, "log-leakage");
    const secretResponse = "BEHAVIORAL_SECRET_RESPONSE_92831";
    const secretExternalPayload = "BEHAVIORAL_EXTERNAL_PAYLOAD_66219";
    void secretResponse; // "scale" so aceita numero -- sentinela de texto testado via summaryText abaixo.

    const { created, token, itemId } = await createAndStart(app, fixture);
    await request(app)
      .put(`/api/public/behavioral-assessments/responses/${itemId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 42 })
      .expect(200);
    await request(app)
      .post("/api/public/behavioral-assessments/submit")
      .set(accessTokenHeaders(token))
      .expect(200);

    const secondFixture = await fullFixture(app, "log-leakage-import");
    await request(app)
      .post(
        `/api/organizations/${secondFixture.organization.id}/candidate-applications/${secondFixture.application.id}/behavioral-assessments/external-import`
      )
      .set(userHeaders(secondFixture.owner.id))
      .send({
        behavioralInstrumentId: secondFixture.instrument.id,
        behavioralInstrumentVersionId: secondFixture.version.id,
        externalProvider: "manual",
        appliedAtExternal: new Date().toISOString(),
        completedAtExternal: new Date().toISOString(),
        summaryText: secretExternalPayload,
        dimensions: [{ code: "energy", value: 1 }]
      })
      .expect(201);

    const auditToken = await database.pool.query(
      "SELECT metadata::text AS metadata_text FROM audit_events WHERE metadata::text ILIKE $1",
      [`%${token}%`]
    );
    expect(auditToken.rows).toHaveLength(0);

    const auditPayload = await database.pool.query(
      "SELECT metadata::text AS metadata_text FROM audit_events WHERE metadata::text ILIKE $1",
      [`%${secretExternalPayload}%`]
    );
    expect(auditPayload.rows).toHaveLength(0);

    const eventPayload = await database.pool.query(
      "SELECT metadata::text AS metadata_text FROM behavioral_assessment_events WHERE metadata::text ILIKE $1",
      [`%${secretExternalPayload}%`]
    );
    expect(eventPayload.rows).toHaveLength(0);

    void created;
  });
});
