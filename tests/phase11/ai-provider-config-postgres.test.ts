import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeProviderAdapter } from "../../src/server/ai/providers/fake-adapter";
import { PostgresAIRepository } from "../../src/server/persistence/postgres-ai-repository";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createApp,
  createOrgWithMembers,
  platformHeaders,
  registerProvider,
  userHeaders,
  type OrgFixture
} from "./helpers";

const SECRET = "sk-super-secret-value-1234567890";

describe("phase 11 AI provider config (BYOK, platform-managed, rotation, revocation, test_connection)", () => {
  let database: PostgresTestDatabase;
  let adapter: FakeProviderAdapter;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    process.env.APP_ENV = "test";
    database = await createPostgresTestDatabase();
  });

  beforeEach(() => {
    process.env.APP_ENV = "test";
    adapter = new FakeProviderAdapter({ outcome: "success" });
    app = createApp(database, { resolveAdapter: () => adapter });
  });

  afterAll(async () => {
    await database.cleanup();
  });

  async function fixture(): Promise<OrgFixture> {
    const org = await createOrgWithMembers(app);
    await registerProvider(app, "fake");
    return org;
  }

  it("configures a valid BYOK credential and never returns the raw secret", async () => {
    const org = await fixture();
    const response = await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/provider-configs`)
      .set(userHeaders(org.ownerId))
      .send({ provider: "fake", credentialMode: "customer_managed", secret: SECRET })
      .expect(201);

    expect(JSON.stringify(response.body)).not.toContain(SECRET);
    expect(response.body.maskedIdentifier).toBeDefined();
    expect(response.body.status).toBe("configured");
  });

  it("rejects an invalid credential without persisting any configuration", async () => {
    const org = await fixture();
    adapter.setScenario({ outcome: "authentication_error" });

    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/provider-configs`)
      .set(userHeaders(org.ownerId))
      .send({ provider: "fake", credentialMode: "customer_managed", secret: SECRET })
      .expect((response) => {
        expect(response.status).toBeGreaterThanOrEqual(400);
      });

    const status = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/provider-configs/fake`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(status.body).toBeNull();
  });

  it("never records the secret in audit_events, even on a successful configuration", async () => {
    const org = await fixture();
    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/provider-configs`)
      .set(userHeaders(org.ownerId))
      .send({ provider: "fake", credentialMode: "customer_managed", secret: SECRET })
      .expect(201);

    const events = await new PostgresCoreRepository(database.pool).listAuditEvents();
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(SECRET);
  });

  it("only lets Owner configure customer_managed credentials, never Platform Admin", async () => {
    const org = await fixture();
    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/provider-configs`)
      .set(platformHeaders)
      .send({ provider: "fake", credentialMode: "customer_managed", secret: SECRET })
      .expect(403);
  });

  it("only lets Platform Admin configure and revoke platform_managed credentials, never Owner", async () => {
    const org = await fixture();
    await request(app)
      .post(`/api/platform/organizations/${org.organizationId}/ai/providers/fake/platform-managed`)
      .set(userHeaders(org.ownerId))
      .send({ secret: SECRET })
      .expect(403);

    await request(app)
      .post(`/api/platform/organizations/${org.organizationId}/ai/providers/fake/platform-managed`)
      .set(platformHeaders)
      .send({ secret: SECRET })
      .expect(201);

    await request(app)
      .delete(
        `/api/platform/organizations/${org.organizationId}/ai/providers/fake/platform-managed`
      )
      .set(userHeaders(org.ownerId))
      .expect(403);
    await request(app)
      .delete(
        `/api/platform/organizations/${org.organizationId}/ai/providers/fake/platform-managed`
      )
      .set(platformHeaders)
      .expect(200);
  });

  it("rotates a credential: only one config stays active, history is preserved", async () => {
    const org = await fixture();
    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/provider-configs`)
      .set(userHeaders(org.ownerId))
      .send({ provider: "fake", credentialMode: "customer_managed", secret: `${SECRET}-v1` })
      .expect(201);

    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/provider-configs`)
      .set(userHeaders(org.ownerId))
      .send({ provider: "fake", credentialMode: "customer_managed", secret: `${SECRET}-v2` })
      .expect(201);

    const activeList = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/provider-configs`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(activeList.body.filter((c: { provider: string }) => c.provider === "fake")).toHaveLength(
      1
    );

    const allRows = await new PostgresAIRepository(database.pool).listProviderConfigs(
      org.organizationId
    );
    expect(allRows.filter((row) => row.provider === "fake")).toHaveLength(2);
    expect(allRows.filter((row) => row.provider === "fake" && row.isActive)).toHaveLength(1);
  });

  it("preserves the previous active credential when a rotation attempt is invalid", async () => {
    const org = await fixture();
    const configured = await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/provider-configs`)
      .set(userHeaders(org.ownerId))
      .send({ provider: "fake", credentialMode: "customer_managed", secret: SECRET })
      .expect(201);

    adapter.setScenario({ outcome: "authentication_error" });
    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/provider-configs`)
      .set(userHeaders(org.ownerId))
      .send({ provider: "fake", credentialMode: "customer_managed", secret: `${SECRET}-bad` })
      .expect((response) => expect(response.status).toBeGreaterThanOrEqual(400));

    const status = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/provider-configs/fake`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(status.body.id).toBe(configured.body.id);
    expect(status.body.status).toBe("configured");
  });

  it("revokes a credential and removes it from the active list", async () => {
    const org = await fixture();
    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/provider-configs`)
      .set(userHeaders(org.ownerId))
      .send({ provider: "fake", credentialMode: "customer_managed", secret: SECRET })
      .expect(201);

    await request(app)
      .delete(`/api/organizations/${org.organizationId}/ai/provider-configs/fake`)
      .set(userHeaders(org.ownerId))
      .expect(200);

    const status = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/provider-configs/fake`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(status.body).toBeNull();
  });

  it("isolates provider configs between Organizations", async () => {
    const orgA = await fixture();
    const orgB = await createOrgWithMembers(app);

    await request(app)
      .post(`/api/organizations/${orgA.organizationId}/ai/provider-configs`)
      .set(userHeaders(orgA.ownerId))
      .send({ provider: "fake", credentialMode: "customer_managed", secret: SECRET })
      .expect(201);

    const crossOrgStatus = await request(app)
      .get(`/api/organizations/${orgB.organizationId}/ai/provider-configs/fake`)
      .set(userHeaders(orgB.ownerId))
      .expect(200);
    expect(crossOrgStatus.body).toBeNull();
  });

  it("lets Owner trigger a real test_connection for customer_managed, but never Admin", async () => {
    const org = await fixture();
    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/provider-configs`)
      .set(userHeaders(org.ownerId))
      .send({ provider: "fake", credentialMode: "customer_managed", secret: SECRET })
      .expect(201);

    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/provider-configs/fake/test-connection`)
      .set(userHeaders(org.ownerId))
      .expect(200);

    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/provider-configs/fake/test-connection`)
      .set(userHeaders(org.adminId))
      .expect(403);
  });

  it("enforces a rate limit on test_connection separate from execution rate limiting", async () => {
    const org = await fixture();
    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/provider-configs`)
      .set(userHeaders(org.ownerId))
      .send({ provider: "fake", credentialMode: "customer_managed", secret: SECRET })
      .expect(201);

    const results: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const response = await request(app)
        .post(`/api/organizations/${org.organizationId}/ai/provider-configs/fake/test-connection`)
        .set(userHeaders(org.ownerId));
      results.push(response.status);
    }

    expect(results.filter((status) => status === 429).length).toBeGreaterThan(0);
  });
});
