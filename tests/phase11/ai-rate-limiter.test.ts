import { describe, expect, it } from "vitest";
import { DEFAULT_RATE_LIMITS, RateLimiter } from "../../src/server/ai/rate-limiter";

// Pure unit tests against RateLimiter directly (no HTTP/Postgres round trip needed): fast,
// deterministic proof of the two-phase execution rate limit (SPEC-014 "Rate Limit de
// Execucao") and the separate test_connection limit (ADR-0018 "Teste de conexao"), plus
// namespace/key isolation (Organization/Feature/provider/model).
//
// Fase 32 (ADR-0027 s9): `checkAndRecord` e agora assincrono (o store por tras dele pode ser
// Postgres) e retorna `{allowed, retryAfterSeconds}` em vez de um boolean puro -- estes testes
// continuam contra o `InMemoryRateLimitStore` default (nenhum argumento de store passado),
// entao o comportamento observado aqui e identico ao anterior a esta Fase, so a forma de ler o
// resultado mudou.
describe("phase 11 RateLimiter (two-phase execution rate limit, test_connection, isolation)", () => {
  it("has three independent namespaces with the documented default limits", () => {
    expect(DEFAULT_RATE_LIMITS.executionOrgFeature.limit).toBe(30);
    expect(DEFAULT_RATE_LIMITS.executionOrgFeatureProviderModel.limit).toBe(20);
    expect(DEFAULT_RATE_LIMITS.testConnection.limit).toBe(5);
  });

  it("Phase 1 (Organization + Feature) blocks the 31st call within the window, before routing is even resolved", async () => {
    const limiter = new RateLimiter();
    const key = "org-1:feature-1";
    for (let i = 0; i < 30; i += 1) {
      expect((await limiter.checkAndRecord("executionOrgFeature", key)).allowed).toBe(true);
    }
    expect((await limiter.checkAndRecord("executionOrgFeature", key)).allowed).toBe(false);
  });

  it("Phase 2 (Organization + Feature + provider + model) blocks the 21st call, independently of Phase 1's own counter", async () => {
    const limiter = new RateLimiter();
    const key = "org-1:feature-1:fake:model-1";
    for (let i = 0; i < 20; i += 1) {
      expect((await limiter.checkAndRecord("executionOrgFeatureProviderModel", key)).allowed).toBe(
        true
      );
    }
    expect((await limiter.checkAndRecord("executionOrgFeatureProviderModel", key)).allowed).toBe(
      false
    );
    // Phase 1's own counter for the same Organization + Feature was never touched by Phase 2
    // calls -- the two phases are genuinely independent namespaces/counters.
    expect((await limiter.checkAndRecord("executionOrgFeature", "org-1:feature-1")).allowed).toBe(
      true
    );
  });

  it("test_connection has its own, separate, lower limit from either execution phase", async () => {
    const limiter = new RateLimiter();
    const key = "org-1:fake:user-1";
    for (let i = 0; i < 5; i += 1) {
      expect((await limiter.checkAndRecord("testConnection", key)).allowed).toBe(true);
    }
    expect((await limiter.checkAndRecord("testConnection", key)).allowed).toBe(false);
    // Exhausting test_connection never touches the execution rate limit counters.
    expect(
      (await limiter.checkAndRecord("executionOrgFeature", "org-1:some-feature")).allowed
    ).toBe(true);
  });

  it("isolates rate limit counters between Organizations -- one Organization's exhausted limit never blocks another", async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 30; i += 1) {
      await limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1");
    }
    expect((await limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1")).allowed).toBe(
      false
    );
    expect((await limiter.checkAndRecord("executionOrgFeature", "org-B:feature-1")).allowed).toBe(
      true
    );
  });

  it("isolates rate limit counters between Features within the same Organization", async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 30; i += 1) {
      await limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1");
    }
    expect((await limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1")).allowed).toBe(
      false
    );
    expect((await limiter.checkAndRecord("executionOrgFeature", "org-A:feature-2")).allowed).toBe(
      true
    );
  });

  it("isolates Phase 2 counters between providers and between models for the same Organization + Feature", async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 20; i += 1) {
      await limiter.checkAndRecord(
        "executionOrgFeatureProviderModel",
        "org-A:feature-1:fake:model-1"
      );
    }
    expect(
      (
        await limiter.checkAndRecord(
          "executionOrgFeatureProviderModel",
          "org-A:feature-1:fake:model-1"
        )
      ).allowed
    ).toBe(false);
    expect(
      (
        await limiter.checkAndRecord(
          "executionOrgFeatureProviderModel",
          "org-A:feature-1:fake:model-2"
        )
      ).allowed
    ).toBe(true);
    expect(
      (
        await limiter.checkAndRecord(
          "executionOrgFeatureProviderModel",
          "org-A:feature-1:other-provider:model-1"
        )
      ).allowed
    ).toBe(true);
  });

  it("reset() clears every namespace", async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 30; i += 1) {
      await limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1");
    }
    expect((await limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1")).allowed).toBe(
      false
    );
    limiter.reset();
    expect((await limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1")).allowed).toBe(
      true
    );
  });

  it("retryAfterSeconds is always >= 1 and reflects the window, even on the very first call", async () => {
    const limiter = new RateLimiter();
    const result = await limiter.checkAndRecord("testConnection", "org-1:fake:user-2");
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
