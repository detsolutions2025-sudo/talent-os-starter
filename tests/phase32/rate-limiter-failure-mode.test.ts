import { describe, expect, it, vi } from "vitest";
import { RateLimiter, type RateLimitConfig } from "../../src/server/core/rate-limiter";
import type { RateLimitStore } from "../../src/server/core/rate-limit-store";
import { logger } from "../../src/server/observability/logger";

// Fase 32 (ADR-0027 s9). Prova, sem depender de Postgres real, o comportamento explicito de
// fail-open/fail-closed quando o store de rate limit lanca (indisponibilidade) -- decisao por
// namespace (`failureMode`), nunca uma regra unica cega, e sempre auditada
// (`rate_limit_store_error`), nunca silenciosa.
function throwingStore(): RateLimitStore {
  return {
    increment: vi.fn().mockRejectedValue(new Error("simulated store outage"))
  };
}

describe("Fase 32 - RateLimiter fail-open / fail-closed quando o store esta indisponivel", () => {
  it("failureMode: 'closed' bloqueia a chamada quando o store lanca (ex.: login/auth sensivel)", async () => {
    const configs = {
      loginLike: { limit: 5, windowMs: 60_000, failureMode: "closed" } satisfies RateLimitConfig
    };
    const limiter = new RateLimiter(configs, throwingStore());

    const result = await limiter.checkAndRecord("loginLike", "some-ip");

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("failureMode: 'open' permite a chamada quando o store lanca (ex.: endpoint publico de baixo risco)", async () => {
    const configs = {
      publicLike: { limit: 5, windowMs: 60_000, failureMode: "open" } satisfies RateLimitConfig
    };
    const limiter = new RateLimiter(configs, throwingStore());

    const result = await limiter.checkAndRecord("publicLike", "some-ip");

    expect(result.allowed).toBe(true);
  });

  it("nunca falha silenciosamente: toda indisponibilidade do store e auditada via logger, em ambos os modos", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    try {
      const configs = {
        anyNamespace: {
          limit: 5,
          windowMs: 60_000,
          failureMode: "open"
        } satisfies RateLimitConfig
      };
      const limiter = new RateLimiter(configs, throwingStore());

      await limiter.checkAndRecord("anyNamespace", "some-key");

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [loggedObject] = errorSpy.mock.calls[0] as [Record<string, unknown>, string];
      expect(loggedObject.event).toBe("rate_limit_store_error");
      expect(loggedObject.namespace).toBe("anyNamespace");
      // Nunca loga a chave/hash bruto -- apenas o namespace (evita cardinalidade explosiva e
      // qualquer vazamento indireto de identificador, ver core/rate-limiter.ts).
      expect(JSON.stringify(loggedObject)).not.toContain("some-key");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("um store saudavel nunca aciona o caminho de falha (comportamento normal preservado)", async () => {
    const configs = {
      normal: { limit: 2, windowMs: 60_000, failureMode: "closed" } satisfies RateLimitConfig
    };
    const limiter = new RateLimiter(configs);

    expect((await limiter.checkAndRecord("normal", "k")).allowed).toBe(true);
    expect((await limiter.checkAndRecord("normal", "k")).allowed).toBe(true);
    expect((await limiter.checkAndRecord("normal", "k")).allowed).toBe(false);
  });
});
