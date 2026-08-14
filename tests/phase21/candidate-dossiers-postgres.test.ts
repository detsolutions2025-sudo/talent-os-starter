import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createAppWithServices,
  createApplication,
  createCandidateWithConsent,
  createOrgWithMembers,
  createPublishedOpenJob,
  platformHeaders,
  userHeaders
} from "../phase20/helpers";

let database: PostgresTestDatabase;

beforeAll(async () => {
  database = await createPostgresTestDatabase();
});

afterAll(async () => {
  await database.cleanup();
});

async function buildFixture(app: ReturnType<typeof createAppWithServices>["app"], suffix: string) {
  const fixture = await createOrgWithMembers(app);
  const candidate = await createCandidateWithConsent(app, fixture.organizationId, fixture.ownerId);
  const job = await createPublishedOpenJob(app, fixture.organizationId, fixture.ownerId, suffix);
  const application = await createApplication(
    app,
    fixture.organizationId,
    fixture.ownerId,
    candidate.id,
    job.id,
    job.versionId
  );
  return { fixture, candidate, job, application };
}

function generateDossier(
  app: ReturnType<typeof createAppWithServices>["app"],
  organizationId: string,
  applicationId: string,
  ownerId: string,
  key = `phase21.${crypto.randomUUID()}`
) {
  return request(app)
    .post(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId}/candidate-dossiers`
    )
    .set(userHeaders(ownerId))
    .set("Idempotency-Key", key)
    .send({});
}

describe("Fase 21 - Dossie Inteligente do Candidato", () => {
  it("gera dossie materializado generated, com fontes substantivas e sem criar AI Execution", async () => {
    const { app } = createAppWithServices(database);
    const { fixture, application } = await buildFixture(app, "d1");

    const beforeAi = await database.pool.query("SELECT COUNT(*)::int AS total FROM ai_executions");
    const created = await generateDossier(
      app,
      fixture.organizationId,
      application.id,
      fixture.ownerId
    ).expect(201);
    const afterAi = await database.pool.query("SELECT COUNT(*)::int AS total FROM ai_executions");

    expect(created.body.status).toBe("generated");
    expect(created.body.versionNumber).toBe(1);
    expect(created.body.presentedSnapshot.schemaVersion).toBe("candidate_dossier_snapshot.v1");
    expect(afterAi.rows[0].total).toBe(beforeAi.rows[0].total);

    const sources = await request(app)
      .get(
        `/api/organizations/${fixture.organizationId}/candidate-dossiers/${created.body.id}/sources`
      )
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(sources.body.length).toBeGreaterThan(0);
    expect(sources.body.map((s: { sourceType: string }) => s.sourceType)).not.toContain(
      "pre_interview"
    );
    expect(sources.body.map((s: { sourceType: string }) => s.sourceType)).not.toContain(
      "interview"
    );
  });

  it("replay idempotente retorna o mesmo dossie; mesmo header com fingerprint diferente falha", async () => {
    const { app } = createAppWithServices(database);
    const { fixture, application } = await buildFixture(app, "d2");
    const key = `phase21-idem-${crypto.randomUUID()}`;

    const first = await generateDossier(
      app,
      fixture.organizationId,
      application.id,
      fixture.ownerId,
      key
    ).expect(201);
    const replay = await generateDossier(
      app,
      fixture.organizationId,
      application.id,
      fixture.ownerId,
      key
    ).expect(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.versionNumber).toBe(1);

    await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${application.id}/candidate-dossiers`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", key)
      .send({ generationKind: "final_record", finalRecordReason: "fechamento" })
      .expect(409);
  });

  it("duas geracoes concorrentes com chaves diferentes produzem versoes sequenciais sem lacuna", async () => {
    const { app } = createAppWithServices(database);
    const { fixture, application } = await buildFixture(app, "d3");

    const [first, second] = await Promise.all([
      generateDossier(app, fixture.organizationId, application.id, fixture.ownerId),
      generateDossier(app, fixture.organizationId, application.id, fixture.ownerId)
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);

    const list = await request(app)
      .get(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${application.id}/candidate-dossiers`
      )
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(list.body.map((d: { versionNumber: number }) => d.versionNumber).sort()).toEqual([1, 2]);
  });

  it("member recebe DTO minimo e nao acessa fontes", async () => {
    const { app } = createAppWithServices(database);
    const { fixture, application } = await buildFixture(app, "d4");
    const created = await generateDossier(
      app,
      fixture.organizationId,
      application.id,
      fixture.ownerId
    ).expect(201);

    const status = await request(app)
      .get(
        `/api/organizations/${fixture.organizationId}/candidate-dossiers/${created.body.id}/status`
      )
      .set(userHeaders(fixture.memberId))
      .expect(200);
    expect(Object.keys(status.body).sort()).toEqual(["id", "status", "versionNumber"]);

    await request(app)
      .get(
        `/api/organizations/${fixture.organizationId}/candidate-dossiers/${created.body.id}/sources`
      )
      .set(userHeaders(fixture.memberId))
      .expect(403);
  });

  it("admin-read e minimizado, exige Platform Admin e motivo, e audita ID inexistente", async () => {
    const { app } = createAppWithServices(database);
    const { fixture, application } = await buildFixture(app, "d5");
    const created = await generateDossier(
      app,
      fixture.organizationId,
      application.id,
      fixture.ownerId
    ).expect(201);

    await request(app)
      .post(`/api/platform/organizations/${fixture.organizationId}/candidate-dossiers/admin-read`)
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "suporte", candidateDossierId: created.body.id })
      .expect(403);

    const adminRead = await request(app)
      .post(`/api/platform/organizations/${fixture.organizationId}/candidate-dossiers/admin-read`)
      .set(platformHeaders)
      .send({ reason: "investigacao de suporte", candidateDossierId: created.body.id })
      .expect(200);
    expect(adminRead.body.sourceCount).toBeGreaterThan(0);
    expect(adminRead.body.presentedSnapshot).toBeUndefined();

    const fakeId = `cd_${crypto.randomUUID()}`;
    await request(app)
      .post(`/api/platform/organizations/${fixture.organizationId}/candidate-dossiers/admin-read`)
      .set(platformHeaders)
      .send({ reason: "investigacao de suporte", candidateDossierId: fakeId })
      .expect(404);
    const audit = await database.pool.query(
      `
        SELECT result, reason, metadata FROM audit_events
        WHERE organization_id = $1 AND action = 'candidate_dossier.administrative_read_denied'
        ORDER BY created_at DESC LIMIT 1
      `,
      [fixture.organizationId]
    );
    expect(audit.rows[0].result).toBe("denied");
    expect(audit.rows[0].metadata.candidateDossierId).toBe(fakeId);
  });

  it("falha antes da persistencia faz rollback e nao consome version_number", async () => {
    let crashed = false;
    const { app } = createAppWithServices(database, {
      candidateDossierTestingHooks: {
        beforePersist: () => {
          if (!crashed) {
            crashed = true;
            throw new Error("simulated failure before candidate dossier persist");
          }
        }
      }
    });
    const { fixture, application } = await buildFixture(app, "d6");

    await generateDossier(app, fixture.organizationId, application.id, fixture.ownerId).expect(500);
    const created = await generateDossier(
      app,
      fixture.organizationId,
      application.id,
      fixture.ownerId
    ).expect(201);
    expect(created.body.versionNumber).toBe(1);
  });

  it("aplica matriz de final_record: active somente regular, rejected/hired uma final, withdrawn/cancelled bloqueados", async () => {
    const { app } = createAppWithServices(database);
    const { fixture, application } = await buildFixture(app, "d7");

    await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${application.id}/candidate-dossiers`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", `phase21-final-active-${crypto.randomUUID()}`)
      .send({ generationKind: "final_record", finalRecordReason: "fechamento ativo" })
      .expect(409);

    await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${application.id}/reject`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "encerramento de teste" })
      .expect(200);

    await generateDossier(
      app,
      fixture.organizationId,
      application.id,
      fixture.ownerId,
      `phase21-final-regular-${crypto.randomUUID()}`
    ).expect(409);

    const finalRecord = await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${application.id}/candidate-dossiers`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", `phase21-final-ok-${crypto.randomUUID()}`)
      .send({ generationKind: "final_record", finalRecordReason: "registro final" })
      .expect(201);
    expect(finalRecord.body.generationKind).toBe("final_record");

    await request(app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${application.id}/candidate-dossiers`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", `phase21-final-dup-${crypto.randomUUID()}`)
      .send({ generationKind: "final_record", finalRecordReason: "segundo registro" })
      .expect(409);

    const withdrawn = await buildFixture(app, "d8");
    await request(app)
      .post(
        `/api/organizations/${withdrawn.fixture.organizationId}/candidate-applications/${withdrawn.application.id}/withdraw`
      )
      .set(userHeaders(withdrawn.fixture.ownerId))
      .send({ reason: "desistencia de teste" })
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${withdrawn.fixture.organizationId}/candidate-applications/${withdrawn.application.id}/candidate-dossiers`
      )
      .set(userHeaders(withdrawn.fixture.ownerId))
      .set("Idempotency-Key", `phase21-final-withdrawn-${crypto.randomUUID()}`)
      .send({ generationKind: "final_record", finalRecordReason: "registro final" })
      .expect(409);

    const hired = await buildFixture(app, "d16");
    await request(app)
      .post(
        `/api/organizations/${hired.fixture.organizationId}/candidate-applications/${hired.application.id}/hire`
      )
      .set(userHeaders(hired.fixture.ownerId))
      .send({ reason: "contratacao de teste" })
      .expect(200);
    await generateDossier(
      app,
      hired.fixture.organizationId,
      hired.application.id,
      hired.fixture.ownerId,
      `phase21-hired-regular-${crypto.randomUUID()}`
    ).expect(409);
    await request(app)
      .post(
        `/api/organizations/${hired.fixture.organizationId}/candidate-applications/${hired.application.id}/candidate-dossiers`
      )
      .set(userHeaders(hired.fixture.ownerId))
      .set("Idempotency-Key", `phase21-hired-final-${crypto.randomUUID()}`)
      .send({ generationKind: "final_record", finalRecordReason: "registro final contratado" })
      .expect(201);

    const cancelled = await buildFixture(app, "d17");
    await request(app)
      .post(
        `/api/organizations/${cancelled.fixture.organizationId}/candidate-applications/${cancelled.application.id}/cancel`
      )
      .set(userHeaders(cancelled.fixture.ownerId))
      .send({ reason: "cancelamento de teste" })
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${cancelled.fixture.organizationId}/candidate-applications/${cancelled.application.id}/candidate-dossiers`
      )
      .set(userHeaders(cancelled.fixture.ownerId))
      .set("Idempotency-Key", `phase21-cancelled-final-${crypto.randomUUID()}`)
      .send({ generationKind: "final_record", finalRecordReason: "registro final cancelado" })
      .expect(409);

    const concurrent = await buildFixture(app, "d18");
    await request(app)
      .post(
        `/api/organizations/${concurrent.fixture.organizationId}/candidate-applications/${concurrent.application.id}/reject`
      )
      .set(userHeaders(concurrent.fixture.ownerId))
      .send({ reason: "rejeicao concorrente" })
      .expect(200);
    const [a, b] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${concurrent.fixture.organizationId}/candidate-applications/${concurrent.application.id}/candidate-dossiers`
        )
        .set(userHeaders(concurrent.fixture.ownerId))
        .set("Idempotency-Key", `phase21-final-concurrent-a-${crypto.randomUUID()}`)
        .send({ generationKind: "final_record", finalRecordReason: "registro final" }),
      request(app)
        .post(
          `/api/organizations/${concurrent.fixture.organizationId}/candidate-applications/${concurrent.application.id}/candidate-dossiers`
        )
        .set(userHeaders(concurrent.fixture.ownerId))
        .set("Idempotency-Key", `phase21-final-concurrent-b-${crypto.randomUUID()}`)
        .send({ generationKind: "final_record", finalRecordReason: "registro final" })
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it("bloqueia nova geracao para Candidate inactive, mas preserva historico ja gerado", async () => {
    const { app } = createAppWithServices(database);
    const { fixture, candidate, application } = await buildFixture(app, "d9");
    const created = await generateDossier(
      app,
      fixture.organizationId,
      application.id,
      fixture.ownerId
    ).expect(201);

    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/candidates/${candidate.id}/inactivate`)
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "teste destrutivo" })
      .expect(200);

    await generateDossier(
      app,
      fixture.organizationId,
      application.id,
      fixture.ownerId,
      `phase21-inactive-${crypto.randomUUID()}`
    ).expect(409);

    await request(app)
      .get(`/api/organizations/${fixture.organizationId}/candidate-dossiers/${created.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
  });

  it("Organization archived bloqueia nova geracao e preserva leitura historica autorizada", async () => {
    const { app } = createAppWithServices(database);
    const { fixture, application } = await buildFixture(app, "d10");
    const created = await generateDossier(
      app,
      fixture.organizationId,
      application.id,
      fixture.ownerId
    ).expect(201);

    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/archive`)
      .set(platformHeaders)
      .expect(200);

    await generateDossier(
      app,
      fixture.organizationId,
      application.id,
      fixture.ownerId,
      `phase21-archived-${crypto.randomUUID()}`
    ).expect(403);

    await request(app)
      .get(`/api/organizations/${fixture.organizationId}/candidate-dossiers/${created.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
  });

  it("nao compoe PII proibida nem entrevistas nao concluídas", async () => {
    const { app } = createAppWithServices(database);
    const fixture = await createOrgWithMembers(app);
    const sentinel = `pii-${crypto.randomUUID()}@example.com`;
    const candidate = await createCandidateWithConsent(
      app,
      fixture.organizationId,
      fixture.ownerId,
      {
        email: sentinel
      }
    );
    await database.pool.query(
      "UPDATE candidates SET phone = $2, secondary_phone = $3 WHERE organization_id = $1 AND id = $4",
      [
        fixture.organizationId,
        `phone-${crypto.randomUUID()}`,
        `secondary-${crypto.randomUUID()}`,
        candidate.id
      ]
    );
    const job = await createPublishedOpenJob(app, fixture.organizationId, fixture.ownerId, "d11");
    const application = await createApplication(
      app,
      fixture.organizationId,
      fixture.ownerId,
      candidate.id,
      job.id,
      job.versionId
    );

    const created = await generateDossier(
      app,
      fixture.organizationId,
      application.id,
      fixture.ownerId
    ).expect(201);
    const sources = await request(app)
      .get(
        `/api/organizations/${fixture.organizationId}/candidate-dossiers/${created.body.id}/sources`
      )
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const raw = JSON.stringify({ dossier: created.body, sources: sources.body });
    expect(raw).not.toContain(sentinel);
    expect(raw).not.toContain("phone-");
    expect(raw).not.toContain("secondary-");
    expect(sources.body.map((s: { sourceType: string }) => s.sourceType)).not.toContain(
      "interview_response"
    );
    expect(created.body.presentedSnapshot.sections.blueprint_version).toBeUndefined();
  });

  it("trigger fisica rejeita source com colunas de fonte extras e shape ambiguo", async () => {
    const { app } = createAppWithServices(database);
    const { fixture, application } = await buildFixture(app, "d12");
    const created = await generateDossier(
      app,
      fixture.organizationId,
      application.id,
      fixture.ownerId
    ).expect(201);
    const dossierRow = await database.pool.query(
      "SELECT candidate_id, job_opening_version_id FROM candidate_dossiers WHERE id = $1",
      [created.body.id]
    );

    await expect(
      database.pool.query(
        `
          INSERT INTO candidate_dossier_sources (
            id, organization_id, candidate_dossier_id, candidate_application_id, source_type,
            origin_kind, field_name, candidate_id, job_opening_version_id, snapshot_value,
            presented_value_snapshot, content_hash, presented_order, created_at
          )
          VALUES ($1,$2,$3,$4,'candidate_field','declared_data','professional_summary',$5,$6,
                  '"ok"'::jsonb,'{"value":"ok"}'::jsonb,'hash',999,NOW())
        `,
        [
          `cds_bad_${crypto.randomUUID()}`,
          fixture.organizationId,
          created.body.id,
          application.id,
          dossierRow.rows[0].candidate_id,
          dossierRow.rows[0].job_opening_version_id
        ]
      )
    ).rejects.toThrow(/candidate_dossier_source_shape_invalid/);
  });

  it("consentimento operacional geral: somente Recruiting granted vigente autoriza nova geracao", async () => {
    const { app } = createAppWithServices(database);
    const granted = await buildFixture(app, "d13");
    await generateDossier(
      app,
      granted.fixture.organizationId,
      granted.application.id,
      granted.fixture.ownerId
    ).expect(201);

    for (const status of ["pending", "revoked", "expired"] as const) {
      const item = await buildFixture(app, `d13${status.slice(0, 1)}`);
      await database.pool.query(
        `
          UPDATE candidate_consents
          SET status = $3, expires_at = CASE WHEN $3 = 'expired' THEN NOW() - INTERVAL '1 day' ELSE NULL END
          WHERE organization_id = $1 AND candidate_id = $2 AND purpose = 'Recruiting'
        `,
        [item.fixture.organizationId, item.candidate.id, status]
      );
      await generateDossier(
        app,
        item.fixture.organizationId,
        item.application.id,
        item.fixture.ownerId,
        `phase21-consent-${status}-${crypto.randomUUID()}`
      ).expect(409);
    }

    const otherCandidateConsent = await buildFixture(app, "d14");
    const unrelatedCandidate = await createCandidateWithConsent(
      app,
      otherCandidateConsent.fixture.organizationId,
      otherCandidateConsent.fixture.ownerId
    );
    await database.pool.query(
      "UPDATE candidate_consents SET status = 'revoked' WHERE organization_id = $1 AND candidate_id = $2 AND purpose = 'Recruiting'",
      [otherCandidateConsent.fixture.organizationId, otherCandidateConsent.candidate.id]
    );
    await database.pool.query(
      "UPDATE candidate_consents SET status = 'granted' WHERE organization_id = $1 AND candidate_id = $2 AND purpose = 'Recruiting'",
      [otherCandidateConsent.fixture.organizationId, unrelatedCandidate.id]
    );
    await generateDossier(
      app,
      otherCandidateConsent.fixture.organizationId,
      otherCandidateConsent.application.id,
      otherCandidateConsent.fixture.ownerId,
      `phase21-consent-other-candidate-${crypto.randomUUID()}`
    ).expect(409);

    const otherOrgConsent = await buildFixture(app, "d15");
    const otherOrg = await createOrgWithMembers(app);
    const otherOrgCandidate = await createCandidateWithConsent(
      app,
      otherOrg.organizationId,
      otherOrg.ownerId
    );
    await database.pool.query(
      "UPDATE candidate_consents SET status = 'revoked' WHERE organization_id = $1 AND candidate_id = $2 AND purpose = 'Recruiting'",
      [otherOrgConsent.fixture.organizationId, otherOrgConsent.candidate.id]
    );
    await database.pool.query(
      "UPDATE candidate_consents SET status = 'granted' WHERE organization_id = $1 AND candidate_id = $2 AND purpose = 'Recruiting'",
      [otherOrg.organizationId, otherOrgCandidate.id]
    );
    await generateDossier(
      app,
      otherOrgConsent.fixture.organizationId,
      otherOrgConsent.application.id,
      otherOrgConsent.fixture.ownerId,
      `phase21-consent-other-org-${crypto.randomUUID()}`
    ).expect(409);
  });
});
