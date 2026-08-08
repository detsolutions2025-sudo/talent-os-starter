import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  allowPlatformAi,
  createApp,
  createFeature,
  createOrgWithMembers,
  enableOrganizationAi,
  enableOrganizationFeature,
  makeFeatureAvailable,
  platformHeaders,
  setFallbackAllowedOnPlatform,
  setOrganizationFallback,
  userHeaders,
  type OrgFixture
} from "./helpers";

describe("phase 11 AI policies (Organization AI Settings, Feature Catalog, Organization Feature Settings)", () => {
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

  async function fixture(): Promise<OrgFixture> {
    return createOrgWithMembers(app);
  }

  // -- Organization AI Settings --------------------------------------------------------

  it("starts every new Organization with platform_ai_allowed=false and organization_ai_enabled=false", async () => {
    const org = await fixture();
    const response = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/settings`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(response.body).toMatchObject({ platformAiAllowed: false, organizationAiEnabled: false });
  });

  it("lets Owner set organization_ai_enabled even while platform_ai_allowed is false, and preserves it", async () => {
    const org = await fixture();
    await request(app)
      .put(`/api/organizations/${org.organizationId}/ai/settings`)
      .set(userHeaders(org.ownerId))
      .send({ organizationAiEnabled: true })
      .expect(200);

    const settings = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/settings`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(settings.body).toMatchObject({ platformAiAllowed: false, organizationAiEnabled: true });
  });

  it("never lets Platform Admin toggling platform_ai_allowed touch organization_ai_enabled, and the preference re-activates automatically", async () => {
    const org = await fixture();
    await request(app)
      .put(`/api/organizations/${org.organizationId}/ai/settings`)
      .set(userHeaders(org.ownerId))
      .send({ organizationAiEnabled: true })
      .expect(200);

    await allowPlatformAi(app, org.organizationId);

    const settings = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/settings`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    // organization_ai_enabled was never touched by the platform-level write, and its
    // previously stored preference now takes effect without a new Owner action.
    expect(settings.body).toMatchObject({ platformAiAllowed: true, organizationAiEnabled: true });

    await request(app)
      .put(`/api/platform/organizations/${org.organizationId}/ai/settings/platform-allowed`)
      .set(platformHeaders)
      .send({ platformAiAllowed: false })
      .expect(200);

    const afterBlock = await request(app)
      .get(`/api/platform/organizations/${org.organizationId}/ai/settings`)
      .set(platformHeaders)
      .expect(200);
    expect(afterBlock.body).toMatchObject({
      platformAiAllowed: false,
      organizationAiEnabled: true
    });
  });

  it("blocks Admin from altering Organization AI Settings", async () => {
    const org = await fixture();
    await request(app)
      .put(`/api/organizations/${org.organizationId}/ai/settings`)
      .set(userHeaders(org.adminId))
      .send({ organizationAiEnabled: true })
      .expect(403);
  });

  it("blocks Member from even reading Organization AI Settings", async () => {
    const org = await fixture();
    await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/settings`)
      .set(userHeaders(org.memberId))
      .expect(403);
  });

  it("blocks a Platform Admin actor from calling the Owner-only organization preference endpoint", async () => {
    const org = await fixture();
    await request(app)
      .put(`/api/organizations/${org.organizationId}/ai/settings`)
      .set(platformHeaders)
      .send({ organizationAiEnabled: true })
      .expect(403);
  });

  it("blocks an Owner actor from calling the Platform-Admin-only platform_ai_allowed endpoint", async () => {
    const org = await fixture();
    await request(app)
      .put(`/api/platform/organizations/${org.organizationId}/ai/settings/platform-allowed`)
      .set(userHeaders(org.ownerId))
      .send({ platformAiAllowed: true })
      .expect(403);
  });

  it("records ai.platform_ai_allowed_changed and ai.organization_ai_enabled_changed in audit_events", async () => {
    const org = await fixture();
    await allowPlatformAi(app, org.organizationId);
    await enableOrganizationAi(app, org.organizationId, org.ownerId);

    const events = await new PostgresCoreRepository(database.pool).listAuditEvents();
    const actions = events
      .filter((event) => event.organizationId === org.organizationId)
      .map((e) => e.action);
    expect(actions).toContain("ai.platform_ai_allowed_changed");
    expect(actions).toContain("ai.organization_ai_enabled_changed");
  });

  // -- AI Feature Catalog ---------------------------------------------------------------

  it("only lets Platform Admin create Features, and rejects a duplicate feature_key", async () => {
    const org = await fixture();
    await request(app)
      .post("/api/platform/ai/features")
      .set(userHeaders(org.ownerId))
      .send({ featureKey: "should_fail", name: "x" })
      .expect(403);

    const feature = await createFeature(app);
    await request(app)
      .post("/api/platform/ai/features")
      .set(platformHeaders)
      .send({ featureKey: feature.featureKey, name: "duplicate" })
      .expect(409);
  });

  it("hides a Feature from Organizations until Platform Admin makes it available", async () => {
    const org = await fixture();
    const feature = await createFeature(app);

    const before = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/features`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(before.body.map((f: { featureKey: string }) => f.featureKey)).not.toContain(
      feature.featureKey
    );

    await makeFeatureAvailable(app, feature.featureKey);

    const after = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/features`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(after.body.map((f: { featureKey: string }) => f.featureKey)).toContain(
      feature.featureKey
    );
  });

  it("blocks Owner from enabling a Feature that is not available on the platform", async () => {
    const org = await fixture();
    const feature = await createFeature(app);
    await request(app)
      .patch(`/api/organizations/${org.organizationId}/ai/features/${feature.featureKey}/enabled`)
      .set(userHeaders(org.ownerId))
      .send({ organizationFeatureEnabled: true })
      .expect(400);
  });

  it("keeps organization_feature_enabled stored (inert) when a Feature is retired, and restores its effect automatically", async () => {
    const org = await fixture();
    const feature = await createFeature(app);
    await makeFeatureAvailable(app, feature.featureKey);
    await enableOrganizationFeature(app, org.organizationId, org.ownerId, feature.featureKey);

    await request(app)
      .patch(`/api/platform/ai/features/${feature.featureKey}/availability`)
      .set(platformHeaders)
      .send({ featureAvailableOnPlatform: false })
      .expect(200);

    const hiddenList = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/features`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(hiddenList.body.map((f: { featureKey: string }) => f.featureKey)).not.toContain(
      feature.featureKey
    );

    const settingsWhileRetired = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/features/${feature.featureKey}`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(settingsWhileRetired.body.organizationFeatureEnabled).toBe(true);

    await makeFeatureAvailable(app, feature.featureKey);

    const restoredList = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/features`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(restoredList.body.map((f: { featureKey: string }) => f.featureKey)).toContain(
      feature.featureKey
    );
  });

  it("lets only Platform Admin toggle fallback_allowed_on_platform and only Owner toggle fallback_enabled", async () => {
    const org = await fixture();
    const feature = await createFeature(app);
    await makeFeatureAvailable(app, feature.featureKey);
    await enableOrganizationFeature(app, org.organizationId, org.ownerId, feature.featureKey);

    await request(app)
      .patch(`/api/platform/ai/features/${feature.featureKey}/fallback-allowed`)
      .set(userHeaders(org.ownerId))
      .send({ fallbackAllowedOnPlatform: true })
      .expect(403);
    await setFallbackAllowedOnPlatform(app, feature.featureKey, true);

    await request(app)
      .patch(`/api/organizations/${org.organizationId}/ai/features/${feature.featureKey}/fallback`)
      .set(platformHeaders)
      .send({ fallbackEnabled: true })
      .expect(403);
    await setOrganizationFallback(app, org.organizationId, org.ownerId, feature.featureKey, true);

    const settings = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/features/${feature.featureKey}`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(settings.body).toMatchObject({ fallbackEnabled: true });
  });

  it("blocks Admin and Member from altering organization_feature_enabled or fallback_enabled", async () => {
    const org = await fixture();
    const feature = await createFeature(app);
    await makeFeatureAvailable(app, feature.featureKey);

    for (const actorId of [org.adminId, org.memberId]) {
      await request(app)
        .patch(`/api/organizations/${org.organizationId}/ai/features/${feature.featureKey}/enabled`)
        .set(userHeaders(actorId))
        .send({ organizationFeatureEnabled: true })
        .expect(403);
      await request(app)
        .patch(
          `/api/organizations/${org.organizationId}/ai/features/${feature.featureKey}/fallback`
        )
        .set(userHeaders(actorId))
        .send({ fallbackEnabled: true })
        .expect(403);
    }
  });

  it("rejects mass assignment of protected fields on Feature Catalog creation", async () => {
    await request(app)
      .post("/api/platform/ai/features")
      .set(platformHeaders)
      .send({
        featureKey: "mass_assignment_test",
        name: "x",
        createdAt: "2020-01-01T00:00:00.000Z"
      })
      .expect(400);
  });
});
