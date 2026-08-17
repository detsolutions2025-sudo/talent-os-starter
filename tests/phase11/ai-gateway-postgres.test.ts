import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../../src/server/core/types";
import { FakeProviderAdapter } from "../../src/server/ai/providers/fake-adapter";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createAppWithAiService,
  createOrgWithMembers,
  createRoute,
  registerModel,
  setFallbackAllowedOnPlatform,
  setOrganizationFallback,
  setupExecutableFeature,
  type OrgFixture
} from "./helpers";

describe("phase 11 AIGateway (execution flow, policies, retry, fallback, rate limit, idempotency)", () => {
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

  it("executes successfully end-to-end and returns a typed, validated structured output", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result.kind).toBe("executed");
    if (result.kind === "executed") {
      expect(result.output).toEqual({ ok: true });
      expect(result.usage.status).toBe("succeeded");
      expect(result.usage.provider).toBe(setup.provider);
      expect(result.usage.promptKey).toBe(setup.promptKey);
    }
  });

  it("denies execution and never calls the provider when platform_ai_allowed is false", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);

    // Undo platform allowance (setupExecutableFeature turns it on) to isolate this condition.
    await aiService.policy.setPlatformAllowed(
      { kind: "platform", userId: null },
      org.organizationId,
      false
    );

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({ kind: "denied", errorCategory: "policy_denied" });
    expect(adapter.executeCallCount).toBe(0);
  });

  it("denies execution when organization_ai_enabled is false", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    await aiService.policy.setOrganizationPreference(ownerActor(org), org.organizationId, false);

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({
      kind: "denied",
      errorCategory: "policy_denied",
      reason: "organization_ai_enabled_false"
    });
    expect(adapter.executeCallCount).toBe(0);
  });

  it("denies execution when the Feature is not available on the platform", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    await aiService.policy.setFeatureAvailability(
      { kind: "platform", userId: null },
      setup.featureKey,
      {
        featureAvailableOnPlatform: false
      }
    );

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({
      kind: "denied",
      errorCategory: "policy_denied",
      reason: "feature_available_on_platform_false"
    });
    expect(adapter.executeCallCount).toBe(0);
  });

  it("denies execution when the Organization has not enabled the Feature", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    await aiService.policy.setOrganizationFeatureEnabled(
      ownerActor(org),
      org.organizationId,
      setup.featureKey,
      { organizationFeatureEnabled: false }
    );

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({
      kind: "denied",
      errorCategory: "policy_denied",
      reason: "organization_feature_enabled_false"
    });
    expect(adapter.executeCallCount).toBe(0);
  });

  it("denies execution with configuration_error when no routing exists for the Feature", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    // Deactivate the only route created by setupExecutableFeature.
    const routes = await aiService.routing.listRoutes(
      ownerActor(org),
      org.organizationId,
      setup.featureKey
    );
    for (const route of routes) {
      await aiService.routing.deactivateRoute(ownerActor(org), org.organizationId, route.id);
    }

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({
      kind: "denied",
      errorCategory: "configuration_error",
      reason: "routing_not_found"
    });
  });

  const categoryCases: Array<{ outcome: string; label: string }> = [
    { outcome: "authentication_error", label: "authentication_error" },
    { outcome: "quota_exceeded", label: "quota_exceeded" },
    { outcome: "provider_unavailable", label: "provider_unavailable" },
    { outcome: "network_error", label: "network_error" },
    { outcome: "content_blocked", label: "content_blocked" },
    { outcome: "timeout", label: "timeout" }
  ];

  for (const testCase of categoryCases) {
    it(`normalizes a provider failure into error_category = ${testCase.label}`, async () => {
      const org = await fixture();
      const setup = await setupExecutableFeature(app, org);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adapter.setScenario({ outcome: testCase.outcome as any });

      const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
        featureKey: setup.featureKey,
        input: { text: "hello" }
      });

      expect(result.kind).toBe("failed");
      if (result.kind === "failed") {
        expect(result.errorCategory).toBe(testCase.label);
      }
    });
  }

  it("rejects a response that fails structured-output validation as invalid_response, never handing it to the caller raw", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    adapter.setScenario({ outcome: "success", structuredOutput: { unexpected: "shape" } });

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({ kind: "failed", errorCategory: "invalid_response" });
  });

  it("normalizes an unexpected thrown error (not an AIProviderError) as unknown_error", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    adapter.execute = async () => {
      throw new Error("boom, not an AIProviderError");
    };

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({ kind: "failed", errorCategory: "unknown_error" });
  });

  it("retries a transient failure on the same route and succeeds, without duplicate cost", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    adapter.setScenarioSequence([
      { outcome: "network_error" },
      { outcome: "success", structuredOutput: { ok: true } }
    ]);

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result.kind).toBe("executed");
    expect(adapter.executeCallCount).toBe(2);
  });

  it("never retries infinitely: a persistently transient failure ends as failed", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    adapter.setScenario({ outcome: "network_error" });

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({ kind: "failed", errorCategory: "network_error" });
    // maxRetriesPerRoute = 1 -> exactly 2 calls (initial + 1 retry), never more.
    expect(adapter.executeCallCount).toBe(2);
  });

  it("falls back to the next route only when both fallback_allowed_on_platform and fallback_enabled are true", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    await registerModel(app, setup.provider, "fallback-model");
    const secondRoute = await createRoute(
      app,
      org.organizationId,
      org.ownerId,
      setup.featureKey,
      setup.provider,
      "fallback-model",
      2
    );
    expect(secondRoute.status).toBe(201);

    await setFallbackAllowedOnPlatform(app, setup.featureKey, true);
    await setOrganizationFallback(app, org.organizationId, org.ownerId, setup.featureKey, true);

    // quota_exceeded is fallback-eligible and not retryable -> route 1 fails once, then route 2
    // (the fallback) is attempted and succeeds.
    adapter.setScenarioSequence([
      { outcome: "quota_exceeded" },
      { outcome: "success", structuredOutput: { ok: true } }
    ]);

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result.kind).toBe("executed");
    if (result.kind === "executed") {
      expect(result.usage.modelKey).toBe("fallback-model");
    }
    expect(adapter.executeCallCount).toBe(2);
  });

  it("never falls back when fallback_enabled is false, even if fallback_allowed_on_platform is true", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    await registerModel(app, setup.provider, "unused-fallback-model");
    await createRoute(
      app,
      org.organizationId,
      org.ownerId,
      setup.featureKey,
      setup.provider,
      "unused-fallback-model",
      2
    );
    await setFallbackAllowedOnPlatform(app, setup.featureKey, true);
    // fallback_enabled deliberately left false.

    adapter.setScenario({ outcome: "quota_exceeded" });

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({ kind: "failed", errorCategory: "quota_exceeded" });
    expect(adapter.executeCallCount).toBe(1);
  });

  it("never falls back for a fallback-ineligible cause, even when fallback is fully authorized", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    await registerModel(app, setup.provider, "should-not-be-tried");
    await createRoute(
      app,
      org.organizationId,
      org.ownerId,
      setup.featureKey,
      setup.provider,
      "should-not-be-tried",
      2
    );
    await setFallbackAllowedOnPlatform(app, setup.featureKey, true);
    await setOrganizationFallback(app, org.organizationId, org.ownerId, setup.featureKey, true);

    adapter.setScenario({ outcome: "authentication_error" });

    const result = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" }
    });

    expect(result).toMatchObject({ kind: "failed", errorCategory: "authentication_error" });
    expect(adapter.executeCallCount).toBe(1);
  });

  it("replays an idempotency key that already succeeded without calling the provider again", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);

    const first = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" },
      idempotencyKey: "same-key"
    });
    expect(first.kind).toBe("executed");
    expect(adapter.executeCallCount).toBe(1);

    const second = await aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello, again" },
      idempotencyKey: "same-key"
    });

    expect(second.kind).toBe("idempotent_replay");
    expect(adapter.executeCallCount).toBe(1);
    if (first.kind === "executed" && second.kind === "idempotent_replay") {
      expect(second.usage.executionId).toBe(first.usage.executionId);
    }
  });

  it("rejects a second concurrent call with the same idempotency key while the first is still in flight", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    adapter.setScenario({ outcome: "success", structuredOutput: { ok: true } });

    // Deterministic barrier instead of a wall-clock race: the first call is held open exactly
    // at the point where it has already inserted its `pending` execution row (begin()) and
    // called the provider -- i.e. genuinely "in flight" -- and only then is the second call
    // fired. This removes any dependency on scheduling luck (Promise.allSettled with a fixed
    // latencyMs cannot guarantee the two calls actually overlap) while still exercising the
    // real concurrency guard: the second call's idempotency check runs against the database
    // exactly as it would under real overlapping requests.
    let releaseFirstCall!: () => void;
    const firstCallGate = new Promise<void>((resolve) => {
      releaseFirstCall = resolve;
    });
    let signalProviderCalled!: () => void;
    const providerCalledSignal = new Promise<void>((resolve) => {
      signalProviderCalled = resolve;
    });
    const originalExecute = adapter.execute.bind(adapter);
    adapter.execute = async (request, credential, signal) => {
      signalProviderCalled();
      await firstCallGate;
      return originalExecute(request, credential, signal);
    };

    const firstPromise = aiService.gateway.execute(ownerActor(org), org.organizationId, {
      featureKey: setup.featureKey,
      input: { text: "hello" },
      idempotencyKey: "concurrent-key"
    });

    await providerCalledSignal;

    let secondOutcome: { status: "fulfilled" } | { status: "rejected"; reason: unknown };
    try {
      await aiService.gateway.execute(ownerActor(org), org.organizationId, {
        featureKey: setup.featureKey,
        input: { text: "hello, again" },
        idempotencyKey: "concurrent-key"
      });
      secondOutcome = { status: "fulfilled" };
    } catch (reason) {
      secondOutcome = { status: "rejected", reason };
    }

    releaseFirstCall();
    const firstResult = await firstPromise;

    expect(firstResult.kind).toBe("executed");
    expect(secondOutcome.status).toBe("rejected");
    if (secondOutcome.status === "rejected") {
      expect((secondOutcome.reason as { code?: string }).code).toMatch(
        /^ai_execution_(in_progress|idempotency_conflict)$/
      );
    }
    // Physical proof there was exactly one real business execution, never two -- the invariant
    // that actually matters (SPEC-014 "Idempotencia": never persistencia duplicada de AI
    // Execution equivalente), independent of which of the two valid rejection code paths
    // (pre-existing SELECT check vs. unique-index conflict on insert) the second call hit.
    expect(adapter.executeCallCount).toBe(1);
  });

  it("enforces isolation: an execution can only use routing/credentials that belong to its own Organization", async () => {
    const orgA = await fixture();
    const orgB = await fixture();
    const setupA = await setupExecutableFeature(app, orgA);
    // orgB never configured this Feature at all.

    const result = await aiService.gateway.execute(ownerActor(orgB), orgB.organizationId, {
      featureKey: setupA.featureKey,
      input: { text: "hello" }
    });

    expect(result.kind).toBe("denied");
  });

  it("never blocks the caller when IA is unavailable: fail-safe always returns a typed result, never throws for a normal denial", async () => {
    const org = await fixture();
    const setup = await setupExecutableFeature(app, org);
    await aiService.policy.setOrganizationPreference(ownerActor(org), org.organizationId, false);

    await expect(
      aiService.gateway.execute(ownerActor(org), org.organizationId, {
        featureKey: setup.featureKey,
        input: { text: "hello" }
      })
    ).resolves.toMatchObject({ kind: "denied" });
  });
});
