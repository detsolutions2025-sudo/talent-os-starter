import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresAIRepository } from "../../src/server/persistence/postgres-ai-repository";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  configureByok,
  createApp,
  createFeature,
  createOrgWithMembers,
  makeFeatureAvailable,
  platformHeaders,
  registerModel,
  registerProvider,
  userHeaders
} from "./helpers";

describe("phase 11 AI Model Registry and Prompt Registry", () => {
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

  // -- Model Registry ---------------------------------------------------------------------

  it("only lets Platform Admin register models, and rejects a duplicate provider+model_key", async () => {
    await registerProvider(app, "fake");
    const org = await createOrgWithMembers(app);

    await request(app)
      .post("/api/platform/ai/models")
      .set(userHeaders(org.ownerId))
      .send({ provider: "fake", modelKey: "model-1", providerModelIdentifier: "fake-model-1" })
      .expect(403);

    await registerModel(app, "fake", "model-1");
    await request(app)
      .post("/api/platform/ai/models")
      .set(platformHeaders)
      .send({ provider: "fake", modelKey: "model-1", providerModelIdentifier: "fake-model-1" })
      .expect(409);
  });

  it("never sends an arbitrary provider/model string from the frontend -- models come from the registry", async () => {
    // The route only accepts provider/modelKey that already exist as a registered pair; an
    // arbitrary pair is rejected before anything else happens.
    const org = await createOrgWithMembers(app);
    const feature = await createFeature(app);
    await makeFeatureAvailable(app, feature.featureKey);
    await request(app)
      .post(`/api/organizations/${org.organizationId}/ai/routing`)
      .set(userHeaders(org.ownerId))
      .send({
        featureKey: feature.featureKey,
        provider: "nonexistent",
        modelKey: "nope",
        priority: 1
      })
      .expect(400);
  });

  it("only surfaces a model to an Organization once it is active and the Organization has a usable provider credential", async () => {
    await registerProvider(app, "fake");
    await registerModel(app, "fake", "visible-model");
    const org = await createOrgWithMembers(app);

    const beforeCredential = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/models`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(beforeCredential.body).toHaveLength(0);

    await configureByok(app, org.organizationId, org.ownerId, "fake");

    const afterCredential = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/models`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(afterCredential.body.map((m: { modelKey: string }) => m.modelKey)).toContain(
      "visible-model"
    );

    await request(app)
      .patch("/api/platform/ai/models/fake/visible-model/retire")
      .set(platformHeaders)
      .expect(200);

    const afterRetire = await request(app)
      .get(`/api/organizations/${org.organizationId}/ai/models`)
      .set(userHeaders(org.ownerId))
      .expect(200);
    expect(afterRetire.body.map((m: { modelKey: string }) => m.modelKey)).not.toContain(
      "visible-model"
    );
  });

  // -- Prompt Registry ----------------------------------------------------------------------

  it("versions prompts sequentially per prompt_key and only Platform Admin can create a draft", async () => {
    const feature = await createFeature(app);
    const org = await createOrgWithMembers(app);

    await request(app)
      .post("/api/platform/ai/prompts")
      .set(userHeaders(org.ownerId))
      .send({
        promptKey: "denied_prompt",
        featureKey: feature.featureKey,
        template: "x",
        inputSchema: {},
        outputSchema: {}
      })
      .expect(403);

    const promptKey = "versioned_prompt";
    const v1 = await request(app)
      .post("/api/platform/ai/prompts")
      .set(platformHeaders)
      .send({
        promptKey,
        featureKey: feature.featureKey,
        template: "v1",
        inputSchema: {},
        outputSchema: {}
      })
      .expect(201);
    expect(v1.body.version).toBe(1);

    const v2 = await request(app)
      .post("/api/platform/ai/prompts")
      .set(platformHeaders)
      .send({
        promptKey,
        featureKey: feature.featureKey,
        template: "v2",
        inputSchema: {},
        outputSchema: {}
      })
      .expect(201);
    expect(v2.body.version).toBe(2);
  });

  it("keeps only one published version per prompt_key, archiving the previous one atomically", async () => {
    const feature = await createFeature(app);
    const promptKey = "single_published_prompt";

    const v1 = await request(app)
      .post("/api/platform/ai/prompts")
      .set(platformHeaders)
      .send({
        promptKey,
        featureKey: feature.featureKey,
        template: "v1",
        inputSchema: {},
        outputSchema: {}
      })
      .expect(201);
    await request(app)
      .post(`/api/platform/ai/prompts/${promptKey}/versions/${v1.body.version}/publish`)
      .set(platformHeaders)
      .expect(200);

    const v2 = await request(app)
      .post("/api/platform/ai/prompts")
      .set(platformHeaders)
      .send({
        promptKey,
        featureKey: feature.featureKey,
        template: "v2",
        inputSchema: {},
        outputSchema: {}
      })
      .expect(201);
    await request(app)
      .post(`/api/platform/ai/prompts/${promptKey}/versions/${v2.body.version}/publish`)
      .set(platformHeaders)
      .expect(200);

    const versions = await request(app)
      .get(`/api/platform/ai/prompts/${promptKey}/versions`)
      .set(platformHeaders)
      .expect(200);
    const published = versions.body.filter((v: { status: string }) => v.status === "published");
    const archived = versions.body.filter((v: { status: string }) => v.status === "archived");
    expect(published).toHaveLength(1);
    expect(published[0].version).toBe(2);
    expect(archived.map((v: { version: number }) => v.version)).toContain(1);
  });

  it("rejects publishing a version that is not a draft", async () => {
    const feature = await createFeature(app);
    const promptKey = "not_draft_prompt";
    const v1 = await request(app)
      .post("/api/platform/ai/prompts")
      .set(platformHeaders)
      .send({
        promptKey,
        featureKey: feature.featureKey,
        template: "v1",
        inputSchema: {},
        outputSchema: {}
      })
      .expect(201);
    await request(app)
      .post(`/api/platform/ai/prompts/${promptKey}/versions/${v1.body.version}/publish`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .post(`/api/platform/ai/prompts/${promptKey}/versions/${v1.body.version}/publish`)
      .set(platformHeaders)
      .expect(409);
  });

  it("makes a published prompt's content immutable at the database level", async () => {
    const feature = await createFeature(app);
    const promptKey = "immutable_prompt";
    const v1 = await request(app)
      .post("/api/platform/ai/prompts")
      .set(platformHeaders)
      .send({
        promptKey,
        featureKey: feature.featureKey,
        template: "original",
        inputSchema: {},
        outputSchema: {}
      })
      .expect(201);
    await request(app)
      .post(`/api/platform/ai/prompts/${promptKey}/versions/${v1.body.version}/publish`)
      .set(platformHeaders)
      .expect(200);

    const repository = new PostgresAIRepository(database.pool);
    const published = await repository.findPublishedPrompt(promptKey);
    expect(published).not.toBeNull();

    // The application repository's updatePromptVersion() never even writes `template` (a
    // first layer of defense: there is no code path to mutate it). This proves the second,
    // database-level layer: a raw UPDATE against `template` is rejected by the
    // prevent_ai_prompt_content_mutation trigger once the row has ever been published.
    await expect(
      database.pool.query(
        "UPDATE ai_prompt_registry SET template = $1 WHERE prompt_key = $2 AND version = $3",
        ["tampered", promptKey, published!.version]
      )
    ).rejects.toThrow();
  });

  it("lets Platform Admin archive a published prompt directly, leaving no published version", async () => {
    const feature = await createFeature(app);
    const promptKey = "archive_prompt";
    const v1 = await request(app)
      .post("/api/platform/ai/prompts")
      .set(platformHeaders)
      .send({
        promptKey,
        featureKey: feature.featureKey,
        template: "v1",
        inputSchema: {},
        outputSchema: {}
      })
      .expect(201);
    await request(app)
      .post(`/api/platform/ai/prompts/${promptKey}/versions/${v1.body.version}/publish`)
      .set(platformHeaders)
      .expect(200);

    await request(app)
      .post(`/api/platform/ai/prompts/${promptKey}/archive`)
      .set(platformHeaders)
      .expect(200);

    const repository = new PostgresAIRepository(database.pool);
    expect(await repository.findPublishedPrompt(promptKey)).toBeNull();
  });

  it("requires the prompt to already exist before it can become a Feature's default prompt", async () => {
    const feature = await createFeature(app);
    await request(app)
      .patch(`/api/platform/ai/features/${feature.featureKey}/default-prompt`)
      .set(platformHeaders)
      .send({ promptKey: "does_not_exist" })
      .expect(400);
  });

  it("never binds a Feature's default prompt to a prompt_key that belongs to a different Feature", async () => {
    const ownerFeature = await createFeature(app);
    const otherFeature = await createFeature(app);
    const promptKey = "cross_feature_prompt";
    await request(app)
      .post("/api/platform/ai/prompts")
      .set(platformHeaders)
      .send({
        promptKey,
        featureKey: ownerFeature.featureKey,
        template: "v1",
        inputSchema: {},
        outputSchema: {}
      })
      .expect(201);

    await request(app)
      .patch(`/api/platform/ai/features/${otherFeature.featureKey}/default-prompt`)
      .set(platformHeaders)
      .send({ promptKey })
      .expect(400);
  });

  it("never lets a second version of the same prompt_key be created under a different Feature", async () => {
    const featureA = await createFeature(app);
    const featureB = await createFeature(app);
    const promptKey = "single_feature_lineage_prompt";
    await request(app)
      .post("/api/platform/ai/prompts")
      .set(platformHeaders)
      .send({
        promptKey,
        featureKey: featureA.featureKey,
        template: "v1",
        inputSchema: {},
        outputSchema: {}
      })
      .expect(201);

    await request(app)
      .post("/api/platform/ai/prompts")
      .set(platformHeaders)
      .send({
        promptKey,
        featureKey: featureB.featureKey,
        template: "v2",
        inputSchema: {},
        outputSchema: {}
      })
      .expect(400);
  });
});
