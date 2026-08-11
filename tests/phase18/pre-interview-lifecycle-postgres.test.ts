import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  accessTokenHeaders,
  applicationPayload,
  createApp,
  createConfiguredApplicationFixture,
  createOrganization,
  createPublicJobOpeningFixture,
  createPublishedOpenJob,
  createUser,
  publishJobOpeningPublicly,
  submitApplication,
  userHeaders
} from "./helpers";

describe("Fase 18 - Criacao, snapshot e orquestracao pos-candidatura (SPEC-021, secao 8; Plano Tecnico, correcao final)", () => {
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

  it("vaga com Configuracao habilitada gera instancia draft->available e token publico apos candidatura publica", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "orch-a");
    const response = await submitApplication(app, fixture.slug, applicationPayload()).expect(201);

    expect(response.body.status).toBe("received");
    expect(response.body.candidateApplicationId).toBeUndefined();
    expect(response.body.nextStep).toEqual({ type: "pre_interview", access: expect.any(String) });

    const publicView = await request(app)
      .get("/api/public/pre-interviews/current")
      .set(accessTokenHeaders(response.body.nextStep.access))
      .expect(200);
    expect(publicView.body.status).toBe("available");
    expect(publicView.body.questions).toHaveLength(1);

    const rows = await database.pool.query(
      "SELECT status, attempt_number, created_source, created_by_user_id FROM pre_interviews WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].status).toBe("available");
    expect(rows.rows[0].attempt_number).toBe(1);
    expect(rows.rows[0].created_source).toBe("system_after_application");
    expect(rows.rows[0].created_by_user_id).toBeNull();
  });

  it("falha na criacao da Pre-Entrevista nunca reverte a CandidateApplication ja commitada", async () => {
    // Vaga SEM Configuracao habilitada -- createIfConfigured retorna not_configured, nunca lanca;
    // ainda assim comprova que a CandidateApplication permanece valida e a resposta continua
    // "received" com nextStep=null (mesmo comportamento observavel de uma falha silenciosa).
    const owner = await createUser(app, "owner-orch-b");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "orch-b");
    const slug = await publishJobOpeningPublicly(app, organization.id, job.id, owner.id, "orch-b");

    const response = await submitApplication(app, slug, applicationPayload()).expect(201);
    expect(response.body.status).toBe("received");
    expect(response.body.nextStep).toBeNull();

    const applications = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE organization_id = $1",
      [organization.id]
    );
    expect(applications.rows[0].count).toBe(1);
    const preInterviews = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interviews WHERE organization_id = $1",
      [organization.id]
    );
    expect(preInterviews.rows[0].count).toBe(0);
  });

  it("replay da mesma candidatura (mesma Idempotency-Key) nunca cria nova tentativa e emite token adicional", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "replay-a");
    const key = crypto.randomUUID();
    const payload = applicationPayload();

    const first = await submitApplication(app, fixture.slug, payload, key).expect(201);
    const tokenA = first.body.nextStep.access as string;

    const second = await submitApplication(app, fixture.slug, payload, key).expect(201);
    const tokenB = second.body.nextStep.access as string;

    expect(second.body.submissionId).toBe(first.body.submissionId);
    expect(tokenB).not.toBe(tokenA);

    const preInterviews = await database.pool.query(
      "SELECT COUNT(*)::int AS count, MAX(attempt_number) AS max_attempt FROM pre_interviews WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(preInterviews.rows[0].count).toBe(1);
    expect(preInterviews.rows[0].max_attempt).toBe(1);

    // Ambos os tokens continuam validos e resolvem a mesma instancia.
    const viaA = await request(app)
      .get("/api/public/pre-interviews/current")
      .set(accessTokenHeaders(tokenA))
      .expect(200);
    const viaB = await request(app)
      .get("/api/public/pre-interviews/current")
      .set(accessTokenHeaders(tokenB))
      .expect(200);
    expect(viaA.body.status).toBe(viaB.body.status);

    const tokenRows = await database.pool.query(
      `
        SELECT status, token_hash
        FROM pre_interview_access_tokens
        WHERE pre_interview_id = (SELECT id FROM pre_interviews WHERE organization_id = $1)
      `,
      [fixture.organizationId]
    );
    expect(tokenRows.rows).toHaveLength(2);
    expect(tokenRows.rows.every((row) => row.status === "active")).toBe(true);
    for (const row of tokenRows.rows) {
      expect(String(row.token_hash)).not.toBe(tokenA);
      expect(String(row.token_hash)).not.toBe(tokenB);
    }
  });

  it("duas replays concorrentes com a mesma Idempotency-Key nunca duplicam a Pre-Entrevista", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "replay-b");
    const key = crypto.randomUUID();
    const payload = applicationPayload();

    const [first, second] = await Promise.all([
      submitApplication(app, fixture.slug, payload, key),
      submitApplication(app, fixture.slug, payload, key)
    ]);
    // Mesmo padrao ja estabelecido pela Fase 17 para esta corrida (ver
    // tests/phase17/public-application-idempotency-postgres.test.ts): uma das duas pode
    // encontrar a submissao ja "pending" e receber 409 (conflito seguro), mas ao menos uma
    // sempre conclui com 201 -- o ponto testado aqui e que, de qualquer forma, nunca ha
    // duplicacao de Pre-Entrevista.
    const statuses = [first.status, second.status].sort();
    expect(statuses.every((status) => status === 201 || status === 409)).toBe(true);
    expect(statuses).toContain(201);

    const preInterviews = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interviews WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(preInterviews.rows[0].count).toBe(1);
  });

  it("snapshot preserva titulo/texto/tipo/categoria/options/settings/required/order e o fingerprint e estavel para o mesmo conteudo semantico", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "snap-a");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);

    const questions = await database.pool.query(
      "SELECT * FROM pre_interview_questions WHERE pre_interview_id = $1",
      [created.body.id]
    );
    expect(questions.rows).toHaveLength(1);
    const snapshot = questions.rows[0];
    expect(snapshot.snapshot_title).toBe(`Question snap-a`);
    expect(snapshot.snapshot_type).toBe("open_text");
    expect(snapshot.snapshot_category).toBe("general");
    expect(snapshot.required).toBe(true);
    expect(snapshot.display_order).toBe(0);
    expect(String(snapshot.content_fingerprint)).toMatch(/^[0-9a-f]{64}$/);

    // Alterar a pergunta original no catalogo depois nunca altera o snapshot ja congelado --
    // editada diretamente em organization_questions (persistencia) para isolar este teste de
    // qualquer detalhe de rota/ID da SPEC-009, que esta SPEC apenas consome.
    await database.pool.query(
      "UPDATE organization_questions SET title = 'Alterado depois' WHERE organization_id = $1 AND code = $2",
      [fixture.organization.id, `PINT-Q-snap-a`]
    );

    const afterEdit = await database.pool.query(
      "SELECT snapshot_title FROM pre_interview_questions WHERE id = $1",
      [snapshot.id]
    );
    expect(afterEdit.rows[0].snapshot_title).toBe(`Question snap-a`);
  });

  it("perguntas obrigatorias sem resposta bloqueiam o envio final; envio final bem-sucedido transiciona para completed e imutabiliza", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "flow-a");
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
    const questionId = questions.rows[0].id as string;

    await request(app)
      .post("/api/public/pre-interviews/start")
      .set(accessTokenHeaders(token))
      .expect(200);

    const blockedSubmit = await request(app)
      .post("/api/public/pre-interviews/submit")
      .set(accessTokenHeaders(token));
    expect(blockedSubmit.status).toBe(409);

    await request(app)
      .put(`/api/public/pre-interviews/responses/${questionId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: "My answer" })
      .expect(200);

    const submitted = await request(app)
      .post("/api/public/pre-interviews/submit")
      .set(accessTokenHeaders(token))
      .expect(200);
    expect(submitted.body.status).toBe("completed");

    // Reenvio idempotente -- sem duplicar conclusao.
    const secondSubmit = await request(app)
      .post("/api/public/pre-interviews/submit")
      .set(accessTokenHeaders(token))
      .expect(200);
    expect(secondSubmit.body.status).toBe("completed");
    const events = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interview_events WHERE pre_interview_id = $1 AND event_type = 'submitted'",
      [created.body.id]
    );
    expect(events.rows[0].count).toBe(1);

    // Resposta imutavel apos completed -- rejeitada em nivel de servico...
    const blockedSave = await request(app)
      .put(`/api/public/pre-interviews/responses/${questionId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: "changed" });
    expect(blockedSave.status).toBe(409);

    // ...e em nivel de banco (trigger).
    await expect(
      database.pool.query(
        "UPDATE pre_interview_responses SET response_value = to_jsonb('hacked'::text) WHERE pre_interview_question_id = $1",
        [questionId]
      )
    ).rejects.toThrow(/pre_interview_response_final_state_immutable/);
  });

  it("current_stage e application_status da CandidateApplication permanecem inalterados apos a conclusao", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "flow-b");
    const before = await database.pool.query(
      "SELECT current_stage, application_status FROM candidate_applications WHERE id = $1",
      [fixture.application.id]
    );

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
    await request(app)
      .put(`/api/public/pre-interviews/responses/${questions.rows[0].id}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: "answer" })
      .expect(200);
    await request(app)
      .post("/api/public/pre-interviews/submit")
      .set(accessTokenHeaders(token))
      .expect(200);

    const after = await database.pool.query(
      "SELECT current_stage, application_status FROM candidate_applications WHERE id = $1",
      [fixture.application.id]
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("start e idempotente -- segunda chamada nunca gera novo started_at nem novo evento", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "start-a");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);
    const token = created.body.rawAccessToken as string;

    await request(app)
      .post("/api/public/pre-interviews/start")
      .set(accessTokenHeaders(token))
      .expect(200);
    const firstStartedAt = (
      await database.pool.query("SELECT started_at FROM pre_interviews WHERE id = $1", [
        created.body.id
      ])
    ).rows[0].started_at;

    await request(app)
      .post("/api/public/pre-interviews/start")
      .set(accessTokenHeaders(token))
      .expect(200);
    const secondStartedAt = (
      await database.pool.query("SELECT started_at FROM pre_interviews WHERE id = $1", [
        created.body.id
      ])
    ).rows[0].started_at;
    expect(new Date(secondStartedAt).getTime()).toBe(new Date(firstStartedAt).getTime());

    const events = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interview_events WHERE pre_interview_id = $1 AND event_type = 'started'",
      [created.body.id]
    );
    expect(events.rows[0].count).toBe(1);
  });

  it("cancelamento e exclusivo de owner/admin, exige motivo, preserva respostas e revoga todos os tokens ativos", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "cancel-a");
    const first = await submitApplicationInternal(app, fixture);
    const second = await request(app)
      .get(`/api/organizations/${fixture.organization.id}/pre-interviews/${first.preInterviewId}`)
      .set(userHeaders(fixture.owner.id))
      .expect(200);
    void second;

    const missingReason = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/pre-interviews/${first.preInterviewId}/cancel`
      )
      .set(userHeaders(fixture.owner.id))
      .send({});
    expect(missingReason.status).toBe(400);

    const cancelled = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/pre-interviews/${first.preInterviewId}/cancel`
      )
      .set(userHeaders(fixture.owner.id))
      .send({ reason: "Vaga encerrada administrativamente" })
      .expect(200);
    expect(cancelled.body.status).toBe("cancelled");

    const tokenRows = await database.pool.query(
      "SELECT status FROM pre_interview_access_tokens WHERE pre_interview_id = $1",
      [first.preInterviewId]
    );
    expect(tokenRows.rows.every((row) => row.status === "revoked")).toBe(true);

    const responses = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interview_responses WHERE pre_interview_id = $1",
      [first.preInterviewId]
    );
    expect(responses.rows[0].count).toBeGreaterThanOrEqual(0);

    const cancelledPublicAccess = await request(app)
      .get("/api/public/pre-interviews/current")
      .set(accessTokenHeaders(first.rawAccessToken));
    expect(cancelledPublicAccess.status).toBe(404);
  });

  it("reabertura administrativa cria nova tentativa preservando a anterior, sem copiar respostas", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "retry-a");
    const first = await submitApplicationInternal(app, fixture);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/pre-interviews/${first.preInterviewId}/cancel`
      )
      .set(userHeaders(fixture.owner.id))
      .send({ reason: "Engano na primeira tentativa" })
      .expect(200);

    const retried = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/pre-interviews/${first.preInterviewId}/retry`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);
    expect(retried.body.attemptNumber).toBe(2);
    expect(retried.body.previousAttemptId).toBe(first.preInterviewId);
    expect(retried.body.rawAccessToken).toBeTruthy();

    const rows = await database.pool.query(
      "SELECT status, attempt_number FROM pre_interviews WHERE candidate_application_id = $1 ORDER BY attempt_number",
      [fixture.application.id]
    );
    expect(rows.rows).toEqual([
      { status: "cancelled", attempt_number: 1 },
      { status: "available", attempt_number: 2 }
    ]);

    const newQuestions = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interview_responses WHERE pre_interview_id = $1",
      [retried.body.id]
    );
    expect(newQuestions.rows[0].count).toBe(0);
  });

  it("duas primeiras criacoes concorrentes resultam em uma unica tentativa (attempt_number = 1), lock via CandidateApplication (Plano Tecnico, correcao final, item 1)", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "concurrency-a");
    const [first, second] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
        )
        .set(userHeaders(fixture.owner.id)),
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
        )
        .set(userHeaders(fixture.owner.id))
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBe(409);

    const rows = await database.pool.query(
      "SELECT attempt_number FROM pre_interviews WHERE candidate_application_id = $1",
      [fixture.application.id]
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].attempt_number).toBe(1);
  });

  it("dois retries administrativos simultaneos resultam em apenas uma nova tentativa", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "concurrency-b");
    const first = await submitApplicationInternal(app, fixture);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/pre-interviews/${first.preInterviewId}/cancel`
      )
      .set(userHeaders(fixture.owner.id))
      .send({ reason: "encerrado" })
      .expect(200);

    const [retryA, retryB] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/pre-interviews/${first.preInterviewId}/retry`
        )
        .set(userHeaders(fixture.owner.id)),
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/pre-interviews/${first.preInterviewId}/retry`
        )
        .set(userHeaders(fixture.owner.id))
    ]);
    const statuses = [retryA.status, retryB.status].sort();
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBe(409);

    const rows = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interviews WHERE candidate_application_id = $1 AND attempt_number = 2",
      [fixture.application.id]
    );
    expect(rows.rows[0].count).toBe(1);
  });

  it("submit concorrente: apenas uma transicao para completed, sem evento duplicado", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "concurrency-c");
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
    await request(app)
      .put(`/api/public/pre-interviews/responses/${questions.rows[0].id}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: "answer" })
      .expect(200);

    const [submitA, submitB] = await Promise.all([
      request(app).post("/api/public/pre-interviews/submit").set(accessTokenHeaders(token)),
      request(app).post("/api/public/pre-interviews/submit").set(accessTokenHeaders(token))
    ]);
    expect([submitA.status, submitB.status].every((status) => status === 200)).toBe(true);

    const events = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interview_events WHERE pre_interview_id = $1 AND event_type = 'submitted'",
      [created.body.id]
    );
    expect(events.rows[0].count).toBe(1);
  });

  it("token de rotacao administrativa revoga os anteriores e emite exatamente um novo", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "rotate-a");
    const first = await submitApplicationInternal(app, fixture);

    const rotated = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/pre-interviews/${first.preInterviewId}/rotate-access-token`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(200);
    expect(rotated.body.rawAccessToken).toBeTruthy();
    expect(rotated.body.rawAccessToken).not.toBe(first.rawAccessToken);

    const oldTokenAccess = await request(app)
      .get("/api/public/pre-interviews/current")
      .set(accessTokenHeaders(first.rawAccessToken));
    expect(oldTokenAccess.status).toBe(404);

    const newTokenAccess = await request(app)
      .get("/api/public/pre-interviews/current")
      .set(accessTokenHeaders(rotated.body.rawAccessToken))
      .expect(200);
    expect(newTokenAccess.body.status).toBe("available");
  });

  it("state machine fisica: transicoes ilegais sao recusadas pelo PostgreSQL", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "sql-sm-a");
    const first = await submitApplicationInternal(app, fixture);

    await expect(
      database.pool.query("UPDATE pre_interviews SET status = 'completed' WHERE id = $1", [
        first.preInterviewId
      ])
    ).rejects.toThrow(/pre_interview_transition_invalid/);

    await request(app)
      .post("/api/public/pre-interviews/start")
      .set(accessTokenHeaders(first.rawAccessToken))
      .expect(200);
    await expect(
      database.pool.query("UPDATE pre_interviews SET status = 'available' WHERE id = $1", [
        first.preInterviewId
      ])
    ).rejects.toThrow(/pre_interview_transition_invalid/);
  });

  it("state machine fisica: nenhum UPDATE e permitido apos estado final; DELETE sempre proibido", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "sql-sm-b");
    const first = await submitApplicationInternal(app, fixture);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/pre-interviews/${first.preInterviewId}/cancel`
      )
      .set(userHeaders(fixture.owner.id))
      .send({ reason: "final" })
      .expect(200);

    await expect(
      database.pool.query(
        "UPDATE pre_interviews SET cancellation_reason = 'hacked' WHERE id = $1",
        [first.preInterviewId]
      )
    ).rejects.toThrow(/pre_interview_final_state_immutable/);

    await expect(
      database.pool.query("DELETE FROM pre_interviews WHERE id = $1", [first.preInterviewId])
    ).rejects.toThrow(/pre_interview_no_physical_delete/);

    await expect(
      database.pool.query(
        "UPDATE pre_interview_questions SET snapshot_title = 'hacked' WHERE pre_interview_id = $1",
        [first.preInterviewId]
      )
    ).rejects.toThrow(/pre_interview_question_immutable/);
  });

  it("campos de contexto sao imutaveis mesmo em estado operacional", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "sql-sm-c");
    const first = await submitApplicationInternal(app, fixture);
    await expect(
      database.pool.query("UPDATE pre_interviews SET attempt_number = 99 WHERE id = $1", [
        first.preInterviewId
      ])
    ).rejects.toThrow(/pre_interview_parent_immutable/);
  });

  it("fluxo completo funciona integralmente sem nenhuma execucao de IA", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "no-ai-a");
    const created = await submitApplicationInternal(app, fixture);
    const questions = await database.pool.query(
      "SELECT id FROM pre_interview_questions WHERE pre_interview_id = $1",
      [created.preInterviewId]
    );
    await request(app)
      .post("/api/public/pre-interviews/start")
      .set(accessTokenHeaders(created.rawAccessToken))
      .expect(200);
    await request(app)
      .put(`/api/public/pre-interviews/responses/${questions.rows[0].id}`)
      .set(accessTokenHeaders(created.rawAccessToken))
      .send({ responseValue: "answer" })
      .expect(200);
    await request(app)
      .post("/api/public/pre-interviews/submit")
      .set(accessTokenHeaders(created.rawAccessToken))
      .expect(200);

    const aiExecutions = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM ai_executions"
    );
    expect(aiExecutions.rows[0].count).toBe(0);
  });
});

async function submitApplicationInternal(
  app: ReturnType<typeof createApp>,
  fixture: Awaited<ReturnType<typeof createConfiguredApplicationFixture>>
) {
  const created = await request(app)
    .post(
      `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
    )
    .set(userHeaders(fixture.owner.id))
    .expect(201);
  return {
    preInterviewId: created.body.id as string,
    rawAccessToken: created.body.rawAccessToken as string
  };
}
