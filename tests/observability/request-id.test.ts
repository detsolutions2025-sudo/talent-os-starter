// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 10/11). Correlation/request ID gerado por
// requisicao e devolvido em header de resposta.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server/app";
import { createMemoryCoreService } from "../../src/server/core/service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("Observabilidade - X-Request-Id", () => {
  it("toda resposta carrega um X-Request-Id no formato de UUID", async () => {
    const response = await request(createServer(createMemoryCoreService())).get("/api/health");

    expect(response.headers["x-request-id"]).toMatch(UUID_PATTERN);
  });

  it("duas requisicoes distintas recebem X-Request-Id distintos (nunca reutilizado entre requisicoes)", async () => {
    const app = createServer(createMemoryCoreService());

    const first = await request(app).get("/api/health");
    const second = await request(app).get("/api/health");

    expect(first.headers["x-request-id"]).not.toBe(second.headers["x-request-id"]);
  });

  it("um X-Request-Id enviado pelo cliente e ignorado -- o servidor sempre gera o seu proprio (nunca confia em ID de entrada)", async () => {
    const response = await request(createServer(createMemoryCoreService()))
      .get("/api/health")
      .set("X-Request-Id", "client-supplied-id-should-be-ignored");

    expect(response.headers["x-request-id"]).toMatch(UUID_PATTERN);
    expect(response.headers["x-request-id"]).not.toBe("client-supplied-id-should-be-ignored");
  });
});
