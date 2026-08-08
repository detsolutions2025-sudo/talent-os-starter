import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../../src/server/core/types";
import { FakeProviderAdapter } from "../../src/server/ai/providers/fake-adapter";
import { PostgresAIRepository } from "../../src/server/persistence/postgres-ai-repository";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createAppWithAiService,
  createFeature,
  createOrgWithMembers,
  registerProvider,
  type OrgFixture
} from "./helpers";

// ADR-0018 "Concorrencia em operacoes de credencial" and ADR-0019 "Prompt Registry" both
// require that concurrent writes never leave a partially-applied state. These tests fire real
// concurrent requests (Promise.allSettled, never sequential awaits) against the service layer
// and assert the *invariant* that must hold no matter which request "wins" the row lock.
describe("phase 11 AI concurrency (credential rotation/revocation, prompt publish)", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createAppWithAiService>["app"];
  let aiService: ReturnType<typeof createAppWithAiService>["aiService"];

  beforeAll(async () => {
    process.env.APP_ENV = "test";
    database = await createPostgresTestDatabase();
  });

  beforeEach(() => {
    process.env.APP_ENV = "test";
    const created = createAppWithAiService(database, {
      resolveAdapter: () => new FakeProviderAdapter({ outcome: "success" })
    });
    app = created.app;
    aiService = created.aiService;
  });

  afterAll(async () => {
    await database.cleanup();
  });

  async function fixture(): Promise<OrgFixture> {
    const org = await createOrgWithMembers(app);
    await registerProvider(app, "fake");
    return org;
  }

  function ownerActor(org: OrgFixture): Actor {
    return { kind: "user", userId: org.ownerId };
  }

  it("duas rotacoes verdadeiramente concorrentes da mesma configuracao nunca deixam mais de uma config ativa (SPEC-014 teste 21/22, ADR-0018 'Concorrencia em operacoes de credencial')", async () => {
    const org = await fixture();
    // A first credential so both concurrent calls below are genuine *rotations*, not both
    // being the first-ever configuration.
    await aiService.providerConfig.configureCredential(ownerActor(org), org.organizationId, {
      provider: "fake",
      credentialMode: "customer_managed",
      secret: "sk-initial-credential"
    });

    const [first, second] = await Promise.allSettled([
      aiService.providerConfig.configureCredential(ownerActor(org), org.organizationId, {
        provider: "fake",
        credentialMode: "customer_managed",
        secret: "sk-rotation-a"
      }),
      aiService.providerConfig.configureCredential(ownerActor(org), org.organizationId, {
        provider: "fake",
        credentialMode: "customer_managed",
        secret: "sk-rotation-b"
      })
    ]);

    // Both are individually valid credentials (FakeProviderAdapter always "success" here), so
    // both are expected to succeed -- the safety property under test is *not* that one must be
    // rejected, but that the row lock (SELECT ... FOR UPDATE) serializes them into a
    // consistent final state: never two active rows, never zero.
    expect([first.status, second.status]).toEqual(["fulfilled", "fulfilled"]);

    const rows = await new PostgresAIRepository(database.pool).listProviderConfigs(
      org.organizationId
    );
    const fakeRows = rows.filter((row) => row.provider === "fake");
    expect(fakeRows.filter((row) => row.isActive)).toHaveLength(1);
    // Three total rows: the initial config plus the two rotations, all preserved as history.
    expect(fakeRows).toHaveLength(3);
  });

  it("uma rotacao concorrendo com uma revogacao da mesma configuracao resolve com seguranca, nunca em estado parcialmente trocado (SPEC-014 teste 22, ADR-0018)", async () => {
    const org = await fixture();
    await aiService.providerConfig.configureCredential(ownerActor(org), org.organizationId, {
      provider: "fake",
      credentialMode: "customer_managed",
      secret: "sk-initial-credential"
    });

    const [rotateOutcome, revokeOutcome] = await Promise.allSettled([
      aiService.providerConfig.configureCredential(ownerActor(org), org.organizationId, {
        provider: "fake",
        credentialMode: "customer_managed",
        secret: "sk-rotated-credential"
      }),
      aiService.providerConfig.revokeCredential(ownerActor(org), org.organizationId, "fake")
    ]);

    // Whichever operation's transaction commits last determines the final state -- both are
    // individually safe (SELECT ... FOR UPDATE serializes them) -- but there must never be more
    // than one active row, and every row's status/isActive pairing must stay internally
    // consistent (no row that is both revoked and active).
    const rows = await new PostgresAIRepository(database.pool).listProviderConfigs(
      org.organizationId
    );
    const fakeRows = rows.filter((row) => row.provider === "fake");
    expect(fakeRows.filter((row) => row.isActive).length).toBeLessThanOrEqual(1);
    for (const row of fakeRows) {
      if (row.status === "revoked") {
        expect(row.isActive).toBe(false);
      }
    }
    void rotateOutcome;
    void revokeOutcome;
  });

  it("publicacao concorrente de duas versoes draft do mesmo prompt_key nunca deixa mais de uma versao published (ADR-0019 'Versionamento de prompts')", async () => {
    const feature = await createFeature(app);
    const promptKey = "concurrent_publish_prompt";
    const platformActor: Actor = { kind: "platform", userId: null };

    const v1 = await aiService.promptRegistry.createDraft(platformActor, {
      promptKey,
      featureKey: feature.featureKey,
      template: "v1",
      inputSchema: {},
      outputSchema: {}
    });
    await aiService.promptRegistry.publish(platformActor, promptKey, v1.version);

    const v2 = await aiService.promptRegistry.createDraft(platformActor, {
      promptKey,
      featureKey: feature.featureKey,
      template: "v2",
      inputSchema: {},
      outputSchema: {}
    });
    const v3 = await aiService.promptRegistry.createDraft(platformActor, {
      promptKey,
      featureKey: feature.featureKey,
      template: "v3",
      inputSchema: {},
      outputSchema: {}
    });

    const [publishV2, publishV3] = await Promise.allSettled([
      aiService.promptRegistry.publish(platformActor, promptKey, v2.version),
      aiService.promptRegistry.publish(platformActor, promptKey, v3.version)
    ]);

    // Both v2 and v3 started as valid drafts, so both publish() calls are individually legal.
    // The row lock (`SELECT ... FOR UPDATE` on the currently-published row) serializes them,
    // but under READ COMMITTED the loser's re-evaluated SELECT no longer sees a published row
    // to archive -- so the *real* safety net is the uq_ai_prompt_published unique index, and
    // the loser must be rejected with a clean, expected conflict, never a raw/opaque error and
    // never a silent double-publish. Exactly one of the two settles as rejected or both may
    // succeed if they happened to serialize as pure sequential archive-then-publish -- either
    // way, the invariant is "at most one published version, and any rejection is the expected
    // AppError", never an unhandled crash.
    for (const outcome of [publishV2, publishV3]) {
      if (outcome.status === "rejected") {
        expect(outcome.reason).toMatchObject({ code: "ai_prompt_publish_conflict" });
      }
    }

    const versions = await aiService.promptRegistry.listVersionsAsPlatformAdmin(
      platformActor,
      promptKey
    );
    const published = versions.filter((version) => version.status === "published");
    expect(published).toHaveLength(1);
  });
});
