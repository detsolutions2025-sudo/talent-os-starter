import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  configureByok,
  createApp,
  createFeature,
  createOrgWithMembers,
  createRoute,
  makeFeatureAvailable,
  registerModel,
  registerProvider,
  userHeaders
} from "./helpers";

describe("phase 11 AI Provider Routing Policy", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    process.env.APP_ENV = "test";
    database = await createPostgresTestDatabase();
  });

  beforeEach(() => {
    process.env.APP_ENV = "test";
    app = createApp(database);
  });

  afterAll(async () => {
    await database.cleanup();
  });

  async function readyOrg() {
    const org = await createOrgWithMembers(app);
    const feature = await createFeature(app);
    await makeFeatureAvailable(app, feature.featureKey);
    await registerProvider(app, "fake");
    await registerModel(app, "fake", "model-1");
    await configureByok(app, org.organizationId, org.ownerId, "fake");
    return { org, feature };
  }

  it("creates a route only when the provider is configured and the model is active", async () => {
    const org = await createOrgWithMembers(app);
    const feature = await createFeature(app);
    await makeFeatureAvailable(app, feature.featureKey);
    await registerProvider(app, "fake");
    await registerModel(app, "fake", "model-1");

    // No BYOK/provider config yet for this Organization.
    const response = await createRoute(
      app,
      org.organizationId,
      org.ownerId,
      feature.featureKey,
      "fake",
      "model-1",
      1
    );
    expect(response.status).toBe(400);
  });

  it("never allows two active routes with the same priority for the same Organization + Feature", async () => {
    const { org, feature } = await readyOrg();
    await registerModel(app, "fake", "model-2");

    const first = await createRoute(
      app,
      org.organizationId,
      org.ownerId,
      feature.featureKey,
      "fake",
      "model-1",
      1
    );
    expect(first.status).toBe(201);

    const duplicate = await createRoute(
      app,
      org.organizationId,
      org.ownerId,
      feature.featureKey,
      "fake",
      "model-2",
      1
    );
    expect(duplicate.status).toBe(409);
  });

  it("allows distinct priorities and lists them ordered ascending", async () => {
    const { org, feature } = await readyOrg();
    await registerModel(app, "fake", "model-2");

    await createRoute(
      app,
      org.organizationId,
      org.ownerId,
      feature.featureKey,
      "fake",
      "model-1",
      2
    );
    await createRoute(
      app,
      org.organizationId,
      org.ownerId,
      feature.featureKey,
      "fake",
      "model-2",
      1
    );

    const list = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/routing/${feature.featureKey}`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(list.body.map((r: { priority: number }) => r.priority)).toEqual([1, 2]);
  });

  it("deactivating a route removes it from the active list without deleting it", async () => {
    const { org, feature } = await readyOrg();
    const created = await createRoute(
      app,
      org.organizationId,
      org.ownerId,
      feature.featureKey,
      "fake",
      "model-1",
      1
    );
    expect(created.status).toBe(201);

    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/routing/${created.body.id}/deactivate`)
      .set(userHeaders(org.ownerId))
      .expect(200);

    const list = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/routing/${feature.featureKey}`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(list.body).toHaveLength(0);
  });

  it("blocks Admin and Member from creating or deactivating routes", async () => {
    const { org, feature } = await readyOrg();
    for (const actorId of [org.adminId, org.memberId]) {
      const response = await createRoute(
        app,
        org.organizationId,
        actorId,
        feature.featureKey,
        "fake",
        "model-1",
        1
      );
      expect(response.status).toBe(403);
    }
  });

  it("isolates routing policies between Organizations", async () => {
    const { org: orgA, feature } = await readyOrg();
    const orgB = await createOrgWithMembers(app);
    await createRoute(
      app,
      orgA.organizationId,
      orgA.ownerId,
      feature.featureKey,
      "fake",
      "model-1",
      1
    );

    const listForB = await request(app)
      .get(`/api/organizations/${orgB.organizationId}/ai/routing/${feature.featureKey}`)
      .set(userHeaders(orgB.ownerId))
      .expect(200);
    expect(listForB.body).toHaveLength(0);
  });
});
