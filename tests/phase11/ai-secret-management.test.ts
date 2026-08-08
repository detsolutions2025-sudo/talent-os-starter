import type pg from "pg";
import { describe, expect, it } from "vitest";
import { createPostgresAIService } from "../../src/server/ai/service";
import type { AIProviderAdapter } from "../../src/server/ai/providers/adapter";
import { UnavailableProviderAdapter } from "../../src/server/ai/providers/unavailable-adapter";
import type { SecretManager } from "../../src/server/ai/secrets/secret-manager";
import {
  InMemorySecretManager,
  UnavailableSecretManager,
  maskSecret
} from "../../src/server/ai/secrets/secret-manager";

describe("phase 11 AI secret management (InMemorySecretManager, masking)", () => {
  it("never implements SecretManager with a real Secret Manager -- InMemorySecretManager refuses to run in production", () => {
    expect(() => new InMemorySecretManager("production")).toThrow();
  });

  it("allows InMemorySecretManager in development and test environments", () => {
    expect(() => new InMemorySecretManager("development")).not.toThrow();
    expect(() => new InMemorySecretManager("test")).not.toThrow();
  });

  it("stores a secret and resolves it back only for the same organizationId", async () => {
    const manager = new InMemorySecretManager("test");
    const { secretReference, maskedIdentifier } = await manager.store(
      "org-1",
      "fake",
      "sk-real-secret-value"
    );

    expect(secretReference).not.toContain("sk-real-secret-value");
    expect(maskedIdentifier).not.toContain("sk-real-secret-value");

    const resolved = await manager.resolve(secretReference, "org-1");
    expect(resolved).toBe("sk-real-secret-value");
  });

  it("never resolves a secret_reference for a different organizationId (opaque reference, no textual org dependency)", async () => {
    const manager = new InMemorySecretManager("test");
    const { secretReference } = await manager.store("org-1", "fake", "sk-real-secret-value");

    // The reference never embeds organizationId in a way that could be reused for another org.
    expect(secretReference).not.toContain("org-1");

    await expect(manager.resolve(secretReference, "org-2")).rejects.toThrow();
  });

  it("stops resolving a secret after revoke()", async () => {
    const manager = new InMemorySecretManager("test");
    const { secretReference } = await manager.store("org-1", "fake", "sk-real-secret-value");

    await manager.revoke(secretReference, "org-1");

    await expect(manager.resolve(secretReference, "org-1")).rejects.toThrow();
  });

  it("revoke() is a safe no-op for a mismatched organizationId (never revokes another Organization's secret)", async () => {
    const manager = new InMemorySecretManager("test");
    const { secretReference } = await manager.store("org-1", "fake", "sk-real-secret-value");

    await manager.revoke(secretReference, "org-2");

    // Still resolvable by the real owner -- the cross-org revoke had no effect.
    await expect(manager.resolve(secretReference, "org-1")).resolves.toBe("sk-real-secret-value");
  });

  it("masks a secret with a fixed-length prefix and at most the last 4 characters, never the full value", () => {
    const masked = maskSecret("sk-abcdefghijklmnopqrstuvwxyz");
    expect(masked).not.toBe("sk-abcdefghijklmnopqrstuvwxyz");
    expect(masked.endsWith("wxyz")).toBe(true);
    expect(masked.startsWith("*".repeat(12))).toBe(true);
    expect(masked).not.toContain("sk-abcd");
  });

  it("never reveals a very short secret in full through masking", () => {
    const masked = maskSecret("abc");
    expect(masked).not.toBe("abc");
    expect(masked.length).toBeGreaterThan(3);
  });

  it("produces a mask whose prefix length does not vary with the secret's real length", () => {
    const shortMask = maskSecret("short-secret");
    const longMask = maskSecret("a-very-long-secret-value-with-many-characters-1234567890");
    const shortPrefix = shortMask.slice(0, 12);
    const longPrefix = longMask.slice(0, 12);
    expect(shortPrefix).toBe(longPrefix);
  });

  // Production bootstrap safety (src/server/index.ts). InMemorySecretManager cannot even be
  // constructed under APP_ENV=production (see the first test above) -- if index.ts called
  // createPostgresAIService(pool) with no options in production, the default fallback
  // `new InMemorySecretManager()` would throw synchronously at module load time and crash the
  // *entire* server (every other module too, none of which depend on AI -- ADR-0016). These
  // tests prove the production-safe replacements never crash construction, and that any actual
  // use fails safely with a normalized configuration_error instead of a raw credential, a fake
  // success, or an unhandled throw.
  describe("production bootstrap safety (UnavailableSecretManager / UnavailableProviderAdapter)", () => {
    it("never throws at construction, unlike InMemorySecretManager", () => {
      expect(() => new UnavailableSecretManager()).not.toThrow();
    });

    it("fails safely (never a raw credential, never a silent success) when actually used", async () => {
      // Typed as the SecretManager interface (not the concrete class) so the call sites below
      // are checked against the interface's declared arity -- UnavailableSecretManager's own
      // methods intentionally declare zero parameters, since none of them are ever used.
      const manager: SecretManager = new UnavailableSecretManager();
      await expect(manager.store("org-1", "fake", "sk-real")).rejects.toThrow();
      await expect(manager.resolve("mem-secret-fake-x", "org-1")).rejects.toThrow();
      await expect(manager.revoke("mem-secret-fake-x", "org-1")).resolves.toBeUndefined();
    });

    it("UnavailableProviderAdapter never fakes a successful validation or execution", async () => {
      // Same reasoning: typed as the AIProviderAdapter interface, not the concrete class.
      const adapter: AIProviderAdapter = new UnavailableProviderAdapter();
      const controller = new AbortController();
      const validation = await adapter.validateCredential(
        { provider: "fake", secret: "sk-real" },
        controller.signal
      );
      expect(validation.valid).toBe(false);
      expect(validation.category).toBe("configuration_error");
      await expect(
        adapter.execute(
          {
            provider: "fake",
            providerModelIdentifier: "x",
            systemInstructions: "x",
            data: {},
            outputSchema: {},
            timeoutMs: 100
          },
          { provider: "fake", secret: "sk-real" },
          controller.signal
        )
      ).rejects.toMatchObject({ category: "configuration_error" });
    });

    it("createPostgresAIService boots without throwing when wired with the production-safe implementations (mirrors index.ts under APP_ENV=production)", () => {
      // A real pg.Pool is never required here: createPostgresAIService only wires services at
      // construction time, it never queries the database until a request/execute() actually
      // happens -- proving this call alone never touches Postgres or the network.
      const fakePool = {} as pg.Pool;
      expect(() =>
        createPostgresAIService(fakePool, {
          secretManager: new UnavailableSecretManager(),
          resolveAdapter: () => new UnavailableProviderAdapter()
        })
      ).not.toThrow();
    });

    it("the previous, unguarded default (new InMemorySecretManager() with no explicit override) is exactly what would crash boot under APP_ENV=production -- this is why index.ts must never call createPostgresAIService(pool) with no options in production", () => {
      const fakePool = {} as pg.Pool;
      const originalAppEnv = process.env.APP_ENV;
      process.env.APP_ENV = "production";
      try {
        expect(() => createPostgresAIService(fakePool)).toThrow();
      } finally {
        process.env.APP_ENV = originalAppEnv;
      }
    });
  });
});
