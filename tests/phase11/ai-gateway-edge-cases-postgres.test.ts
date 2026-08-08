import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../../src/server/core/types";
import { FakeProviderAdapter } from "../../src/server/ai/providers/fake-adapter";
import type { SecretManager } from "../../src/server/ai/secrets/secret-manager";
import { InMemorySecretManager } from "../../src/server/ai/secrets/secret-manager";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  configureByok,
  createAppWithAiService,
  createFeature,
  createOrgWithMembers,
  createRoute,
  makeFeatureAvailable,
  platformHeaders,
  registerModel,
  registerProvider,
  setFallbackAllowedOnPlatform,
  setOrganizationFallback,
  setupExecutableFeature,
  unique,
  userHeaders,
  type OrgFixture
} from "./helpers";

// Covers Gateway edge cases not exercised by ai-gateway-postgres.test.ts: Feature x Model
// compatibility, prompt draft/archived blocking execution, a rotated-out/revoked provider
// config never being resolved again, a retired model blocking execution, the mirrored fallback
// authorization case, additional fallback-ineligible categories, the rate_limited error
// category as reported *by the provider* (as opposed to the Gateway's own rate limiter), real
// (not just adapter-declared) timeout enforcement, retry-before-fallback as a combined
// sequence, and direct proof that a policy denial never resolves a secret.
describe("phase 11 AIGateway edge cases", () => {
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
    const created = createAppWithAiService(database, {
      resolveAdapter: () => adapter,
      gatewayOptions: { executionTimeoutMs: 500, maxRetriesPerRoute: 1, retryBackoffMs: 5 }
    });
    app = created.app;
    aiService = created.aiService;
  });

  afterAll(async () => {
    await database.cleanup();
  });

  async function fixture(): Promise<OrgFixture> {
    return createOrgWithMembers(app);
  }

  function ownerActor(org: OrgFixture): Actor {
    return { kind: "user", userId: org.ownerId };
  }

  // -- Compatibilidade Feature x Modelo ----------------------------------------------------

  it("recusa um modelo incompativel com a Feature antes de qualquer chamada ao provider (SPEC-014 teste 31/54)", async () => {
    const org = await fixture();
    // The model registered by setupExecutableFeature never sets contextWindow, so it stays
    // null -- any positive contextWindow requirement makes it incompatible.
    const setup = await setupExecutableFeature(app, org, {
      requiredCapabilities: { contextWindow: 8000 }
    });

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({ kind: "failed", errorCategory: "configuration_error" });
    expect(adapter.executeCallCount).toBe(0);
  });

  // -- Prompt draft / archived --------------------------------------------------------------

  async function setupWithoutPublishedPrompt(org: OrgFixture) {
    const provider = "fake";
    const modelKey = "fake-model";
    await request(app)
      .put(`/api/platform/organizations/${org.organizationId}/ai/settings/platform-allowed`)
      .set(platformHeaders)
      .send({ platformAiAllowed: true })
      .expect(200);
    await request(app)
      .put(`/api/organizations/${org.organizationId}/ai/settings`)
      .set(userHeaders(org.ownerId))
      .send({ organizationAiEnabled: true })
      .expect(200);
    const feature = await createFeature(app);
    await makeFeatureAvailable(app, feature.featureKey);
    await request(app)
      .patch(`/api/organizations/${org.organizationId}/ai/features/${feature.featureKey}/enabled`)
      .set(userHeaders(org.ownerId))
      .send({ organizationFeatureEnabled: true })
      .expect(200);
    await registerProvider(app, provider);
    await registerModel(app, provider, modelKey);
    await configureByok(app, org.organizationId, org.ownerId, provider);
    const route = await createRoute(
      app,
      org.organizationId,
      org.ownerId,
      feature.featureKey,
      provider,
      modelKey,
      1
    );
    expect(route.status).toBe(201);
    return feature.featureKey;
  }

  it("bloqueia execucao quando o prompt vinculado a Feature esta em draft (SPEC-014 teste 32)", async () => {
    const org = await fixture();
    const featureKey = await setupWithoutPublishedPrompt(org);

    const draft = await request(app)
      .post("/api/platform/ai/prompts")
      .set(platformHeaders)
      .send({
        promptKey: `draft_only_${featureKey}`,
        featureKey,
        template: "never published",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"]
        },
        outputSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }
      })
      .expect(201);
    // Bound as the Feature's default prompt while still in `draft` -- setDefaultPromptKey only
    // requires the prompt_key to exist, never that it already has a published version.
    await request(app)
      .patch(`/api/platform/ai/features/${featureKey}/default-prompt`)
      .set(platformHeaders)
      .send({ promptKey: draft.body.promptKey })
      .expect(200);

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({
      kind: "denied",
      errorCategory: "configuration_error",
      reason: "prompt_not_published"
    });
    expect(adapter.executeCallCount).toBe(0);
  });

  it("bloqueia execucao quando o prompt vinculado a Feature esta archived (SPEC-014 teste 33)", async () => {
    const org = await fixture();
    const featureKey = await setupWithoutPublishedPrompt(org);

    const promptKey = `archived_${featureKey}`;
    const v1 = await request(app)
      .post("/api/platform/ai/prompts")
      .set(platformHeaders)
      .send({
        promptKey,
        featureKey,
        template: "v1",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"]
        },
        outputSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }
      })
      .expect(201);
    await request(app)
      .post(`/api/platform/ai/prompts/${promptKey}/versions/${v1.body.version}/publish`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .patch(`/api/platform/ai/features/${featureKey}/default-prompt`)
      .set(platformHeaders)
      .send({ promptKey })
      .expect(200);
    await request(app)
      .post(`/api/platform/ai/prompts/${promptKey}/archive`)
      .set(platformHeaders)
      .expect(200);

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({
      kind: "denied",
      errorCategory: "configuration_error",
      reason: "prompt_not_published"
    });
    expect(adapter.executeCallCount).toBe(0);
  });

  // -- Historical provider config / retired model never used again ------------------------

  it("nunca usa uma configuracao de provider revogada/rotacionada em uma nova execucao (SPEC-014 teste 18/29)", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);

    await request(app)
      .delete(`/api/organizations/${org.organizationId}/ai/provider-configs/${setup.provider}`)
      .set(userHeaders(org.ownerId))
      .expect(200);

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({ kind: "failed", errorCategory: "configuration_error" });
    expect(adapter.executeCallCount).toBe(0);
  });

  it("bloqueia execucao quando o modelo da rota foi retirado do registry apos a rota ter sido criada (SPEC-014 teste 30)", async () => {
    const org = await fixture();
    // A dedicated, disposable model_key -- retiring it must never poison the shared
    // "fake"/"fake-model" fixture pair that every other test in this file (and the ones that
    // run after it) relies on via setupExecutableFeature's default.
    const setup = await setupExecutableFeature(app, org, { modelKey: unique("retire-me-model") });

    await request(app)
      .patch(`/api/platform/ai/models/${setup.provider}/${setup.modelKey}/retire`)
      .set(platformHeaders)
      .expect(200);

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({ kind: "failed", errorCategory: "configuration_error" });
    expect(adapter.executeCallCount).toBe(0);
  });

  // -- Fallback: mirrored authorization case + broader ineligible-cause coverage ----------

  it("bloqueia fallback quando fallback_allowed_on_platform=false mesmo com fallback_enabled=true (SPEC-014 teste 36)", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    await registerModel(app, setup.provider, "mirrored-fallback-model");
    await createRoute(
      app,
      org.organizationId,
      org.ownerId,
      setup.featureKey,
      setup.provider,
      "mirrored-fallback-model",
      2
    );
    // fallback_allowed_on_platform deliberately left false; only the Organization opts in.
    await setOrganizationFallback(app, org.organizationId, org.ownerId, setup.featureKey, true);

    adapter.setScenario({ outcome: "quota_exceeded" });

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({ kind: "failed", errorCategory: "quota_exceeded" });
    expect(adapter.executeCallCount).toBe(1);
  });

  for (const ineligible of ["configuration_error", "content_blocked"] as const) {
    it(`nunca faz fallback para causa nao elegivel: ${ineligible} (SPEC-014 teste 41)`, async () => {
      const org = await fixture();
      const setup = await setupExecutableFeature(app, org);
      await registerModel(app, setup.provider, `should-not-be-tried-${ineligible}`);
      await createRoute(
        app,
        org.organizationId,
        org.ownerId,
        setup.featureKey,
        setup.provider,
        `should-not-be-tried-${ineligible}`,
        2
      );
      await setFallbackAllowedOnPlatform(app, setup.featureKey, true);
      await setOrganizationFallback(app, org.organizationId, org.ownerId, setup.featureKey, true);

      adapter.setScenario({ outcome: ineligible });

      const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
        featureKey: setup.featureKey,
        input: { text: "hello" }
      });

      expect(result).toMatchObject({ kind: "failed", errorCategory: ineligible });
      expect(adapter.executeCallCount).toBe(1);
    });
  }

  // -- rate_limited reported by the provider itself (distinct from the Gateway's own limiter) --

  it("normaliza uma falha de rate limit reportada pelo proprio provider como error_category = rate_limited (SPEC-014 teste 50)", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    adapter.setScenario({ outcome: "rate_limited" });

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({ kind: "failed", errorCategory: "rate_limited" });
    // rate_limited is retryable -- exactly 2 calls (initial + 1 retry) with maxRetriesPerRoute=1.
    expect(adapter.executeCallCount).toBe(2);
  });

  // -- Real Gateway-enforced timeout, not just an adapter-declared "timeout" outcome -------

  it("aborta uma chamada que excede o timeout configurado, mesmo que o provider fosse eventualmente responder com sucesso (SPEC-014 teste 44/45)", async () => {
    const created = createAppWithAiService(database, {
      resolveAdapter: () => adapter,
      gatewayOptions: { executionTimeoutMs: 30, maxRetriesPerRoute: 0, retryBackoffMs: 0 }
    });
    const localApp = created.app;
    const localAiService = created.aiService;
    const org2 = await createOrgWithMembers(localApp);
    const setup = await setupExecutableFeature(localApp, org2);
    // Declares eventual success, but takes far longer than the 30ms execution timeout --
    // proving the Gateway's own AbortController fires, not that the adapter "decided" to fail.
    adapter.setScenario({ outcome: "success", latencyMs: 2000, structuredOutput: { ok: true } });

    const result = await localAiService.gateway.execute(
      { kind: "user", userId: org2.ownerId },
      org2.organizationId,
      { featureKey: setup.featureKey, input: { text: "hello" } }
    );

    expect(result).toMatchObject({ kind: "failed", errorCategory: "timeout" });
  }, 10000);

  // -- Retry (on the primary route) strictly before any fallback attempt ------------------

  it("esgota o retry limitado da rota primaria antes de tentar qualquer fallback (SPEC-014 teste 87/88)", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    await registerModel(app, setup.provider, "fallback-after-retry-model");
    await createRoute(
      app,
      org.organizationId,
      org.ownerId,
      setup.featureKey,
      setup.provider,
      "fallback-after-retry-model",
      2
    );
    await setFallbackAllowedOnPlatform(app, setup.featureKey, true);
    await setOrganizationFallback(app, org.organizationId, org.ownerId, setup.featureKey, true);

    // network_error is both retryable and fallback-eligible. With maxRetriesPerRoute=1, route 1
    // must be attempted exactly twice (initial + retry) -- both failing -- before route 2 (the
    // fallback) is ever tried.
    adapter.setScenarioSequence([
      { outcome: "network_error" },
      { outcome: "network_error" },
      { outcome: "success", structuredOutput: { ok: true } }
    ]);

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result.kind).toBe("executed");
    if (result.kind === "executed") {
      expect(result.usage.modelKey).toBe("fallback-after-retry-model");
    }
    expect(adapter.executeCallCount).toBe(3);
  });

  // -- Direct proof that a policy denial never resolves a secret or calls the adapter -----

  it("nunca chama SecretManager.resolve nem o ProviderAdapter quando qualquer uma das quatro condicoes de politica falha (SPEC-014 secao 6)", async () => {
    let resolveCalls = 0;
    const inner = new InMemorySecretManager("test");
    const spySecretManager: SecretManager = {
      store: (organizationId, provider, secret) => inner.store(organizationId, provider, secret),
      resolve: (secretReference, organizationId) => {
        resolveCalls += 1;
        return inner.resolve(secretReference, organizationId);
      },
      revoke: (secretReference, organizationId) => inner.revoke(secretReference, organizationId)
    };
    const spyAdapter = new FakeProviderAdapter({
      outcome: "success",
      structuredOutput: { ok: true }
    });
    const created = createAppWithAiService(database, {
      secretManager: spySecretManager,
      resolveAdapter: () => spyAdapter
    });
    const localApp = created.app;
    const localAiService = created.aiService;
    const org2 = await createOrgWithMembers(localApp);
    const setup = await setupExecutableFeature(localApp, org2);

    // configureByok legitimately called store() during setup; reset the counter so the
    // assertion below is only about what happens *after* the policy gate is broken.
    resolveCalls = 0;

    await localAiService.policy.setPlatformAllowed(
      { kind: "platform", userId: null },
      org2.organizationId,
      false
    );

    const result = await localAiService.gateway.execute(
      { kind: "user", userId: org2.ownerId },
      org2.organizationId,
      { featureKey: setup.featureKey, input: { text: "hello" } }
    );

    expect(result).toMatchObject({ kind: "denied", errorCategory: "policy_denied" });
    expect(resolveCalls).toBe(0);
    expect(spyAdapter.executeCallCount).toBe(0);
  });

  // -- Execution-level rate limit actually blocks the provider call, end-to-end -----------
  // (RateLimiter's own two-phase/isolation behavior is unit-tested directly and much more
  // cheaply in ai-rate-limiter.test.ts; this test proves the Gateway is really wired to it.)

  it("bloqueia a chamada ao provider quando o rate limit de execucao (Organization+Feature+provider+model) e excedido, isolado entre Organizations (SPEC-014 teste 46/47)", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);

    let lastResult: Awaited<ReturnType<typeof aiService.gateway.execute>> | undefined;
    for (let i = 0; i < 21; i += 1) {
      lastResult = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
        featureKey: setup.featureKey,
        input: { text: `call-${i}` }
      });
    }

    // Phase 2's check runs inside validateRouteCandidate(), after the AI Execution row has
    // already been created (unlike Phase 1's org+feature check, which runs before begin()
    // and denies before any execution row exists) -- so this is "failed", not "denied". The
    // property under test is unaffected either way: the provider is never called once the
    // limit is hit.
    expect(lastResult).toMatchObject({ kind: "failed", errorCategory: "rate_limited" });
    // The 21st call never reached the provider -- only the first 20 did.
    expect(adapter.executeCallCount).toBe(20);

    // A different Organization, never having made any of these calls, is entirely unaffected.
    const otherOrg = await fixture();
    const otherSetup = await setupExecutableFeature(app, otherOrg);
    const otherResult = await aiService.gateway.execute(
      ownerActor(otherOrg),
      otherOrg.organizationId,
      { featureKey: otherSetup.featureKey, input: { text: "hello" } }
    );
    expect(otherResult.kind).toBe("executed");
  }, 30000);
});
