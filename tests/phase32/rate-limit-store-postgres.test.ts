import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { hashRateLimitKey, PostgresRateLimitStore } from "../../src/server/core/rate-limit-store";
import { RateLimiter, type RateLimitConfig } from "../../src/server/core/rate-limiter";

// Fase 32 (ADR-0027 s9 "Rate Limiting Distribuido"). Integracao REAL contra Postgres -- mesmo
// mecanismo ja usado por toda a suite `tests/phase1..31` (schema descartavel via
// `tests/helpers/postgres-test-db.ts`, nunca `public`, nunca dado real), aplicando a migration
// 0034 (`rate_limit_counters`) fisicamente antes de qualquer teste rodar. Isto NAO e apenas
// "adapter implementado por contrato" -- e a prova fisica de que o contador e realmente
// compartilhado entre instancias/processos distintos, o requisito central desta Fase.
describe("Fase 32 - PostgresRateLimitStore (store distribuido real)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("incrementa atomicamente e retorna a contagem real a cada chamada", async () => {
    const store = new PostgresRateLimitStore(database.pool);
    const key = hashRateLimitKey("test-ns", "key-a");

    const first = await store.increment(key, 60_000);
    const second = await store.increment(key, 60_000);
    const third = await store.increment(key, 60_000);

    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(third.count).toBe(3);
    // O `resetAt` da janela nao muda entre incrementos dentro da MESMA janela.
    expect(second.resetAt).toBe(first.resetAt);
    expect(third.resetAt).toBe(first.resetAt);
  });

  it("chaves distintas nunca compartilham contador", async () => {
    const store = new PostgresRateLimitStore(database.pool);
    const keyA = hashRateLimitKey("test-ns", "key-b");
    const keyB = hashRateLimitKey("test-ns", "key-c");

    await store.increment(keyA, 60_000);
    await store.increment(keyA, 60_000);
    const resultA = await store.increment(keyA, 60_000);
    const resultB = await store.increment(keyB, 60_000);

    expect(resultA.count).toBe(3);
    expect(resultB.count).toBe(1);
  });

  it("uma janela ja expirada reinicia a contagem em 1, nunca acumula com a janela anterior", async () => {
    const store = new PostgresRateLimitStore(database.pool);
    const key = hashRateLimitKey("test-ns", "key-d");

    // Janela de 1ms -- expira quase imediatamente.
    await store.increment(key, 1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterExpiry = await store.increment(key, 60_000);

    expect(afterExpiry.count).toBe(1);
  });

  it("nunca persiste a chave logica bruta -- apenas o hash SHA-256 (namespace:chave)", async () => {
    const store = new PostgresRateLimitStore(database.pool);
    const rawKey = "203.0.113.42"; // um IP, para provar que nao aparece em claro na tabela
    const key = hashRateLimitKey("test-ns", rawKey);

    await store.increment(key, 60_000);

    const rows = await database.pool.query<{ key: string }>(
      "SELECT key FROM rate_limit_counters WHERE key = $1",
      [key]
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].key).toBe(key);
    expect(rows.rows[0].key).not.toContain(rawKey);

    const anyRawIp = await database.pool.query("SELECT 1 FROM rate_limit_counters WHERE key = $1", [
      rawKey
    ]);
    expect(anyRawIp.rowCount).toBe(0);
  });

  it("incrementos concorrentes na MESMA chave nunca perdem contagem (race real via Promise.all)", async () => {
    const store = new PostgresRateLimitStore(database.pool);
    const key = hashRateLimitKey("test-ns", "concurrent-key");
    const CONCURRENT_CALLS = 25;

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_CALLS }, () => store.increment(key, 60_000))
    );

    const counts = results.map((result) => result.count).sort((a, b) => a - b);
    // Cada chamada concorrente deve ter recebido uma contagem UNICA e sequencial (1..N) -- se
    // houvesse uma race condition (leitura-depois-escrita nao atomica), duas chamadas
    // concorrentes poderiam receber a mesma contagem, e o maximo seria menor que N.
    expect(counts).toEqual(Array.from({ length: CONCURRENT_CALLS }, (_, i) => i + 1));
  });

  // Requisito central desta Fase (secao 14 do prompt: "criar um teste onde dois middlewares/
  // limiters independentes usam o MESMO store e confirmam que compartilham contador"). Duas
  // instancias de `PostgresRateLimitStore` (e dois `RateLimiter` completos por cima delas) sao
  // construidas separadamente -- exatamente como dois PROCESSOS Node distintos fariam, cada um
  // com seu proprio objeto JavaScript em sua propria memoria -- mas apontando para o MESMO pool/
  // schema Postgres. Se o contador fosse autoritativo apenas em memoria (o bug que esta Fase
  // corrige), cada "instancia" teria sua propria janela de 5 chamadas e nenhuma delas jamais
  // veria o limite combinado de 5 ser excedido. Com o store Postgres compartilhado, o limite e
  // respeitado GLOBALMENTE entre as duas instancias.
  it("multi-instancia: dois RateLimiter/store independentes apontando para o MESMO Postgres compartilham o mesmo contador", async () => {
    const configs = {
      shared: { limit: 5, windowMs: 60_000, failureMode: "closed" } satisfies RateLimitConfig
    };
    const key = "multi-instance-actor";

    // "Instancia A" e "Instancia B": dois objetos completamente separados, sem nenhuma
    // referencia compartilhada em memoria entre si -- a UNICA coisa em comum e o mesmo
    // `database.pool` (o mesmo Postgres real).
    const instanceA = new RateLimiter(configs, new PostgresRateLimitStore(database.pool));
    const instanceB = new RateLimiter(configs, new PostgresRateLimitStore(database.pool));

    // 3 chamadas na instancia A, 2 na instancia B -- 5 no total, exatamente o limite.
    for (let i = 0; i < 3; i += 1) {
      expect((await instanceA.checkAndRecord("shared", key)).allowed).toBe(true);
    }
    for (let i = 0; i < 2; i += 1) {
      expect((await instanceB.checkAndRecord("shared", key)).allowed).toBe(true);
    }

    // A 6a chamada, em QUALQUER das duas instancias, deve ser bloqueada -- prova que o
    // contador e um so, nunca um por instancia.
    expect((await instanceA.checkAndRecord("shared", key)).allowed).toBe(false);
    expect((await instanceB.checkAndRecord("shared", key)).allowed).toBe(false);
  });

  it("RateLimiter de alto nivel sobre o store Postgres tem o mesmo comportamento observavel do default in-memory (limite, bloqueio, retryAfterSeconds)", async () => {
    const configs = {
      apiLike: { limit: 3, windowMs: 60_000, failureMode: "open" } satisfies RateLimitConfig
    };
    const limiter = new RateLimiter(configs, new PostgresRateLimitStore(database.pool));
    const key = "high-level-key";

    expect((await limiter.checkAndRecord("apiLike", key)).allowed).toBe(true);
    expect((await limiter.checkAndRecord("apiLike", key)).allowed).toBe(true);
    expect((await limiter.checkAndRecord("apiLike", key)).allowed).toBe(true);
    const blocked = await limiter.checkAndRecord("apiLike", key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
