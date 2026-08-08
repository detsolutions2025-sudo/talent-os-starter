import request from "supertest";
import type { CreateAIServiceOptions } from "../../src/server/ai/service";
import { createPostgresAIService } from "../../src/server/ai/service";
import { createServer } from "../../src/server/app";
import { createPostgresCandidateApplicationService } from "../../src/server/candidate-applications/service";
import { createPostgresCandidateService } from "../../src/server/candidates/service";
import { createPostgresCompetencyService } from "../../src/server/competencies/service";
import { createCoreService } from "../../src/server/core/service";
import { createPostgresDnaService } from "../../src/server/dna/service";
import { createPostgresInterviewService } from "../../src/server/interviews/service";
import { createPostgresJobOpeningService } from "../../src/server/job-openings/service";
import { createPostgresJobProfileService } from "../../src/server/job-profiles/service";
import { createPostgresOrganizationalUnitService } from "../../src/server/organizational-units/service";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresQuestionService } from "../../src/server/questions/service";
import type { PostgresTestDatabase } from "../helpers/postgres-test-db";

export const platformHeaders = { "x-dev-platform-admin": "true" };

export function userHeaders(userId: string) {
  return { "x-dev-user-id": userId };
}

export function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
}

export function createApp(database: PostgresTestDatabase, aiOptions: CreateAIServiceOptions = {}) {
  return createAppWithAiService(database, aiOptions).app;
}

// Returns the AIService instance alongside the wired Express app, so a test can both drive
// HTTP setup (feature/provider/model/prompt/routing/credential) through the same routes a real
// client would use, and call the non-HTTP-exposed AIGateway directly
// (SPEC-014 "Nao criar endpoint HTTP generico POST /ai/execute").
export function createAppWithAiService(
  database: PostgresTestDatabase,
  aiOptions: CreateAIServiceOptions = {}
) {
  const aiService = createPostgresAIService(database.pool, aiOptions);
  const app = createServer(
    createCoreService(new PostgresCoreRepository(database.pool)),
    createPostgresDnaService(database.pool),
    createPostgresOrganizationalUnitService(database.pool),
    createPostgresCompetencyService(database.pool),
    createPostgresJobProfileService(database.pool),
    createPostgresQuestionService(database.pool),
    createPostgresJobOpeningService(database.pool),
    createPostgresCandidateService(database.pool),
    createPostgresCandidateApplicationService(database.pool),
    createPostgresInterviewService(database.pool),
    aiService
  );
  return { app, aiService };
}

export async function createUser(app: ReturnType<typeof createServer>, prefix: string) {
  const response = await request(app)
    .post("/api/dev/users")
    .set(platformHeaders)
    .send({ name: prefix, email: `${unique(prefix)}@example.com` })
    .expect(201);
  return response.body as { id: string };
}

export async function createOrganization(app: ReturnType<typeof createServer>, ownerId: string) {
  const slug = unique("ai-org");
  const response = await request(app)
    .post("/api/organizations")
    .set(platformHeaders)
    .send({ name: `Organization ${slug}`, slug, initialOwnerUserId: ownerId })
    .expect(201);
  return response.body as { organization: { id: string } };
}

export async function addMembership(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  userId: string,
  role: "admin" | "member"
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/memberships`)
    .set(userHeaders(ownerId))
    .send({ userId, role })
    .expect(201);
  return response.body as { id: string };
}

export type OrgFixture = {
  organizationId: string;
  ownerId: string;
  adminId: string;
  memberId: string;
};

export async function createOrgWithMembers(
  app: ReturnType<typeof createServer>
): Promise<OrgFixture> {
  const owner = await createUser(app, "owner");
  const admin = await createUser(app, "admin");
  const member = await createUser(app, "member");
  const org = await createOrganization(app, owner.id);
  await addMembership(app, org.organization.id, owner.id, admin.id, "admin");
  await addMembership(app, org.organization.id, owner.id, member.id, "member");
  return {
    organizationId: org.organization.id,
    ownerId: owner.id,
    adminId: admin.id,
    memberId: member.id
  };
}

export async function allowPlatformAi(
  app: ReturnType<typeof createServer>,
  organizationId: string
) {
  await request(app)
    .put(`/api/platform/organizations/${organizationId}/ai/settings/platform-allowed`)
    .set(platformHeaders)
    .send({ platformAiAllowed: true })
    .expect(200);
}

export async function enableOrganizationAi(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string
) {
  await request(app)
    .put(`/api/organizations/${organizationId}/ai/settings`)
    .set(userHeaders(ownerId))
    .send({ organizationAiEnabled: true })
    .expect(200);
}

export async function createFeature(
  app: ReturnType<typeof createServer>,
  overrides: Record<string, unknown> = {}
) {
  const featureKey = unique("feature").replaceAll("-", "_");
  const response = await request(app)
    .post("/api/platform/ai/features")
    .set(platformHeaders)
    .send({ featureKey, name: "Test Feature", ...overrides })
    .expect(201);
  return response.body as { featureKey: string };
}

export async function makeFeatureAvailable(
  app: ReturnType<typeof createServer>,
  featureKey: string
) {
  await request(app)
    .patch(`/api/platform/ai/features/${featureKey}/availability`)
    .set(platformHeaders)
    .send({ featureAvailableOnPlatform: true })
    .expect(200);
}

export async function setFallbackAllowedOnPlatform(
  app: ReturnType<typeof createServer>,
  featureKey: string,
  value: boolean
) {
  await request(app)
    .patch(`/api/platform/ai/features/${featureKey}/fallback-allowed`)
    .set(platformHeaders)
    .send({ fallbackAllowedOnPlatform: value })
    .expect(200);
}

export async function enableOrganizationFeature(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  featureKey: string
) {
  await request(app)
    .patch(`/api/organizations/${organizationId}/ai/features/${featureKey}/enabled`)
    .set(userHeaders(ownerId))
    .send({ organizationFeatureEnabled: true })
    .expect(200);
}

export async function setOrganizationFallback(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  featureKey: string,
  value: boolean
) {
  await request(app)
    .patch(`/api/organizations/${organizationId}/ai/features/${featureKey}/fallback`)
    .set(userHeaders(ownerId))
    .send({ fallbackEnabled: value })
    .expect(200);
}

export async function registerProvider(app: ReturnType<typeof createServer>, providerKey = "fake") {
  const response = await request(app).post("/api/platform/ai/providers").set(platformHeaders).send({
    providerKey,
    name: "Fake Provider"
  });
  if (response.status === 201) {
    return response.body as { providerKey: string };
  }
  return { providerKey };
}

// Tolerates the model already being registered (409) so the same default provider/model pair
// can be reused as fixture data across many `it()` blocks within one test file, which all
// share a single Postgres schema created once in `beforeAll`.
export async function registerModel(
  app: ReturnType<typeof createServer>,
  provider: string,
  modelKey: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await request(app)
    .post("/api/platform/ai/models")
    .set(platformHeaders)
    .send({
      provider,
      modelKey,
      providerModelIdentifier: `${provider}-${modelKey}-v1`,
      ...overrides
    });
  if (response.status !== 201 && response.status !== 409) {
    throw new Error(
      `Failed to register model ${provider}/${modelKey}: ${JSON.stringify(response.body)}`
    );
  }
}

export async function createAndPublishPrompt(
  app: ReturnType<typeof createServer>,
  featureKey: string,
  overrides: Record<string, unknown> = {}
) {
  const promptKey = unique("prompt").replaceAll("-", "_");
  const draft = await request(app)
    .post("/api/platform/ai/prompts")
    .set(platformHeaders)
    .send({
      promptKey,
      featureKey,
      template: "You are a helpful assistant. Respond using the schema.",
      inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
      ...overrides
    })
    .expect(201);

  await request(app)
    .post(`/api/platform/ai/prompts/${promptKey}/versions/${draft.body.version}/publish`)
    .set(platformHeaders)
    .expect(200);

  await request(app)
    .patch(`/api/platform/ai/features/${featureKey}/default-prompt`)
    .set(platformHeaders)
    .send({ promptKey })
    .expect(200);

  return { promptKey, version: draft.body.version as number };
}

export async function configureByok(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  provider: string,
  secret = "super-secret-value"
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/ai/provider-configs`)
    .set(userHeaders(ownerId))
    .send({ provider, credentialMode: "customer_managed", secret })
    .expect(201);
  return response.body as { id: string; maskedIdentifier: string };
}

export async function createRoute(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  featureKey: string,
  provider: string,
  modelKey: string,
  priority: number
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/ai/routing`)
    .set(userHeaders(ownerId))
    .send({ featureKey, provider, modelKey, priority });
  return response;
}

// End-to-end setup for a fully executable Feature: catalog + availability + prompt + provider
// + model + BYOK credential + routing. Returns everything a Gateway.execute() call needs.
export async function setupExecutableFeature(
  app: ReturnType<typeof createServer>,
  fixture: OrgFixture,
  options: {
    provider?: string;
    modelKey?: string;
    requiredCapabilities?: Record<string, unknown>;
  } = {}
) {
  const provider = options.provider ?? "fake";
  const modelKey = options.modelKey ?? "fake-model";

  await allowPlatformAi(app, fixture.organizationId);
  await enableOrganizationAi(app, fixture.organizationId, fixture.ownerId);

  const feature = await createFeature(app, {
    requiredCapabilities: options.requiredCapabilities ?? {}
  });
  await makeFeatureAvailable(app, feature.featureKey);
  await enableOrganizationFeature(app, fixture.organizationId, fixture.ownerId, feature.featureKey);

  await registerProvider(app, provider);
  await registerModel(app, provider, modelKey);
  await configureByok(app, fixture.organizationId, fixture.ownerId, provider);
  await createRoute(
    app,
    fixture.organizationId,
    fixture.ownerId,
    feature.featureKey,
    provider,
    modelKey,
    1
  ).then((response) => {
    if (response.status !== 201) {
      throw new Error(`Failed to create route: ${JSON.stringify(response.body)}`);
    }
  });

  const prompt = await createAndPublishPrompt(app, feature.featureKey);

  return { featureKey: feature.featureKey, provider, modelKey, promptKey: prompt.promptKey };
}
