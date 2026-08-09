import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createApp,
  createOrgWithMembers,
  makeBlueprintReady,
  platformHeaders,
  type OrgFixture,
  userHeaders
} from "./helpers";

describe("Fase 15 - Blueprint Organizacional - ativacao", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    app = createApp(database);
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("somente Owner ativa; Admin e Member recebem 403", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);

    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.adminId))
      .expect(403);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.memberId))
      .expect(403);
  });

  it("Platform Admin (SuperAdmin) nao ativa Blueprint", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);

    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(platformHeaders)
      .expect(403);
  });

  it("Owner ativa com sucesso quando readiness e ready; grava activationReadinessSnapshot", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);

    const activated = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    expect(activated.body.status).toBe("active");
    expect(activated.body.activatedByUserId).toBe(fixture.ownerId);
    expect(activated.body.activatedAt).toBeTruthy();
    expect(activated.body.activationReadinessSnapshot).toBeTruthy();
    expect(activated.body.activationReadinessSnapshot.status).toBe("ready");
  });

  it("ativacao e recusada (409) quando readiness nao e ready, sem alterar nenhum estado", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);

    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(409);

    const status = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(status.body.active).toBeNull();
    expect(status.body.draft.status).toBe("draft");
  });

  it("nova revisao arquiva a versao active anterior atomicamente", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);
    const first = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/drafts`)
      .set(userHeaders(fixture.ownerId))
      .send({})
      .expect(201);
    const second = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    expect(second.body.versionNumber).toBe(first.body.versionNumber + 1);

    const historical = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/versions/${first.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(historical.body.status).toBe("archived");

    const active = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/active`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(active.body.id).toBe(second.body.id);
  });

  it("apenas um draft por Organization (409 ao tentar criar um segundo)", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/drafts`)
      .set(userHeaders(fixture.ownerId))
      .send({})
      .expect(409);
  });

  it("mass assignment: campos controlados pelo servidor sao rejeitados na criacao de draft", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);

    // A Organization ja nasce com um draft (RN-002); ativa-lo primeiro libera espaco para o
    // teste criar um novo draft explicitamente com um payload contendo campos proibidos.
    await makeBlueprintReady(app, fixture);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/drafts`)
      .set(userHeaders(fixture.ownerId))
      .send({ status: "active", organizationId: "someone-else", versionNumber: 999 })
      .expect(400);
  });

  it("auditoria critica registra os eventos da ativacao", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const events = await database.pool.query(
      "SELECT action FROM audit_events WHERE organization_id = $1 ORDER BY created_at",
      [fixture.organizationId]
    );
    const actions = events.rows.map((row: { action: string }) => row.action);
    expect(actions).toContain("blueprint.activation_requested");
    expect(actions).toContain("blueprint.activated");
  });

  it("auditoria nunca registra o Manifest completo", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const events = await database.pool.query(
      "SELECT metadata FROM audit_events WHERE organization_id = $1 AND action = 'blueprint.activated'",
      [fixture.organizationId]
    );
    const metadata = JSON.stringify(events.rows[0].metadata);
    expect(metadata).not.toContain("snapshotMetadata");
    expect(metadata).not.toContain("manifest");
  });
});
