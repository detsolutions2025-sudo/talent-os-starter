import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { PostgresRateLimitStore } from "../../src/server/core/rate-limit-store";
import {
  applicationPayload,
  createFullApp,
  createOrganizationWithPublicJobOpeningFixture,
  submitPublicApplication
} from "./helpers";

// Fase 33 (E2E + Estabilizacao minima) -- cenario F. Prova o rate limiting (Fase 32, ADR-0027
// s9) atravessando a pilha HTTP REAL -- nunca chamando `RateLimiter` diretamente (isso ja e
// coberto, muito mais barato, por tests/phase11 e tests/phase32). Aqui o que importa e a
// integracao ponta a ponta: requests permitidos -> limite excedido -> 429 real -> header
// Retry-After real -> corpo de erro sem vazamento.
//
// Usa o namespace `submitByIp` (limite 5/60s, ver docs/operacao/rate-limiting.md) da
// candidatura publica -- mesma vaga, IPs distintos por chamada nunca sao usados aqui de
// proposito (o cliente supertest sempre bate como o mesmo IP local, exatamente o cenario que a
// chave por IP deve limitar).
describe("E2E - Rate limiting HTTP real (candidatura publica, submitByIp)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  // Combinado num unico teste (nunca dois `it()` separados): a chave e por IP, e o supertest
  // sempre bate como o mesmo IP local -- com o MESMO PostgresRateLimitStore/schema, dois `it()`
  // independentes compartilhariam o mesmo contador entre si (o vazamento entre casos de teste
  // que o default in-memory por-app existe justamente para evitar, ver Fase 32). Um unico
  // cenario evita esse falso-negativo sem precisar de um schema Postgres por teste.
  it("permite as primeiras requisicoes, bloqueia com 429 + Retry-After a partir do limite, e o contador persiste no Postgres real", async () => {
    const app = createFullApp(database, undefined, new PostgresRateLimitStore(database.pool));
    const fixture = await createOrganizationWithPublicJobOpeningFixture(app, "ratelimit-e2e");

    let rateLimitedAt = -1;
    let retryAfterHeader: string | undefined;
    let rateLimitedBody: unknown;

    for (let index = 0; index < 8; index += 1) {
      const response = await submitPublicApplication(
        app,
        fixture.slug,
        applicationPayload({ email: `ratelimit-e2e-${index}-${crypto.randomUUID()}@example.com` })
      );
      if (response.status === 429) {
        rateLimitedAt = index;
        retryAfterHeader = response.headers["retry-after"];
        rateLimitedBody = response.body;
        break;
      }
      expect(response.status).toBe(201);
    }

    // Limite configurado e 5/60s (submitByIp) -- a 6a chamada (indice 5) e a primeira bloqueada.
    expect(rateLimitedAt).toBe(5);

    // Header Retry-After real, presente e numerico, nunca ausente/vazio.
    expect(retryAfterHeader).toBeDefined();
    expect(Number(retryAfterHeader)).toBeGreaterThanOrEqual(1);
    expect(Number(retryAfterHeader)).toBeLessThanOrEqual(60);

    // Corpo de erro padrao, sem vazar contador/chave/IP/detalhe de store.
    expect(rateLimitedBody).toMatchObject({
      error: { code: "public_application_rate_limited", message: "Too many requests." }
    });
    expect(JSON.stringify(rateLimitedBody)).not.toMatch(/127\.0\.0\.1|::1|::ffff/);

    // O contador foi realmente persistido no Postgres (store distribuido), nunca apenas em
    // memoria do processo -- a chave e sempre um hash, nunca o IP em claro (Fase 32).
    const rows = await database.pool.query(
      "SELECT count FROM rate_limit_counters WHERE count >= 5"
    );
    expect(rows.rowCount).toBeGreaterThanOrEqual(1);
  });
});
