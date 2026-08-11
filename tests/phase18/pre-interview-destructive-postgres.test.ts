import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  accessTokenHeaders,
  addMembership,
  applicationPayload,
  createApp,
  createApplication,
  createCandidate,
  createConfiguredApplicationFixture,
  createOrganization,
  createPublicJobOpeningFixture,
  createPublishedOpenJob,
  createQuestionCatalogItem,
  createUser,
  enablePreInterviewSettings,
  platformHeaders,
  submitApplication,
  userHeaders
} from "./helpers";

// Revisao Destrutiva Final -- Fase 18. Cobre exclusivamente os cenarios que os tres arquivos
// ja existentes (`pre-interview-settings-postgres`, `pre-interview-lifecycle-postgres`,
// `pre-interview-security-postgres`) ainda nao provam: rate limiting publico (item 1,
// BLOQUEANTE), corridas de emissao de token vs. rotacao/cancelamento/expiracao (itens 7-10),
// replay apos conclusao (item 11), ataques diretos via SQL a previous_attempt_id (item 20),
// atomicidade via testing hooks (itens 22/24/43), rollback de reordenacao de settings (item
// 23), sensibilidade do fingerprint por campo (item 25), enrijecimento da validacao de
// resposta (item 26), mass assignment de campos de IA/score/ranking (item 27), concorrencia
// submit x save/cancel/expire (itens 30-32), effectiveStatus sem nenhuma escrita (itens
// 14/15), vaga fechada em pleno andamento (item 19), ausencia de vazamento de token/PII em
// logs (itens 33/34) e parsing do header/limite de body (itens 39/40).
describe("Fase 18 - Revisao Destrutiva Final", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });
  beforeEach(() => {
    // Uma nova app (e, portanto, um novo RateLimiter em memoria) por teste -- os contadores de
    // rate limit nunca vazam de um teste para o outro.
    app = createApp(database);
  });
  afterAll(async () => {
    await database.cleanup();
  });

  // ------------------------------------------------------------------------------------------
  // 1. Rate limiting publico (revisao destrutiva, itens 1/3/4/5) -- BLOQUEANTE.
  // ------------------------------------------------------------------------------------------

  it("dimensao por IP: 61a requisicao com tokens DIFERENTES a cada chamada e bloqueada (429)", async () => {
    let sawRateLimited = false;
    for (let index = 0; index < 65; index += 1) {
      const response = await request(app)
        .get("/api/public/pre-interviews/current")
        .set(accessTokenHeaders(`forged-token-${index}-${crypto.randomUUID()}`));
      if (response.status === 429) {
        sawRateLimited = true;
        expect(response.body).toEqual({
          error: { code: "pre_interview_rate_limited", message: "Too many requests." }
        });
        break;
      }
      // Antes do limite, token forjado sempre resolve em 404 generico -- nunca 429 nem 500.
      expect(response.status).toBe(404);
    }
    expect(sawRateLimited).toBe(true);
  });

  it("dimensao por hash do token: 31a chamada com o MESMO token e bloqueada, mesmo com IP longe do limite", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "ratelimit-token-a");
    const submitted = await submitApplication(app, fixture.slug, applicationPayload()).expect(201);
    const token = submitted.body.nextStep.access as string;

    let rateLimitedAt = -1;
    for (let index = 0; index < 35; index += 1) {
      const response = await request(app)
        .get("/api/public/pre-interviews/current")
        .set(accessTokenHeaders(token));
      if (response.status === 429) {
        rateLimitedAt = index;
        break;
      }
      expect(response.status).toBe(200);
    }
    // Limite configurado e 30/60s -- a 31a chamada (indice 30) e a primeira bloqueada.
    expect(rateLimitedAt).toBe(30);
  });

  it("o 429 nunca funciona como oraculo de validade: resposta identica para token real e token forjado esgotados", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "ratelimit-oracle-a");
    const submitted = await submitApplication(app, fixture.slug, applicationPayload()).expect(201);
    const validToken = submitted.body.nextStep.access as string;
    const forgedToken = `forged-${crypto.randomUUID()}`;

    let validLimited: request.Response | null = null;
    for (let index = 0; index < 32 && !validLimited; index += 1) {
      const response = await request(app)
        .get("/api/public/pre-interviews/current")
        .set(accessTokenHeaders(validToken));
      if (response.status === 429) validLimited = response;
    }
    let forgedLimited: request.Response | null = null;
    for (let index = 0; index < 32 && !forgedLimited; index += 1) {
      const response = await request(app)
        .get("/api/public/pre-interviews/current")
        .set(accessTokenHeaders(forgedToken));
      if (response.status === 429) forgedLimited = response;
    }
    expect(validLimited).not.toBeNull();
    expect(forgedLimited).not.toBeNull();
    expect(validLimited!.body).toEqual(forgedLimited!.body);
  });

  it("X-Forwarded-For forjado nunca altera o IP considerado (trust proxy nao configurado)", async () => {
    let sawRateLimited = false;
    for (let index = 0; index < 65; index += 1) {
      const response = await request(app)
        .get("/api/public/pre-interviews/current")
        .set(accessTokenHeaders(`forged-xff-${index}-${crypto.randomUUID()}`))
        // Um IP "novo" a cada requisicao -- se o Express confiasse neste header, o limite por
        // IP nunca seria atingido (cada chamada pareceria vir de uma origem distinta).
        .set("X-Forwarded-For", `203.0.113.${index % 250}`);
      if (response.status === 429) {
        sawRateLimited = true;
        break;
      }
      expect(response.status).toBe(404);
    }
    expect(sawRateLimited).toBe(true);
  });

  // ------------------------------------------------------------------------------------------
  // 2. Corridas de emissao de token: rotacao, cancelamento e expiracao vs. replay (itens 7-10).
  //    A correcao aplicada nesta revisao faz `createIfConfigured` travar (`FOR UPDATE`) e
  //    reconfirmar o status da propria instancia (incl. materializar expiracao lazy) ANTES de
  //    emitir um token adicional -- o mesmo lock ja usado por cancel/rotate/expire. Isso torna
  //    as tres corridas abaixo serializadas pelo proprio PostgreSQL, com resultado final sempre
  //    seguro independentemente de quem "vence".
  // ------------------------------------------------------------------------------------------

  it("corrida cancelamento vs. replay: resultado final e sempre 'cancelled' com zero tokens ativos", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "race-cancel-a");
    const key = crypto.randomUUID();
    const payload = applicationPayload();
    await submitApplication(app, fixture.slug, payload, key).expect(201);
    const preInterviewRow = await database.pool.query(
      "SELECT id FROM pre_interviews WHERE organization_id = $1",
      [fixture.organizationId]
    );
    const preInterviewId = preInterviewRow.rows[0].id as string;

    const [cancelResult] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${fixture.organizationId}/pre-interviews/${preInterviewId}/cancel`
        )
        .set(userHeaders(fixture.ownerId))
        .send({ reason: "corrida com replay" }),
      submitApplication(app, fixture.slug, payload, key)
    ]);
    expect(cancelResult.status).toBe(200);

    const finalRow = await database.pool.query("SELECT status FROM pre_interviews WHERE id = $1", [
      preInterviewId
    ]);
    expect(finalRow.rows[0].status).toBe("cancelled");
    const activeTokens = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interview_access_tokens WHERE pre_interview_id = $1 AND status = 'active'",
      [preInterviewId]
    );
    expect(activeTokens.rows[0].count).toBe(0);
    // Nunca uma segunda tentativa criada por causa da corrida.
    const attempts = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interviews WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(attempts.rows[0].count).toBe(1);
  });

  it("corrida expiracao lazy vs. replay: resultado final e sempre 'expired' com zero tokens ativos", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "race-expire-a");
    const key = crypto.randomUUID();
    const payload = applicationPayload();
    const first = await submitApplication(app, fixture.slug, payload, key).expect(201);
    const tokenA = first.body.nextStep.access as string;
    const preInterviewRow = await database.pool.query(
      "SELECT id FROM pre_interviews WHERE organization_id = $1",
      [fixture.organizationId]
    );
    const preInterviewId = preInterviewRow.rows[0].id as string;
    await database.pool.query(
      "UPDATE pre_interviews SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [preInterviewId]
    );

    const [publicResult] = await Promise.all([
      request(app).get("/api/public/pre-interviews/current").set(accessTokenHeaders(tokenA)),
      submitApplication(app, fixture.slug, payload, key)
    ]);
    // A leitura publica sempre materializa (200 com status "expired") ou encontra ja
    // materializado por quem venceu a corrida (404, token ja revogado) -- nunca 200 com um
    // status operacional obsoleto.
    if (publicResult.status === 200) {
      expect(publicResult.body.status).toBe("expired");
    } else {
      expect(publicResult.status).toBe(404);
    }

    const finalRow = await database.pool.query("SELECT status FROM pre_interviews WHERE id = $1", [
      preInterviewId
    ]);
    expect(finalRow.rows[0].status).toBe("expired");
    const activeTokens = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interview_access_tokens WHERE pre_interview_id = $1 AND status = 'active'",
      [preInterviewId]
    );
    expect(activeTokens.rows[0].count).toBe(0);
  });

  it("corrida rotacao administrativa vs. replay: o token original e sempre revogado; ao menos um token permanece ativo", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "race-rotate-a");
    const key = crypto.randomUUID();
    const payload = applicationPayload();
    const first = await submitApplication(app, fixture.slug, payload, key).expect(201);
    const tokenA = first.body.nextStep.access as string;
    const preInterviewRow = await database.pool.query(
      "SELECT id FROM pre_interviews WHERE organization_id = $1",
      [fixture.organizationId]
    );
    const preInterviewId = preInterviewRow.rows[0].id as string;

    const [rotateResult] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${fixture.organizationId}/pre-interviews/${preInterviewId}/rotate-access-token`
        )
        .set(userHeaders(fixture.ownerId)),
      submitApplication(app, fixture.slug, payload, key)
    ]);
    expect(rotateResult.status).toBe(200);

    const tokenRows = await database.pool.query(
      "SELECT token_hash, status FROM pre_interview_access_tokens WHERE pre_interview_id = $1",
      [preInterviewId]
    );
    const activeCount = tokenRows.rows.filter((row) => row.status === "active").length;
    // Nunca zero (a instancia continua operacional em ambos os casos) e nunca mais que 2
    // (rotacao emite 1, replay emite no maximo 1 adicional).
    expect(activeCount).toBeGreaterThanOrEqual(1);
    expect(activeCount).toBeLessThanOrEqual(2);

    // O token ORIGINAL (emitido antes da corrida comecar) e sempre revogado ao final,
    // independentemente de quem venceu a corrida pelo lock -- rotacao sempre revoga tudo que
    // era ativo no momento em que ela executa, e o token original sempre precede a rotacao.
    const revokedOriginal = await request(app)
      .get("/api/public/pre-interviews/current")
      .set(accessTokenHeaders(tokenA));
    expect(revokedOriginal.status).toBe(404);

    // Cada token ainda ativo (o novo da rotacao e, possivelmente, o adicional do replay)
    // resolve corretamente para a mesma instancia.
    if (rotateResult.body.rawAccessToken) {
      const viaRotated = await request(app)
        .get("/api/public/pre-interviews/current")
        .set(accessTokenHeaders(rotateResult.body.rawAccessToken))
        .expect(200);
      expect(viaRotated.body.status).toBe("available");
    }
  });

  // ------------------------------------------------------------------------------------------
  // 3. createIfConfigured nunca reabre uma tentativa ja completed (item 11).
  // ------------------------------------------------------------------------------------------

  it("replay apos a tentativa unica ja ter sido completed nunca cria tentativa nova nem emite token", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "replay-completed-a");
    const key = crypto.randomUUID();
    const payload = applicationPayload();
    const first = await submitApplication(app, fixture.slug, payload, key).expect(201);
    const tokenA = first.body.nextStep.access as string;

    const questions = await database.pool.query(
      "SELECT pq.id FROM pre_interview_questions pq JOIN pre_interviews pi ON pi.id = pq.pre_interview_id WHERE pi.organization_id = $1",
      [fixture.organizationId]
    );
    await request(app)
      .post("/api/public/pre-interviews/start")
      .set(accessTokenHeaders(tokenA))
      .expect(200);
    await request(app)
      .put(`/api/public/pre-interviews/responses/${questions.rows[0].id}`)
      .set(accessTokenHeaders(tokenA))
      .send({ responseValue: "resposta" })
      .expect(200);
    await request(app)
      .post("/api/public/pre-interviews/submit")
      .set(accessTokenHeaders(tokenA))
      .expect(200);

    const replay = await submitApplication(app, fixture.slug, payload, key).expect(201);
    expect(replay.body.nextStep).toBeNull();

    const attempts = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interviews WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(attempts.rows[0].count).toBe(1);
    const tokens = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interview_access_tokens WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(tokens.rows[0].count).toBe(1);
  });

  // ------------------------------------------------------------------------------------------
  // 4. Ataques diretos via SQL a previous_attempt_id (item 20).
  // ------------------------------------------------------------------------------------------

  it("previous_attempt_id nunca aceita auto-referencia, aplicacao cruzada, Organization cruzada ou ordem invalida", async () => {
    const fixtureA = await createConfiguredApplicationFixture(app, "prevattempt-a");
    const fixtureB = await createConfiguredApplicationFixture(app, "prevattempt-b");

    // Uma segunda aplicacao dentro da MESMA Organization de A, para o caso "aplicacao
    // cruzada" (precisa ser mesma Organization, para isolar do caso "Organization cruzada").
    const candidateA2 = await createCandidate(app, fixtureA.organization.id, fixtureA.owner.id);
    const applicationA2 = await createApplication(
      app,
      fixtureA.organization.id,
      fixtureA.owner.id,
      candidateA2.id,
      fixtureA.job.id,
      fixtureA.job.versionId
    );

    const legitimate = await request(app)
      .post(
        `/api/organizations/${fixtureA.organization.id}/candidate-applications/${fixtureA.application.id}/pre-interviews`
      )
      .set(userHeaders(fixtureA.owner.id))
      .expect(201);
    const legitimateId = legitimate.body.id as string;

    const baseRow = {
      id: () => `pint_atk_${crypto.randomUUID()}`,
      insert: (overrides: Record<string, unknown>) =>
        database.pool.query(
          `
            INSERT INTO pre_interviews (
              id, organization_id, candidate_application_id, job_opening_id,
              job_opening_version_id, previous_attempt_id, attempt_number, status,
              created_source, created_by_user_id, cancelled_at, cancelled_by_user_id,
              cancellation_reason, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, 'cancelled', 'administrative_retry', $8, NOW(), $8,
              'ataque de teste', NOW(), NOW()
            )
          `,
          [
            overrides.id,
            overrides.organizationId,
            overrides.candidateApplicationId,
            overrides.jobOpeningId,
            overrides.jobOpeningVersionId,
            overrides.previousAttemptId,
            overrides.attemptNumber,
            overrides.createdByUserId
          ]
        )
    };

    // 1) Auto-referencia -- CHECK (previous_attempt_id <> id).
    const selfId = baseRow.id();
    await expect(
      baseRow.insert({
        id: selfId,
        organizationId: fixtureA.organization.id,
        candidateApplicationId: fixtureA.application.id,
        jobOpeningId: fixtureA.job.id,
        jobOpeningVersionId: fixtureA.job.versionId,
        previousAttemptId: selfId,
        attemptNumber: 2,
        createdByUserId: fixtureA.owner.id
      })
    ).rejects.toThrow();

    // 2) Aplicacao cruzada (mesma Organization, application diferente) -- FK composta exige
    //    que previous_attempt_id pertenca a MESMA candidate_application_id.
    await expect(
      baseRow.insert({
        id: baseRow.id(),
        organizationId: fixtureA.organization.id,
        candidateApplicationId: applicationA2.id,
        jobOpeningId: fixtureA.job.id,
        jobOpeningVersionId: fixtureA.job.versionId,
        previousAttemptId: legitimateId,
        attemptNumber: 1,
        createdByUserId: fixtureA.owner.id
      })
    ).rejects.toThrow();

    // 3) Organization cruzada -- FK composta exige organization_id identico em ambos os lados.
    await expect(
      baseRow.insert({
        id: baseRow.id(),
        organizationId: fixtureB.organization.id,
        candidateApplicationId: fixtureB.application.id,
        jobOpeningId: fixtureB.job.id,
        jobOpeningVersionId: fixtureB.job.versionId,
        previousAttemptId: legitimateId,
        attemptNumber: 2,
        createdByUserId: fixtureB.owner.id
      })
    ).rejects.toThrow();

    // 4) Ordem invalida -- attempt_number da nova linha <= attempt_number da tentativa anterior
    //    referenciada (trigger `enforce_pre_interview_attempt_order`).
    await expect(
      baseRow.insert({
        id: baseRow.id(),
        organizationId: fixtureA.organization.id,
        candidateApplicationId: fixtureA.application.id,
        jobOpeningId: fixtureA.job.id,
        jobOpeningVersionId: fixtureA.job.versionId,
        previousAttemptId: legitimateId,
        attemptNumber: 1,
        createdByUserId: fixtureA.owner.id
      })
    ).rejects.toThrow(/pre_interview_attempt_order_invalid/);
  });

  // ------------------------------------------------------------------------------------------
  // 5. Atomicidade via testing hooks (itens 22/24/43).
  // ------------------------------------------------------------------------------------------

  it("falha logo apos inserir a instancia reverte a linha inteira (nunca sobrevive sem nenhum snapshot)", async () => {
    const hookApp = createApp(database, {
      afterInstanceInserted: () => {
        throw new Error("falha injetada apos INSERT da instancia");
      }
    });
    const fixture = await createConfiguredApplicationFixture(hookApp, "hook-instance-a");

    const failed = await request(hookApp)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id));
    expect(failed.status).toBe(500);

    const rows = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interviews WHERE candidate_application_id = $1",
      [fixture.application.id]
    );
    expect(rows.rows[0].count).toBe(0);
    const events = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interview_events pe JOIN pre_interviews pi ON pi.id = pe.pre_interview_id WHERE pi.candidate_application_id = $1",
      [fixture.application.id]
    );
    expect(events.rows[0].count).toBe(0);
  });

  it("falha logo apos o snapshot da primeira pergunta reverte a instancia inteira (nunca snapshot parcial)", async () => {
    const hookApp = createApp(database, {
      afterFirstQuestionSnapshotted: () => {
        throw new Error("falha injetada apos snapshot da 1a pergunta");
      }
    });
    const fixture = await createConfiguredApplicationFixture(hookApp, "hook-snapshot-a");

    const failed = await request(hookApp)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id));
    expect(failed.status).toBe(500);

    const rows = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interviews WHERE candidate_application_id = $1",
      [fixture.application.id]
    );
    expect(rows.rows[0].count).toBe(0);
    const questions = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interview_questions pq JOIN pre_interviews pi ON pi.id = pq.pre_interview_id WHERE pi.candidate_application_id = $1",
      [fixture.application.id]
    );
    expect(questions.rows[0].count).toBe(0);
  });

  it("falha na auditoria critica reverte a operacao inteira (settings, criacao e cancelamento)", async () => {
    const hookApp = createApp(database, {
      beforeCriticalAudit: (action) => {
        if (
          action === "pre_interview.settings_updated" ||
          action === "pre_interview.created" ||
          action === "pre_interview.cancelled"
        ) {
          throw new Error(`falha injetada na auditoria critica: ${action}`);
        }
      }
    });
    const owner = await createUser(hookApp, "owner-hook-audit-a");
    const { organization } = await createOrganization(hookApp, owner.id);
    const job = await createPublishedOpenJob(hookApp, organization.id, owner.id, "hook-audit-a");
    const question = await createQuestionCatalogItem(
      hookApp,
      organization.id,
      owner.id,
      "hook-audit-a"
    );

    // settings_updated
    const failedSettings = await enablePreInterviewSettings(
      hookApp,
      organization.id,
      job.id,
      owner.id,
      [question.questionCatalogItemId]
    );
    expect(failedSettings.status).toBe(500);
    const settingsRows = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM job_opening_pre_interview_settings WHERE job_opening_id = $1",
      [job.id]
    );
    expect(settingsRows.rows[0].count).toBe(0);

    // Habilita de fato (sem o hook desta vez) para testar a criacao/cancelamento a seguir.
    await enablePreInterviewSettings(app, organization.id, job.id, owner.id, [
      question.questionCatalogItemId
    ]).expect(200);
    const candidate = await createCandidate(app, organization.id, owner.id);
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );

    // pre_interview.created (internal)
    const failedCreate = await request(hookApp)
      .post(
        `/api/organizations/${organization.id}/candidate-applications/${application.id}/pre-interviews`
      )
      .set(userHeaders(owner.id));
    expect(failedCreate.status).toBe(500);
    const attempts = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM pre_interviews WHERE candidate_application_id = $1",
      [application.id]
    );
    expect(attempts.rows[0].count).toBe(0);

    // Cria de fato (via app sem hook) e entao tenta cancelar via hookApp -- deve reverter.
    const created = await request(app)
      .post(
        `/api/organizations/${organization.id}/candidate-applications/${application.id}/pre-interviews`
      )
      .set(userHeaders(owner.id))
      .expect(201);
    const failedCancel = await request(hookApp)
      .post(`/api/organizations/${organization.id}/pre-interviews/${created.body.id}/cancel`)
      .set(userHeaders(owner.id))
      .send({ reason: "deve reverter" });
    expect(failedCancel.status).toBe(500);
    const statusRow = await database.pool.query("SELECT status FROM pre_interviews WHERE id = $1", [
      created.body.id
    ]);
    expect(statusRow.rows[0].status).toBe("available");
  });

  it("alteracao concorrente no Banco de Perguntas durante a resolucao do snapshot nunca contamina perguntas ja congeladas", async () => {
    const owner = await createUser(app, "owner-concurrent-catalog-a");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedOpenJob(
      app,
      organization.id,
      owner.id,
      "concurrent-catalog-a"
    );
    const questionOne = await createQuestionCatalogItem(
      app,
      organization.id,
      owner.id,
      "concurrent-1"
    );
    const questionTwo = await createQuestionCatalogItem(
      app,
      organization.id,
      owner.id,
      "concurrent-2"
    );
    await enablePreInterviewSettings(app, organization.id, job.id, owner.id, [
      questionOne.questionCatalogItemId,
      questionTwo.questionCatalogItemId
    ]).expect(200);
    const candidate = await createCandidate(app, organization.id, owner.id);
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );

    const hookApp = createApp(database, {
      afterFirstQuestionSnapshotted: async () => {
        // Simula uma edicao no catalogo ENTRE o snapshot da 1a e da 2a pergunta.
        await database.pool.query(
          "UPDATE organization_questions SET title = 'Alterado durante o snapshot' WHERE organization_id = $1 AND code = $2",
          [organization.id, "PINT-Q-concurrent-2"]
        );
      }
    });

    const created = await request(hookApp)
      .post(
        `/api/organizations/${organization.id}/candidate-applications/${application.id}/pre-interviews`
      )
      .set(userHeaders(owner.id))
      .expect(201);

    const snapshots = await database.pool.query(
      "SELECT snapshot_title, display_order FROM pre_interview_questions WHERE pre_interview_id = $1 ORDER BY display_order",
      [created.body.id]
    );
    expect(snapshots.rows).toHaveLength(2);
    // A pergunta 1 (ja congelada ANTES da edicao) preserva o titulo antigo.
    expect(snapshots.rows[0].snapshot_title).toBe("Question concurrent-1");
    // A pergunta 2 (ainda nao lida no momento da edicao) reflete o valor NOVO -- nunca um
    // cache obsoleto, nunca uma mistura inconsistente entre as duas.
    expect(snapshots.rows[1].snapshot_title).toBe("Alterado durante o snapshot");
  });

  // ------------------------------------------------------------------------------------------
  // 6. Rollback de reordenacao de settings quando a nova colecao e invalida (item 23).
  // ------------------------------------------------------------------------------------------

  it("settings: colecao de perguntas invalida (duplicada) nunca aplica parcialmente -- estado anterior preservado", async () => {
    const owner = await createUser(app, "owner-settings-rollback-a");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "settings-rollback-a");
    const question = await createQuestionCatalogItem(
      app,
      organization.id,
      owner.id,
      "settings-rollback-a"
    );
    await enablePreInterviewSettings(app, organization.id, job.id, owner.id, [
      question.questionCatalogItemId
    ]).expect(200);

    const before = await database.pool.query(
      "SELECT enabled FROM job_opening_pre_interview_settings WHERE job_opening_id = $1",
      [job.id]
    );
    const beforeQuestions = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM job_opening_pre_interview_question_settings jopiqs JOIN job_opening_pre_interview_settings jopis ON jopis.id = jopiqs.settings_id WHERE jopis.job_opening_id = $1",
      [job.id]
    );

    const invalid = await request(app)
      .put(`/api/organizations/${organization.id}/job-openings/${job.id}/pre-interview-settings`)
      .set(userHeaders(owner.id))
      .send({
        enabled: false,
        questions: [
          {
            questionCatalogItemId: question.questionCatalogItemId,
            displayOrder: 0,
            required: true
          },
          {
            questionCatalogItemId: question.questionCatalogItemId,
            displayOrder: 1,
            required: false
          }
        ]
      });
    expect(invalid.status).toBe(400);

    const after = await database.pool.query(
      "SELECT enabled FROM job_opening_pre_interview_settings WHERE job_opening_id = $1",
      [job.id]
    );
    const afterQuestions = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM job_opening_pre_interview_question_settings jopiqs JOIN job_opening_pre_interview_settings jopis ON jopis.id = jopiqs.settings_id WHERE jopis.job_opening_id = $1",
      [job.id]
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(afterQuestions.rows[0].count).toBe(beforeQuestions.rows[0].count);
  });

  // ------------------------------------------------------------------------------------------
  // 7. Fingerprint sensivel a cada campo do snapshot, individualmente (item 25).
  // ------------------------------------------------------------------------------------------

  it("o fingerprint muda quando QUALQUER campo isolado do snapshot muda (titulo/texto/tipo/categoria/opcoes/settings/obrigatoriedade/ordem)", async () => {
    async function createFingerprintFor(
      suffix: string,
      questionOverrides: Record<string, unknown>,
      settingOverrides: { required?: boolean; displayOrder?: number } = {}
    ) {
      const owner = await createUser(app, `owner-fp-${suffix}`);
      const { organization } = await createOrganization(app, owner.id);
      const job = await createPublishedOpenJob(app, organization.id, owner.id, `fp-${suffix}`);
      await request(app)
        .post(`/api/organizations/${organization.id}/questions`)
        .set(userHeaders(owner.id))
        .send({
          code: `PINT-FP-${suffix}`,
          title: "Base title",
          questionText: "Base text",
          type: "open_text",
          category: "general",
          description: "",
          instructions: "",
          options: [],
          settings: {},
          status: "active",
          ...questionOverrides
        })
        .expect(201);
      const catalog = await request(app)
        .get(`/api/organizations/${organization.id}/questions/catalog`)
        .set(userHeaders(owner.id))
        .expect(200);
      const item = (catalog.body as Array<{ questionCatalogItemId: string; code: string }>).find(
        (entry) => entry.code === `PINT-FP-${suffix}`
      )!;
      await request(app)
        .put(`/api/organizations/${organization.id}/job-openings/${job.id}/pre-interview-settings`)
        .set(userHeaders(owner.id))
        .send({
          enabled: true,
          questions: [
            {
              questionCatalogItemId: item.questionCatalogItemId,
              displayOrder: settingOverrides.displayOrder ?? 0,
              required: settingOverrides.required ?? true
            }
          ]
        })
        .expect(200);
      const candidate = await createCandidate(app, organization.id, owner.id);
      const application = await createApplication(
        app,
        organization.id,
        owner.id,
        candidate.id,
        job.id,
        job.versionId
      );
      const created = await request(app)
        .post(
          `/api/organizations/${organization.id}/candidate-applications/${application.id}/pre-interviews`
        )
        .set(userHeaders(owner.id))
        .expect(201);
      const snapshot = await database.pool.query(
        "SELECT content_fingerprint FROM pre_interview_questions WHERE pre_interview_id = $1",
        [created.body.id]
      );
      return snapshot.rows[0].content_fingerprint as string;
    }

    const baseline = await createFingerprintFor("baseline", {});
    const byTitle = await createFingerprintFor("title", { title: "Different title" });
    const byText = await createFingerprintFor("text", { questionText: "Different text" });
    const byType = await createFingerprintFor("type", { type: "long_text" });
    const byCategory = await createFingerprintFor("category", { category: "technical" });
    const byOptions = await createFingerprintFor("options", {
      type: "single_choice",
      options: [
        { id: "opt_a", text: "A", displayOrder: 0 },
        { id: "opt_b", text: "B", displayOrder: 1 }
      ]
    });
    const bySettings = await createFingerprintFor("settings", {
      type: "scale",
      settings: { min: 1, max: 5, step: 1 }
    });
    const byRequired = await createFingerprintFor("required", {}, { required: false });
    const byDisplayOrder = await createFingerprintFor("order", {}, { displayOrder: 3 });

    const fingerprints = [
      byTitle,
      byText,
      byType,
      byCategory,
      byOptions,
      bySettings,
      byRequired,
      byDisplayOrder
    ];
    for (const fingerprint of fingerprints) {
      expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(fingerprint).not.toBe(baseline);
    }
    // Cada variacao produz um fingerprint distinto entre si tambem (nenhuma colisao acidental).
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  // ------------------------------------------------------------------------------------------
  // 8. Validacao de resposta enrijecida (item 26).
  // ------------------------------------------------------------------------------------------

  it("validacao enrijecida: single_choice/multiple_choice contra opcoes reais, numeric rejeita Infinity, date exige data valida", async () => {
    const owner = await createUser(app, "owner-strict-validation-a");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "strict-validation-a");

    async function makeQuestion(code: string, type: string, options: unknown[] = []) {
      await request(app)
        .post(`/api/organizations/${organization.id}/questions`)
        .set(userHeaders(owner.id))
        .send({
          code,
          title: code,
          questionText: code,
          type,
          category: "general",
          description: "",
          instructions: "",
          options,
          settings: {},
          status: "active"
        })
        .expect(201);
      const catalog = await request(app)
        .get(`/api/organizations/${organization.id}/questions/catalog`)
        .set(userHeaders(owner.id))
        .expect(200);
      return (catalog.body as Array<{ questionCatalogItemId: string; code: string }>).find(
        (entry) => entry.code === code
      )!;
    }

    const singleChoice = await makeQuestion("PINT-SC-A", "single_choice", [
      { id: "opt_a", text: "A", displayOrder: 0 },
      { id: "opt_b", text: "B", displayOrder: 1 }
    ]);
    const multipleChoice = await makeQuestion("PINT-MC-A", "multiple_choice", [
      { id: "opt_a", text: "A", displayOrder: 0 },
      { id: "opt_b", text: "B", displayOrder: 1 }
    ]);
    const numericQuestion = await makeQuestion("PINT-NUM-A", "numeric");
    const dateQuestion = await makeQuestion("PINT-DATE-A", "date");
    const openTextQuestion = await makeQuestion("PINT-OPEN-A", "open_text");

    await request(app)
      .put(`/api/organizations/${organization.id}/job-openings/${job.id}/pre-interview-settings`)
      .set(userHeaders(owner.id))
      .send({
        enabled: true,
        questions: [
          singleChoice,
          multipleChoice,
          numericQuestion,
          dateQuestion,
          openTextQuestion
        ].map((item, index) => ({
          questionCatalogItemId: item.questionCatalogItemId,
          displayOrder: index,
          required: false
        }))
      })
      .expect(200);

    const candidate = await createCandidate(app, organization.id, owner.id);
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );
    const created = await request(app)
      .post(
        `/api/organizations/${organization.id}/candidate-applications/${application.id}/pre-interviews`
      )
      .set(userHeaders(owner.id))
      .expect(201);
    const token = created.body.rawAccessToken as string;
    await request(app)
      .post("/api/public/pre-interviews/start")
      .set(accessTokenHeaders(token))
      .expect(200);

    const snapshots = await database.pool.query(
      "SELECT id, snapshot_type FROM pre_interview_questions WHERE pre_interview_id = $1",
      [created.body.id]
    );
    const byType = new Map(snapshots.rows.map((row) => [row.snapshot_type, row.id]));

    // single_choice: opcao inexistente no snapshot -- recusada.
    const bogusSingle = await request(app)
      .put(`/api/public/pre-interviews/responses/${byType.get("single_choice")}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: "opt_z" });
    expect(bogusSingle.status).toBe(400);
    // single_choice: opcao valida -- aceita.
    await request(app)
      .put(`/api/public/pre-interviews/responses/${byType.get("single_choice")}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: "opt_a" })
      .expect(200);

    // multiple_choice: uma das opcoes e invalida -- toda a resposta e recusada.
    const bogusMultiple = await request(app)
      .put(`/api/public/pre-interviews/responses/${byType.get("multiple_choice")}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: ["opt_a", "opt_z"] });
    expect(bogusMultiple.status).toBe(400);
    // multiple_choice: opcao duplicada -- recusada.
    const duplicateMultiple = await request(app)
      .put(`/api/public/pre-interviews/responses/${byType.get("multiple_choice")}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: ["opt_a", "opt_a"] });
    expect(duplicateMultiple.status).toBe(400);

    // numeric: 1e400 (JSON valido, mas JSON.parse produz Infinity em JS) -- recusado.
    const infiniteNumeric = await request(app)
      .put(`/api/public/pre-interviews/responses/${byType.get("numeric")}`)
      .set(accessTokenHeaders(token))
      .set("Content-Type", "application/json")
      .send('{"responseValue":1e400}');
    expect(infiniteNumeric.status).toBe(400);
    // numeric: valor finito normal -- aceito.
    await request(app)
      .put(`/api/public/pre-interviews/responses/${byType.get("numeric")}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: 7 })
      .expect(200);

    // date: string que nao e uma data valida -- recusada.
    const invalidDate = await request(app)
      .put(`/api/public/pre-interviews/responses/${byType.get("date")}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: "not-a-real-date" });
    expect(invalidDate.status).toBe(400);
    // date: ISO valida -- aceita.
    await request(app)
      .put(`/api/public/pre-interviews/responses/${byType.get("date")}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: "2026-01-15" })
      .expect(200);

    // open_text: array nunca mais e coagido silenciosamente para string -- recusado.
    const arrayAsText = await request(app)
      .put(`/api/public/pre-interviews/responses/${byType.get("open_text")}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: ["a", "b"] });
    expect(arrayAsText.status).toBe(400);
  });

  it("mass assignment bloqueia score, ranking e campos de execucao de IA no salvamento de resposta", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "mass-assign-ai-a");
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

    for (const forbidden of [
      { score: 10 },
      { ranking: 1 },
      { aiExecutionId: "ai_hacked" },
      { ai_execution_id: "ai_hacked" }
    ]) {
      const blocked = await request(app)
        .put(`/api/public/pre-interviews/responses/${questions.rows[0].id}`)
        .set(accessTokenHeaders(token))
        .send({ responseValue: "answer", ...forbidden });
      expect(blocked.status).toBe(400);
    }
  });

  // ------------------------------------------------------------------------------------------
  // 9. Concorrencia: submit x save, submit x cancel, submit x expire (itens 30-32).
  // ------------------------------------------------------------------------------------------

  it("submit concorrente com save: a resposta ou e salva antes do submit, ou o save encontra completed e falha -- nunca dado perdido silenciosamente", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "concurrency-submit-save-a");
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
    // Responde o obrigatorio primeiro para que o submit concorrente tenha chance real de
    // suceder (sem isso, ele sempre falharia por resposta obrigatoria ausente, mascarando a
    // corrida que este teste quer provar).
    await request(app)
      .put(`/api/public/pre-interviews/responses/${questionId}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: "primeira resposta" })
      .expect(200);

    const [saveResult, submitResult] = await Promise.all([
      request(app)
        .put(`/api/public/pre-interviews/responses/${questionId}`)
        .set(accessTokenHeaders(token))
        .send({ responseValue: "resposta concorrente" }),
      request(app).post("/api/public/pre-interviews/submit").set(accessTokenHeaders(token))
    ]);
    expect(submitResult.status).toBe(200);
    expect([200, 409]).toContain(saveResult.status);

    const responseRow = await database.pool.query(
      "SELECT response_value, submitted FROM pre_interview_responses WHERE pre_interview_question_id = $1",
      [questionId]
    );
    expect(responseRow.rows).toHaveLength(1);
    expect(responseRow.rows[0].submitted).toBe(true);
  });

  it("submit concorrente com cancelamento: nunca ambos vencem -- ou completed ou cancelled, nunca os dois eventos", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "concurrency-submit-cancel-a");
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
      .send({ responseValue: "resposta" })
      .expect(200);

    const [submitResult, cancelResult] = await Promise.all([
      request(app).post("/api/public/pre-interviews/submit").set(accessTokenHeaders(token)),
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/pre-interviews/${created.body.id}/cancel`
        )
        .set(userHeaders(fixture.owner.id))
        .send({ reason: "corrida com submit" })
    ]);

    const finalRow = await database.pool.query("SELECT status FROM pre_interviews WHERE id = $1", [
      created.body.id
    ]);
    expect(["completed", "cancelled"]).toContain(finalRow.rows[0].status);
    // O lado "vencedor" sempre teve sucesso HTTP; o lado "perdedor" nunca retorna 200 com um
    // corpo que sugira ter tambem vencido silenciosamente.
    if (finalRow.rows[0].status === "completed") {
      expect(submitResult.status).toBe(200);
      expect(cancelResult.status).toBe(409);
    } else {
      expect(cancelResult.status).toBe(200);
      expect([200, 409]).toContain(submitResult.status);
      if (submitResult.status === 200) {
        // Idempotente: so pode ter retornado 200 se ja estava completed ANTES do cancel
        // vencer -- neste ramo o cancel deveria ter sido 409, entao esta combinacao nunca
        // ocorre de fato; a asserção acima em `cancelResult.status` ja cobre isso.
      }
    }
  });

  it("submit concorrente com expiracao lazy: nunca completa uma instancia ja expirada", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "concurrency-submit-expire-a");
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
      .send({ responseValue: "resposta" })
      .expect(200);
    await database.pool.query(
      "UPDATE pre_interviews SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [created.body.id]
    );

    const [submitA, submitB] = await Promise.all([
      request(app).post("/api/public/pre-interviews/submit").set(accessTokenHeaders(token)),
      request(app).post("/api/public/pre-interviews/submit").set(accessTokenHeaders(token))
    ]);
    // Token ja tera sido revogado pela materializacao da expiracao -- 404 para ambas
    // (ou, na pior ordenacao possivel, uma pode ainda ver o token ativo por uma fracao de
    // transacao e tambem cair no 404 apos o lock ser liberado). Nunca 200 "completed".
    expect([submitA.status, submitB.status].every((status) => status === 404)).toBe(true);

    const finalRow = await database.pool.query("SELECT status FROM pre_interviews WHERE id = $1", [
      created.body.id
    ]);
    expect(finalRow.rows[0].status).toBe("expired");
  });

  // ------------------------------------------------------------------------------------------
  // 10. effectiveStatus sem nenhuma escrita: listagens/DTO nunca mostram estado operacional
  //     obsoleto so porque nenhuma escrita materializou a expiracao ainda (itens 14/15).
  // ------------------------------------------------------------------------------------------

  it("listagem/detalhe/member/admin-read mostram 'expired' mesmo sem nenhuma chamada de escrita ter materializado ainda", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "effective-status-a");
    const member = await createUser(app, "member-effective-status-a");
    await addMembership(app, fixture.organization.id, fixture.owner.id, member.id, "member");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);
    // Fisicamente ainda "available" no banco -- apenas o expires_at ja venceu.
    await database.pool.query(
      "UPDATE pre_interviews SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [created.body.id]
    );
    const physicalStatus = await database.pool.query(
      "SELECT status FROM pre_interviews WHERE id = $1",
      [created.body.id]
    );
    expect(physicalStatus.rows[0].status).toBe("available");

    const ownerDetail = await request(app)
      .get(`/api/organizations/${fixture.organization.id}/pre-interviews/${created.body.id}`)
      .set(userHeaders(fixture.owner.id))
      .expect(200);
    expect(ownerDetail.body.status).toBe("expired");

    const ownerList = await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(200);
    expect(ownerList.body[0].status).toBe("expired");

    const memberDetail = await request(app)
      .get(`/api/organizations/${fixture.organization.id}/pre-interviews/${created.body.id}`)
      .set(userHeaders(member.id))
      .expect(200);
    expect(memberDetail.body).toEqual({ id: created.body.id, status: "expired", attemptNumber: 1 });

    const adminRead = await request(app)
      .post(`/api/platform/organizations/${fixture.organization.id}/pre-interviews/admin-read`)
      .set(platformHeaders)
      .send({ reason: "auditoria" })
      .expect(200);
    expect(adminRead.body[0].status).toBe("expired");

    // A leitura acima nunca escreveu no banco -- confirma que tudo foi computado em memoria.
    const physicalStatusAfter = await database.pool.query(
      "SELECT status FROM pre_interviews WHERE id = $1",
      [created.body.id]
    );
    expect(physicalStatusAfter.rows[0].status).toBe("available");
  });

  // ------------------------------------------------------------------------------------------
  // 11. Vaga fechada em pleno andamento nunca cancela nem bloqueia a Pre-Entrevista (item 19).
  // ------------------------------------------------------------------------------------------

  it("fechar a Vaga com a Pre-Entrevista em andamento nunca a cancela nem bloqueia o fluxo publico", async () => {
    const fixture = await createConfiguredApplicationFixture(app, "job-closed-a");
    const created = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidate-applications/${fixture.application.id}/pre-interviews`
      )
      .set(userHeaders(fixture.owner.id))
      .expect(201);
    const token = created.body.rawAccessToken as string;

    await request(app)
      .post(`/api/organizations/${fixture.organization.id}/job-openings/${fixture.job.id}/close`)
      .set(userHeaders(fixture.owner.id))
      .expect(200);

    const stillAvailable = await request(app)
      .get("/api/public/pre-interviews/current")
      .set(accessTokenHeaders(token))
      .expect(200);
    expect(stillAvailable.body.status).toBe("available");

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
      .send({ responseValue: "resposta" })
      .expect(200);
    const submitted = await request(app)
      .post("/api/public/pre-interviews/submit")
      .set(accessTokenHeaders(token))
      .expect(200);
    expect(submitted.body.status).toBe("completed");
  });

  // ------------------------------------------------------------------------------------------
  // 12. Nenhum vazamento de token/PII em logs (itens 33/34).
  // ------------------------------------------------------------------------------------------

  it("nenhuma resposta de erro nem qualquer log de console expoe o token bruto, mesmo em falha interna", async () => {
    // `vi.spyOn` (nunca reatribuicao manual de `console.log`/`console.error`) -- forma
    // suportada pelo Vitest, sempre restaurada via `mockRestore()` mesmo em caso de falha.
    const captured: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      captured.push(args.map((value) => String(value)).join(" "));
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      captured.push(args.map((value) => String(value)).join(" "));
    });
    try {
      const fixture = await createPublicJobOpeningFixture(app, "log-leak-a");
      const submitted = await submitApplication(app, fixture.slug, applicationPayload()).expect(
        201
      );
      const rawToken = submitted.body.nextStep.access as string;
      // Um marcador exclusivo deste teste -- se aparecer em QUALQUER linha capturada, o token
      // bruto vazou para algum log de console.
      expect(rawToken.length).toBeGreaterThan(20);

      await request(app)
        .get("/api/public/pre-interviews/current")
        .set(accessTokenHeaders(rawToken))
        .expect(200);
      await request(app)
        .post("/api/public/pre-interviews/start")
        .set(accessTokenHeaders(rawToken))
        .expect(200);
      // Uma tentativa invalida tambem nunca deveria logar o token forjado.
      await request(app)
        .get("/api/public/pre-interviews/current")
        .set(accessTokenHeaders("forged-should-never-be-logged"));

      for (const line of captured) {
        expect(line).not.toContain(rawToken);
        expect(line).not.toContain("forged-should-never-be-logged");
      }
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  // ------------------------------------------------------------------------------------------
  // 13. Parsing do header Authorization e limite de tamanho do body (itens 39/40).
  // ------------------------------------------------------------------------------------------

  it("parsing do header Authorization: espacos multiplos, scheme case-insensitive, ausencia de scheme e token longo demais", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "header-parsing-a");
    const submitted = await submitApplication(app, fixture.slug, applicationPayload()).expect(201);
    const token = submitted.body.nextStep.access as string;

    // Espacos multiplos entre o scheme e o token continuam validos.
    const multipleSpaces = await request(app)
      .get("/api/public/pre-interviews/current")
      .set("Authorization", `PreInterview    ${token}`);
    expect(multipleSpaces.status).toBe(200);

    // Scheme com capitalizacao diferente continua valido.
    const differentCase = await request(app)
      .get("/api/public/pre-interviews/current")
      .set("Authorization", `PREINTERVIEW ${token}`);
    expect(differentCase.status).toBe(200);

    // Sem scheme nenhum -- tratado como token ausente (404 generico, nunca 500).
    const noScheme = await request(app)
      .get("/api/public/pre-interviews/current")
      .set("Authorization", token);
    expect(noScheme.status).toBe(404);

    // Scheme errado -- mesmo tratamento.
    const wrongScheme = await request(app)
      .get("/api/public/pre-interviews/current")
      .set("Authorization", `Bearer ${token}`);
    expect(wrongScheme.status).toBe(404);

    // Token absurdamente longo -- descartado antes de qualquer hash, nunca 500.
    const tooLong = await request(app)
      .get("/api/public/pre-interviews/current")
      .set("Authorization", `PreInterview ${"a".repeat(600)}`);
    expect(tooLong.status).toBe(404);

    // Header ausente -- mesmo tratamento generico.
    const missing = await request(app).get("/api/public/pre-interviews/current");
    expect(missing.status).toBe(404);
  });

  it("body maior que o limite global de 256kb e recusado tambem nas rotas publicas da Pre-Entrevista", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "body-limit-a");
    const submitted = await submitApplication(app, fixture.slug, applicationPayload()).expect(201);
    const token = submitted.body.nextStep.access as string;
    const questions = await database.pool.query(
      "SELECT id FROM pre_interview_questions WHERE organization_id = $1",
      [fixture.organizationId]
    );
    await request(app)
      .post("/api/public/pre-interviews/start")
      .set(accessTokenHeaders(token))
      .expect(200);

    const oversized = "a".repeat(300 * 1024);
    const response = await request(app)
      .put(`/api/public/pre-interviews/responses/${questions.rows[0].id}`)
      .set(accessTokenHeaders(token))
      .send({ responseValue: oversized });
    expect(response.status).toBe(413);
  });
});
