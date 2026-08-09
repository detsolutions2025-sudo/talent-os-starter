import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createApp,
  createOrgWithMembers,
  makeBlueprintReady,
  type OrgFixture,
  userHeaders
} from "./helpers";

describe("Fase 15 - Blueprint Organizacional - historico, concorrencia e persistencia", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    app = createApp(database);
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("historico lista apenas versoes archived, sem payload completo dos modulos", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/drafts`)
      .set(userHeaders(fixture.ownerId))
      .send({})
      .expect(201);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const history = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/history`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    expect(history.body).toHaveLength(1);
    expect(history.body[0].status).toBe("archived");
    expect(history.body[0].manifest).toBeUndefined();
  });

  it("detalhe de versao inclui Manifest; listagem de historico nao", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);
    const activated = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const detail = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/versions/${activated.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    expect(Array.isArray(detail.body.manifest)).toBe(true);
    expect(detail.body.manifest.length).toBeGreaterThan(0);
  });

  it("duas ativacoes concorrentes: apenas uma prevalece, a outra recebe conflito seguro (nao 500)", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);

    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
        .set(userHeaders(fixture.ownerId)),
      request(app)
        .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
        .set(userHeaders(fixture.ownerId))
    ]);

    const statuses = [first.status, second.status].sort();
    // Uma das duas ativa com sucesso (200); a outra encontra o draft ja consumido (404, pois
    // o lock serializa as duas tentativas e a segunda nao encontra mais um draft `draft`) ou
    // um conflito de ativacao concorrente (409) -- nunca as duas com 200, e nunca 500.
    expect(statuses).not.toEqual([200, 200]);
    expect(statuses.every((status) => status !== 500)).toBe(true);
    expect(statuses).toContain(200);

    const active = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM organization_blueprint_versions WHERE organization_id = $1 AND status = 'active'",
      [fixture.organizationId]
    );
    expect(active.rows[0].count).toBe(1);
  });

  it("duas criacoes de draft concorrentes: apenas uma prevalece (partial unique index)", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/organizations/${fixture.organizationId}/blueprint/drafts`)
        .set(userHeaders(fixture.ownerId))
        .send({}),
      request(app)
        .post(`/api/organizations/${fixture.organizationId}/blueprint/drafts`)
        .set(userHeaders(fixture.ownerId))
        .send({})
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toContain(201);
    expect(statuses).not.toEqual([201, 201]);

    const drafts = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM organization_blueprint_versions WHERE organization_id = $1 AND status = 'draft'",
      [fixture.organizationId]
    );
    expect(drafts.rows[0].count).toBe(1);
  });

  it("estado do Blueprint persiste apos reconstruir a aplicacao (novo pool logico)", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);
    const activated = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    // "Recriar a aplicacao" e simulado construindo um novo Express app sobre o mesmo pool de
    // conexao (o dado em si esta no banco, nao em memoria do processo).
    const rebuiltApp = createApp(database);
    const status = await request(rebuiltApp)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/active`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    expect(status.body.id).toBe(activated.body.id);
    expect(status.body.status).toBe("active");
  });

  it("rotas estaticas (/readiness, /draft, /active, /history) nunca sao capturadas pela rota parametrica /versions/:versionId", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);
    const activated = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/drafts`)
      .set(userHeaders(fixture.ownerId))
      .send({})
      .expect(201);

    const readiness = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/readiness`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(readiness.body).toHaveProperty("status");
    expect(readiness.body).toHaveProperty("pendingRequired");

    const draft = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/draft`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(draft.body.status).toBe("draft");

    const active = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/active`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(active.body.id).toBe(activated.body.id);
    expect(active.body.status).toBe("active");

    const history = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/history`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(Array.isArray(history.body)).toBe(true);

    // A rota parametrica continua funcionando normalmente para um ID real.
    const versionDetail = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/versions/${activated.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(versionDetail.body.id).toBe(activated.body.id);
  });
});
