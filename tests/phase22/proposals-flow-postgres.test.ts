import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fingerprint } from "../../src/server/core/canonical-hash";
import { sha256Hex } from "../../src/server/proposals/access-token";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  createDraft,
  createProposalFixture,
  createUser,
  issuedProposal,
  issueDraft,
  platformHeaders,
  proposalAuthHeaders,
  userHeaders
} from "./helpers";

describe("Fase 22 - Propostas", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("owner cria rascunho, emite, retorna token bruto uma vez e Candidate aceita sem hired automatico", async () => {
    const fixture = await createProposalFixture(database, "issue-accept");
    const draft = await createDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId
    );
    const issued = await issueDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId,
      draft.currentVersion.id
    ).expect(201);
    expect(issued.body.rawAccessToken).toEqual(expect.any(String));

    await request(fixture.app)
      .get("/api/public/proposals/current")
      .set(proposalAuthHeaders(issued.body.rawAccessToken))
      .expect("Cache-Control", "no-store")
      .expect(200);

    await request(fixture.app)
      .post("/api/public/proposals/accept")
      .set(proposalAuthHeaders(issued.body.rawAccessToken))
      .send({})
      .expect("Cache-Control", "no-store")
      .expect(200);

    const rows = await database.pool.query(
      `
        SELECT p.current_version_id, pv.status, ca.application_status
        FROM proposals p
        JOIN proposal_versions pv ON pv.id = p.current_version_id
        JOIN candidate_applications ca ON ca.id = p.candidate_application_id
        WHERE p.candidate_application_id = $1
      `,
      [fixture.applicationId]
    );
    expect(rows.rows[0].status).toBe("accepted");
    expect(rows.rows[0].application_status).toBe("active");
    expect(rows.rows[0].current_version_id).toBe(draft.currentVersion.id);
  });

  it("replay idempotente de emissao nao devolve token bruto antigo", async () => {
    const fixture = await createProposalFixture(database, "lost-token");
    const draft = await createDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId
    );
    const key = crypto.randomUUID();
    const first = await issueDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId,
      draft.currentVersion.id,
      key
    ).expect(201);
    expect(first.body.rawAccessToken).toEqual(expect.any(String));

    const replay = await issueDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId,
      draft.currentVersion.id,
      key
    ).expect(200);
    expect(replay.body.rawAccessToken).toBeNull();
    expect(replay.body.tokenReturned).toBe(false);
  });

  it("replay idempotente de aceite publico nao duplica evento", async () => {
    const fixture = await createProposalFixture(database, "accept-idem");
    const draft = await createDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId
    );
    const issued = await issueDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId,
      draft.currentVersion.id
    ).expect(201);
    const key = crypto.randomUUID();
    await request(fixture.app)
      .post("/api/public/proposals/accept")
      .set(proposalAuthHeaders(issued.body.rawAccessToken))
      .set("Idempotency-Key", key)
      .send({})
      .expect(200);
    await request(fixture.app)
      .post("/api/public/proposals/accept")
      .set(proposalAuthHeaders(issued.body.rawAccessToken))
      .set("Idempotency-Key", key)
      .send({})
      .expect(200);
    const events = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM proposal_events WHERE proposal_version_id = $1 AND event_type = 'accepted'",
      [draft.currentVersion.id]
    );
    expect(events.rows[0].count).toBe(1);
  });

  it("bloqueia nova emissao depois de accepted e permite hired com proposalVersionId aceito", async () => {
    const fixture = await createProposalFixture(database, "hired-proposal");
    const draft = await createDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId
    );
    const issued = await issueDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId,
      draft.currentVersion.id
    ).expect(201);
    await request(fixture.app)
      .post("/api/public/proposals/accept")
      .set(proposalAuthHeaders(issued.body.rawAccessToken))
      .send({})
      .expect(200);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/proposals/draft`
      )
      .set(userHeaders(fixture.ownerId))
      .send({
        contentSnapshot: { text: "Outra" },
        compensationSnapshot: { salary: 1, currency: "BRL" }
      })
      .expect(409);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/hire`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Aceite recebido.", proposalVersionId: draft.currentVersion.id })
      .expect(200);

    const event = await database.pool.query(
      "SELECT proposal_version_id FROM candidate_application_events WHERE candidate_application_id = $1 AND event_type = 'hired'",
      [fixture.applicationId]
    );
    expect(event.rows[0].proposal_version_id).toBe(draft.currentVersion.id);
  });

  it("nao persiste token bruto em DB/audit/eventos e nao chama IA", async () => {
    const fixture = await createProposalFixture(database, "no-token-ai");
    const beforeAi = await database.pool.query("SELECT COUNT(*)::int AS count FROM ai_executions");
    const draft = await createDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId
    );
    const issued = await issueDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId,
      draft.currentVersion.id
    ).expect(201);
    const raw = issued.body.rawAccessToken as string;
    const tokenOccurrences = await database.pool.query(
      `
        SELECT
          (SELECT COUNT(*)::int FROM proposal_access_grants WHERE token_hash = $1) AS raw_as_hash,
          (SELECT COUNT(*)::int FROM proposal_events WHERE metadata::text LIKE $2) AS event_leak,
          (SELECT COUNT(*)::int FROM audit_events WHERE metadata::text LIKE $2) AS audit_leak
      `,
      [raw, `%${raw}%`]
    );
    const afterAi = await database.pool.query("SELECT COUNT(*)::int AS count FROM ai_executions");
    expect(tokenOccurrences.rows[0].raw_as_hash).toBe(0);
    expect(tokenOccurrences.rows[0].event_leak).toBe(0);
    expect(tokenOccurrences.rows[0].audit_leak).toBe(0);
    expect(afterAi.rows[0].count).toBe(beforeAi.rows[0].count);
  });

  it("duas emissoes concorrentes resultam em uma unica versao issued e um unico grant ativo", async () => {
    const fixture = await createProposalFixture(database, "concurrent-issue");
    const draft = await createDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId
    );

    const responses = await Promise.all([
      issueDraft(
        fixture.app,
        fixture.organizationId,
        fixture.ownerId,
        fixture.applicationId,
        draft.currentVersion.id,
        `issue-a-${crypto.randomUUID()}`
      ),
      issueDraft(
        fixture.app,
        fixture.organizationId,
        fixture.ownerId,
        fixture.applicationId,
        draft.currentVersion.id,
        `issue-b-${crypto.randomUUID()}`
      )
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const counts = await database.pool.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE pv.status = 'issued')::int AS issued_count,
          COUNT(DISTINCT g.id) FILTER (WHERE g.status = 'active')::int AS active_grants
        FROM proposal_versions pv
        LEFT JOIN proposal_access_grants g ON g.proposal_version_id = pv.id
        WHERE pv.candidate_application_id = $1
      `,
      [fixture.applicationId]
    );
    expect(counts.rows[0].issued_count).toBe(1);
    expect(counts.rows[0].active_grants).toBe(1);
  });

  it("corrida accept x decline terminaliza uma unica vez e mantem current_version_id", async () => {
    const fixture = await issuedProposal(database, "accept-decline-race");
    const [accept, decline] = await Promise.all([
      request(fixture.app)
        .post("/api/public/proposals/accept")
        .set(proposalAuthHeaders(fixture.rawAccessToken))
        .send({}),
      request(fixture.app)
        .post("/api/public/proposals/decline")
        .set(proposalAuthHeaders(fixture.rawAccessToken))
        .send({ declineReason: "Nao seguirei." })
    ]);

    expect([accept.status, decline.status].sort()).toEqual([200, 410]);
    const row = await database.pool.query(
      `
        SELECT p.current_version_id, pv.status,
          COUNT(pe.id) FILTER (WHERE pe.event_type IN ('accepted', 'declined'))::int AS terminal_events
        FROM proposals p
        JOIN proposal_versions pv ON pv.id = p.current_version_id
        LEFT JOIN proposal_events pe ON pe.proposal_version_id = pv.id
        WHERE p.candidate_application_id = $1
        GROUP BY p.current_version_id, pv.status
      `,
      [fixture.applicationId]
    );
    expect(row.rows[0].current_version_id).toBe(fixture.proposalVersionId);
    expect(["accepted", "declined"]).toContain(row.rows[0].status);
    expect(row.rows[0].terminal_events).toBe(1);
  });

  it("corrida accept x cancel escolhe um unico estado terminal sem hired automatico", async () => {
    const fixture = await issuedProposal(database, "accept-cancel-race");
    const [accept, cancel] = await Promise.all([
      request(fixture.app)
        .post("/api/public/proposals/accept")
        .set(proposalAuthHeaders(fixture.rawAccessToken))
        .send({}),
      request(fixture.app)
        .post(
          `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/proposals/cancel`
        )
        .set(userHeaders(fixture.ownerId))
        .set("Idempotency-Key", `cancel-${crypto.randomUUID()}`)
        .send({ reason: "Cancelamento concorrente." })
    ]);
    expect([200, 409, 410]).toContain(accept.status);
    expect([200, 409, 410]).toContain(cancel.status);

    const row = await database.pool.query(
      `
        SELECT pv.status, ca.application_status
        FROM proposals p
        JOIN proposal_versions pv ON pv.id = p.current_version_id
        JOIN candidate_applications ca ON ca.id = p.candidate_application_id
        WHERE p.candidate_application_id = $1
      `,
      [fixture.applicationId]
    );
    expect(["accepted", "cancelled"]).toContain(row.rows[0].status);
    expect(row.rows[0].application_status).toBe("active");
  });

  it("rotate grant revoga token antigo, replay nao recupera token e token novo aceita", async () => {
    const fixture = await issuedProposal(database, "rotate-accept");
    const key = `rotate-${crypto.randomUUID()}`;
    const first = await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/proposals/rotate-grant`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", key)
      .send({})
      .expect(201);
    const rotatedToken = first.body.rawAccessToken as string;
    expect(rotatedToken).toEqual(expect.any(String));

    const replay = await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/proposals/rotate-grant`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", key)
      .send({})
      .expect(200);
    expect(replay.body.rawAccessToken).toBeNull();

    await request(fixture.app)
      .get("/api/public/proposals/current")
      .set(proposalAuthHeaders(fixture.rawAccessToken))
      .expect(410);
    await request(fixture.app)
      .post("/api/public/proposals/accept")
      .set(proposalAuthHeaders(rotatedToken))
      .send({})
      .expect(200);
  });

  it("supersession move current_version_id, revoga token antigo e bloqueia supersede apos aceite", async () => {
    const fixture = await issuedProposal(database, "supersede-flow");
    const secondDraft = await createDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId,
      { contentSnapshot: { text: "Oferta revisada" } }
    );
    const superseded = await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/proposals/supersede`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", `supersede-${crypto.randomUUID()}`)
      .send({
        proposalVersionId: secondDraft.currentVersion.id,
        stageChangeReason: "Nova oferta."
      })
      .expect(201);
    const newToken = superseded.body.rawAccessToken as string;

    await request(fixture.app)
      .get("/api/public/proposals/current")
      .set(proposalAuthHeaders(fixture.rawAccessToken))
      .expect(410);
    await request(fixture.app)
      .post("/api/public/proposals/accept")
      .set(proposalAuthHeaders(newToken))
      .send({})
      .expect(200);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/proposals/supersede`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", `supersede-after-accept-${crypto.randomUUID()}`)
      .send({ proposalVersionId: secondDraft.currentVersion.id })
      .expect(409);

    const rows = await database.pool.query(
      `
        SELECT
          p.current_version_id,
          MAX(pv.status) FILTER (WHERE pv.id = $2) AS old_status,
          MAX(pv.status) FILTER (WHERE pv.id = $3) AS new_status
        FROM proposals p
        JOIN proposal_versions pv ON pv.proposal_id = p.id
        WHERE p.candidate_application_id = $1
        GROUP BY p.current_version_id
      `,
      [fixture.applicationId, fixture.proposalVersionId, secondDraft.currentVersion.id]
    );
    expect(rows.rows[0].current_version_id).toBe(secondDraft.currentVersion.id);
    expect(rows.rows[0].old_status).toBe("superseded");
    expect(rows.rows[0].new_status).toBe("accepted");
  });

  it("draft descartado nao pode ser emitido", async () => {
    const fixture = await createProposalFixture(database, "discarded-draft");
    const draft = await createDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId
    );
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/proposals/discard-draft`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Rascunho incorreto." })
      .expect(200);
    await issueDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId,
      draft.currentVersion.id
    ).expect(409);
  });

  it("Member e Platform Admin nao recebem snapshot de remuneracao", async () => {
    const fixture = await issuedProposal(database, "rbac-minimal");
    const member = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "proposal-member"
    );

    const memberRead = await request(fixture.app)
      .get(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/proposals`
      )
      .set(userHeaders(member.userId))
      .expect(200);
    expect(JSON.stringify(memberRead.body)).not.toContain("compensationSnapshot");
    expect(JSON.stringify(memberRead.body)).not.toContain("salary");

    const adminRead = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/proposals/admin-read`)
      .set(platformHeaders)
      .send({ reason: "Auditoria." })
      .expect(200);
    expect(JSON.stringify(adminRead.body)).not.toContain("compensationSnapshot");
    expect(JSON.stringify(adminRead.body)).not.toContain("salary");
  });

  it("bloqueia mass assignment, IDOR e cross-tenant por applicationId", async () => {
    const fixture = await createProposalFixture(database, "tenant-a");
    const other = await createProposalFixture(database, "tenant-b");
    const stranger = await createUser(fixture.app, "stranger-proposal");

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/proposals/draft`
      )
      .set(userHeaders(fixture.ownerId))
      .send({
        organizationId: other.organizationId,
        candidateApplicationId: other.applicationId,
        contentSnapshot: { text: "Tentativa" },
        compensationSnapshot: { salary: 1 }
      })
      .expect(400);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${other.applicationId}/proposals/draft`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ contentSnapshot: { text: "IDOR" }, compensationSnapshot: { salary: 1 } })
      .expect(404);

    await request(fixture.app)
      .get(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/proposals`
      )
      .set(userHeaders(stranger.id))
      .expect(403);
  });

  it("bloqueia acesso publico se consentimento/candidato/organizacao/candidatura ficam invalidos", async () => {
    const consent = await issuedProposal(database, "blocked-consent");
    await database.pool.query(
      "UPDATE candidate_consents SET status = 'revoked' WHERE candidate_id = (SELECT candidate_id FROM candidate_applications WHERE id = $1)",
      [consent.applicationId]
    );
    await request(consent.app)
      .get("/api/public/proposals/current")
      .set(proposalAuthHeaders(consent.rawAccessToken))
      .expect(410);

    const candidate = await issuedProposal(database, "blocked-candidate");
    await database.pool.query(
      "UPDATE candidates SET status = 'inactive' WHERE id = (SELECT candidate_id FROM candidate_applications WHERE id = $1)",
      [candidate.applicationId]
    );
    await request(candidate.app)
      .get("/api/public/proposals/current")
      .set(proposalAuthHeaders(candidate.rawAccessToken))
      .expect(410);

    const organization = await issuedProposal(database, "blocked-org");
    await request(organization.app)
      .post(`/api/organizations/${organization.organizationId}/archive`)
      .set(platformHeaders)
      .send({})
      .expect(200);
    await request(organization.app)
      .get("/api/public/proposals/current")
      .set(proposalAuthHeaders(organization.rawAccessToken))
      .expect(410);

    const application = await issuedProposal(database, "blocked-final-app");
    await request(application.app)
      .post(
        `/api/organizations/${application.organizationId}/candidate-applications/${application.applicationId}/reject`
      )
      .set(userHeaders(application.ownerId))
      .send({ reason: "Finalizada." })
      .expect(200);
    await request(application.app)
      .get("/api/public/proposals/current")
      .set(proposalAuthHeaders(application.rawAccessToken))
      .expect(410);
  });

  it("idempotencia pending, failed e mesma key com fingerprint diferente retornam conflitos seguros", async () => {
    const fixture = await createProposalFixture(database, "idempotency-edges");
    const draft = await createDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId
    );
    const pendingKey = `pending-${crypto.randomUUID()}`;
    const failedKey = `failed-${crypto.randomUUID()}`;
    const pendingPayload = { proposalVersionId: draft.currentVersion.id, stageChangeReason: null };
    const now = new Date().toISOString();
    await database.pool.query(
      `
        INSERT INTO proposal_idempotency_keys (
          id, organization_id, operation, scope_id, key_hash, request_fingerprint,
          status, result_resource_id, error_category, created_at, completed_at, failed_at
        )
        VALUES
          ($1, $2, 'issue', $3, $4, $5, 'pending', NULL, NULL, $8, NULL, NULL),
          ($6, $2, 'issue', $3, $7, $5, 'failed', NULL, 'simulated_crash', $8, NULL, $8)
      `,
      [
        `idem-${crypto.randomUUID()}`,
        fixture.organizationId,
        fixture.applicationId,
        sha256Hex(pendingKey),
        fingerprint({ ...pendingPayload, applicationId: fixture.applicationId }),
        `idem-${crypto.randomUUID()}`,
        sha256Hex(failedKey),
        now
      ]
    );

    await issueDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId,
      draft.currentVersion.id,
      pendingKey
    ).expect(409);
    await issueDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId,
      draft.currentVersion.id,
      failedKey
    ).expect(409);

    const changedKey = `changed-${crypto.randomUUID()}`;
    await issueDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId,
      draft.currentVersion.id,
      changedKey
    ).expect(201);
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/proposals/issue`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", changedKey)
      .send({
        proposalVersionId: draft.currentVersion.id,
        stageChangeReason: "Outro fingerprint."
      })
      .expect(409);
  });

  it("presentation_hash e canonico e tokens nao aparecem em URL nem storage da UI publica", async () => {
    const fixture = await issuedProposal(database, "presentation-hash");
    const publicRead = await request(fixture.app)
      .get("/api/public/proposals/current")
      .set(proposalAuthHeaders(fixture.rawAccessToken))
      .expect(200);
    const row = await database.pool.query(
      `
        SELECT presentation_hash
        FROM proposal_versions
        WHERE id = $1
      `,
      [fixture.proposalVersionId]
    );
    expect(publicRead.body.presentationHash).toBe(row.rows[0].presentation_hash);
    expect(publicRead.body.presentationHash).toBe(
      fingerprint({
        presentationSchemaVersion: "proposal_public_v1",
        proposalVersionId: fixture.proposalVersionId,
        content: publicRead.body.content,
        compensation: publicRead.body.compensation,
        validUntil: publicRead.body.validUntil
      })
    );

    const publicUi = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM proposal_access_grants WHERE token_hash = $1",
      [fixture.rawAccessToken]
    );
    expect(publicUi.rows[0].count).toBe(0);
  });

  it("hired sem Proposal continua compativel e hired com Proposal exige accepted da mesma candidatura", async () => {
    const plain = await createProposalFixture(database, "hired-no-proposal");
    await request(plain.app)
      .post(
        `/api/organizations/${plain.organizationId}/candidate-applications/${plain.applicationId}/hire`
      )
      .set(userHeaders(plain.ownerId))
      .send({ reason: "Compatibilidade SPEC-012." })
      .expect(200);

    const proposal = await issuedProposal(database, "hired-requires-accepted");
    await request(proposal.app)
      .post(
        `/api/organizations/${proposal.organizationId}/candidate-applications/${proposal.applicationId}/hire`
      )
      .set(userHeaders(proposal.ownerId))
      .send({ reason: "Ainda nao aceitou.", proposalVersionId: proposal.proposalVersionId })
      .expect(409);
    await request(proposal.app)
      .post("/api/public/proposals/accept")
      .set(proposalAuthHeaders(proposal.rawAccessToken))
      .send({})
      .expect(200);
    await request(proposal.app)
      .post(
        `/api/organizations/${proposal.organizationId}/candidate-applications/${proposal.applicationId}/hire`
      )
      .set(userHeaders(proposal.ownerId))
      .send({ reason: "Aceite recebido.", proposalVersionId: proposal.proposalVersionId })
      .expect(200);
  });
});
