import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../../src/server/core/types";
import { FakeProviderAdapter } from "../../src/server/ai/providers/fake-adapter";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createAppWithAiService,
  createOrgWithMembers,
  createRoute,
  registerModel,
  setupExecutableFeature,
  userHeaders,
  type OrgFixture
} from "./helpers";

describe("phase 11 AI auditoria and mass assignment", () => {
  let database: PostgresTestDatabase;
  let adapter: FakeProviderAdapter;
  let app: ReturnType<typeof createAppWithAiService>["app"];
  let aiService: ReturnType<typeof createAppWithAiService>["aiService"];

  beforeAll(async () => {
    process.env.APP_ENV = "test";
    database = await createPostgresTestDatabase();
  });

  beforeEach(() => {
    process.env.APP_ENV = "test";
    adapter = new FakeProviderAdapter({ outcome: "success", structuredOutput: { ok: true } });
    const created = createAppWithAiService(database, { resolveAdapter: () => adapter });
    app = created.app;
    aiService = created.aiService;
  });

  afterAll(async () => {
    await database.cleanup();
  });

  async function auditActionsFor(organizationId: string) {
    const events = await new PostgresCoreRepository(database.pool).listAuditEvents();
    return events
      .filter((event) => event.organizationId === organizationId)
      .map((event) => event.action);
  }

  async function fixture(): Promise<OrgFixture> {
    return createOrgWithMembers(app);
  }

  it("records ai.routing_selected for both a successful and a failed attempt", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    const actor: Actor = { kind: "user", userId: org.ownerId };

    await aiService.gateway.execute(actor, org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    adapter.setScenario({ outcome: "authentication_error" });
    await aiService.gateway.execute(actor, org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    const actions = await auditActionsFor(org.organizationId);
    expect(
      actions.filter((action) => action === "ai.routing_selected").length
    ).toBeGreaterThanOrEqual(2);
    expect(actions).toContain("ai.execution_succeeded");
    expect(actions).toContain("ai.execution_failed");
  });

  it("records ai.routing_invalid_denied when a duplicate active priority is rejected", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    await registerModel(app, setup.provider, "duplicate-priority-model");

    const duplicate = await createRoute(
      app,
      org.organizationId,
      org.ownerId,
      setup.featureKey,
      setup.provider,
      "duplicate-priority-model",
      1
    );
    expect(duplicate.status).toBe(409);

    const actions = await auditActionsFor(org.organizationId);
    expect(actions).toContain("ai.routing_invalid_denied");
  });

  it("never lets a client set organization_id, status or other protected fields on provider config creation", async () => {
    const org = await fixture();
    await request(app)
      .post("/api/organizations/does-not-matter/ai/provider-configs")
      .set(userHeaders(org.ownerId))
      .send({
        provider: "fake",
        credentialMode: "customer_managed",
        secret: "x",
        status: "configured",
        organizationId: "someone-elses-org"
      })
      .expect(400);
  });

  it("never lets a client set id, status or autoria fields when creating a routing policy", async () => {
    const org = await fixture();
    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/routing`)
      .set(userHeaders(org.ownerId))
      .send({
        featureKey: "whatever",
        provider: "fake",
        modelKey: "model-1",
        priority: 1,
        id: "attacker-chosen-id",
        status: "active"
      })
      .expect(400);
  });

  it("never registers a duplicate provider or model without auditing the platform action for the first registration", async () => {
    await request(app)
      .post("/api/platform/ai/providers")
      .set({ "x-dev-platform-admin": "true" })
      .send({ providerKey: "audit-check-provider", name: "x" })
      .expect(201);

    const events = await new PostgresCoreRepository(database.pool).listAuditEvents();
    expect(events.map((event) => event.action)).toContain("ai.provider_registered");
  });
});
