import { describe, expect, it } from "vitest";
import { DEFAULT_RATE_LIMITS, RateLimiter } from "../../src/server/ai/rate-limiter";

// Pure unit tests against RateLimiter directly (no HTTP/Postgres round trip needed): fast,
// deterministic proof of the two-phase execution rate limit (SPEC-014 "Rate Limit de
// Execucao") and the separate test_connection limit (ADR-0018 "Teste de conexao"), plus
// namespace/key isolation (Organization/Feature/provider/model).
describe("phase 11 RateLimiter (two-phase execution rate limit, test_connection, isolation)", () => {
  it("has three independent namespaces with the documented default limits", () => {
    expect(DEFAULT_RATE_LIMITS.executionOrgFeature.limit).toBe(30);
    expect(DEFAULT_RATE_LIMITS.executionOrgFeatureProviderModel.limit).toBe(20);
    expect(DEFAULT_RATE_LIMITS.testConnection.limit).toBe(5);
  });

  it("Phase 1 (Organization + Feature) blocks the 31st call within the window, before routing is even resolved", () => {
    const limiter = new RateLimiter();
    const key = "org-1:feature-1";
    for (let i = 0; i < 30; i += 1) {
      expect(limiter.checkAndRecord("executionOrgFeature", key)).toBe(true);
    }
    expect(limiter.checkAndRecord("executionOrgFeature", key)).toBe(false);
  });

  it("Phase 2 (Organization + Feature + provider + model) blocks the 21st call, independently of Phase 1's own counter", () => {
    const limiter = new RateLimiter();
    const key = "org-1:feature-1:fake:model-1";
    for (let i = 0; i < 20; i += 1) {
      expect(limiter.checkAndRecord("executionOrgFeatureProviderModel", key)).toBe(true);
    }
    expect(limiter.checkAndRecord("executionOrgFeatureProviderModel", key)).toBe(false);
    // Phase 1's own counter for the same Organization + Feature was never touched by Phase 2
    // calls -- the two phases are genuinely independent namespaces/counters.
    expect(limiter.checkAndRecord("executionOrgFeature", "org-1:feature-1")).toBe(true);
  });

  it("test_connection has its own, separate, lower limit from either execution phase", () => {
    const limiter = new RateLimiter();
    const key = "org-1:fake:user-1";
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.checkAndRecord("testConnection", key)).toBe(true);
    }
    expect(limiter.checkAndRecord("testConnection", key)).toBe(false);
    // Exhausting test_connection never touches the execution rate limit counters.
    expect(limiter.checkAndRecord("executionOrgFeature", "org-1:some-feature")).toBe(true);
  });

  it("isolates rate limit counters between Organizations -- one Organization's exhausted limit never blocks another", () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 30; i += 1) {
      limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1");
    }
    expect(limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1")).toBe(false);
    expect(limiter.checkAndRecord("executionOrgFeature", "org-B:feature-1")).toBe(true);
  });

  it("isolates rate limit counters between Features within the same Organization", () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 30; i += 1) {
      limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1");
    }
    expect(limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1")).toBe(false);
    expect(limiter.checkAndRecord("executionOrgFeature", "org-A:feature-2")).toBe(true);
  });

  it("isolates Phase 2 counters between providers and between models for the same Organization + Feature", () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 20; i += 1) {
      limiter.checkAndRecord("executionOrgFeatureProviderModel", "org-A:feature-1:fake:model-1");
    }
    expect(
      limiter.checkAndRecord("executionOrgFeatureProviderModel", "org-A:feature-1:fake:model-1")
    ).toBe(false);
    expect(
      limiter.checkAndRecord("executionOrgFeatureProviderModel", "org-A:feature-1:fake:model-2")
    ).toBe(true);
    expect(
      limiter.checkAndRecord(
        "executionOrgFeatureProviderModel",
        "org-A:feature-1:other-provider:model-1"
      )
    ).toBe(true);
  });

  it("reset() clears every namespace", () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 30; i += 1) {
      limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1");
    }
    expect(limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1")).toBe(false);
    limiter.reset();
    expect(limiter.checkAndRecord("executionOrgFeature", "org-A:feature-1")).toBe(true);
  });
});
