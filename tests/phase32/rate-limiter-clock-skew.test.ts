import { describe, expect, it } from "vitest";
import { RateLimiter, type RateLimitConfig } from "../../src/server/core/rate-limiter";
import type { RateLimitStore } from "../../src/server/core/rate-limit-store";

// Fase 32 (ADR-0027 s9), fechamento -- item 4 do checklist de revisao ("Tempo / Clock Skew").
//
// A decisao critica de janela (criar vs. incrementar vs. reiniciar, e se a chamada e permitida)
// e feita INTEIRAMENTE dentro do Postgres via `NOW()` (ver `PostgresRateLimitStore.increment()`,
// `core/rate-limit-store.ts`) -- o processo Node nunca compara seu proprio relogio contra a
// janela para decidir bloquear/permitir. `allowed` depende exclusivamente do `count` que o
// PROPRIO Postgres devolve na mesma instrucao atomica que fez o incremento; nenhuma comparacao
// de tempo do lado do Node entra nessa decisao.
//
// O UNICO lugar onde `Date.now()` do processo Node aparece e em `secondsUntil()`
// (`core/rate-limiter.ts`), para converter o `resetAt` absoluto (retornado pelo store) num
// `Retry-After` relativo em segundos -- puramente de exibicao do header HTTP, nunca de decisao.
// Estes testes provam, com um store fake controlavel, que mesmo quando o `resetAt` reportado
// pelo store aparenta estar no passado do ponto de vista do relogio local (skew entre o
// processo Node e o servidor Postgres), o `Retry-After` calculado nunca fica negativo/zero, e a
// decisao de `allowed` continua vindo exclusivamente da contagem, nunca do tempo.
function fakeStoreReturning(count: number, resetAt: number): RateLimitStore {
  return {
    increment: async () => ({ count, resetAt })
  };
}

describe("Fase 32 - RateLimiter e clock skew entre processo Node e store", () => {
  it("retryAfterSeconds nunca e negativo/zero mesmo quando o store reporta um resetAt ja no passado (skew)", async () => {
    const configs = {
      ns: { limit: 100, windowMs: 60_000, failureMode: "closed" } satisfies RateLimitConfig
    };
    // resetAt 10s no passado do ponto de vista de Date.now() local -- simula o relogio do
    // processo Node estar adiantado em relacao ao servidor Postgres que gerou este timestamp.
    const skewedResetAt = Date.now() - 10_000;
    const limiter = new RateLimiter(configs, fakeStoreReturning(5, skewedResetAt));

    const result = await limiter.checkAndRecord("ns", "any-key");

    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(result.retryAfterSeconds)).toBe(true);
  });

  it("a decisao de allowed depende exclusivamente da contagem retornada pelo store, nunca do relogio local", async () => {
    const configs = {
      ns: { limit: 5, windowMs: 60_000, failureMode: "closed" } satisfies RateLimitConfig
    };
    // resetAt no futuro distante -- se `allowed` dependesse de qualquer comparacao de tempo do
    // lado do Node, um resetAt "muito no futuro" poderia mascarar o teste. Mesmo assim, count=6
    // > limit=5 deve bloquear.
    const farFutureResetAt = Date.now() + 10 * 60_000;
    const limiter = new RateLimiter(configs, fakeStoreReturning(6, farFutureResetAt));

    const result = await limiter.checkAndRecord("ns", "any-key");

    expect(result.allowed).toBe(false);
  });

  it("resetAt exatamente igual a Date.now() (janela expirando neste instante) ainda produz retryAfterSeconds >= 1", async () => {
    const configs = {
      ns: { limit: 100, windowMs: 60_000, failureMode: "closed" } satisfies RateLimitConfig
    };
    const now = Date.now();
    const limiter = new RateLimiter(configs, fakeStoreReturning(1, now));

    const result = await limiter.checkAndRecord("ns", "any-key");

    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
