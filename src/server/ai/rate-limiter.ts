// Configuracao de rate limit especifica de IA (SPEC-014 "Rate Limit de Execucao" / "Test
// Connection"). A classe generica `RateLimiter` foi extraida para `core/rate-limiter.ts` na
// Fase 17 (Plano Tecnico, item 36) para ser reutilizada pela candidatura publica sem criar
// nenhum acoplamento a IA -- este arquivo apenas reexporta a classe generica com a
// configuracao e o namespace especificos de IA, preservando exatamente a API publica e o
// comportamento anteriores (nenhum import existente de `ai/rate-limiter` precisou mudar).
import { RateLimiter as GenericRateLimiter, type RateLimitConfig } from "../core/rate-limiter";

export type { RateLimitConfig };

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

export class RateLimiter extends GenericRateLimiter<RateLimitNamespace> {
  constructor(configs: Record<RateLimitNamespace, RateLimitConfig> = DEFAULT_RATE_LIMITS) {
    super(configs);
  }
}
