// In-memory, fixed-window rate limiter (SPEC-014 "Rate Limit de Execucao" / "Test Connection").
//
// This is permitted for Phase 11 ONLY because the current runtime is a single Node process
// (no clustering, no multiple API instances) -- see the approved technical plan, item 12/20.
// It is NOT adequate for a production deployment with more than one process/instance sharing
// the same limits: each instance would enforce its own independent window. A shared store
// (e.g. Redis) is an external dependency for that scenario and is explicitly out of scope
// here.
export type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

// Centralized configuration -- never a number hardcoded inline at a call site.
export const DEFAULT_RATE_LIMITS = {
  // Phase 1 (SPEC-014 "Rate limit em duas fases"): Organization + Feature, before routing.
  executionOrgFeature: { limit: 30, windowMs: 60_000 } satisfies RateLimitConfig,
  // Phase 2: Organization + Feature + provider + model, after routing/provider/model resolved.
  executionOrgFeatureProviderModel: { limit: 20, windowMs: 60_000 } satisfies RateLimitConfig,
  // test_connection: always separate from execution rate limiting.
  testConnection: { limit: 5, windowMs: 60_000 } satisfies RateLimitConfig
};

export type RateLimitNamespace = keyof typeof DEFAULT_RATE_LIMITS;

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly configs: Record<RateLimitNamespace, RateLimitConfig> = DEFAULT_RATE_LIMITS
  ) {}

  // Returns true (and records the hit) when the call is allowed; returns false (without
  // recording) when the limit is currently exceeded.
  checkAndRecord(namespace: RateLimitNamespace, key: string): boolean {
    const config = this.configs[namespace];
    const fullKey = `${namespace}:${key}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const recent = (this.hits.get(fullKey) ?? []).filter((timestamp) => timestamp > windowStart);

    if (recent.length >= config.limit) {
      this.hits.set(fullKey, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(fullKey, recent);
    return true;
  }

  reset() {
    this.hits.clear();
  }
}
