// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 12). Readiness separada de liveness --
// verifica somente a dependencia critica (Postgres), nunca expoe detalhe interno na resposta.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server/app";
import { createMemoryCoreService } from "../../src/server/core/service";

describe("Observabilidade - GET /api/ready", () => {
  it("sem checkDatabaseReady informado, o default otimista preserva compatibilidade (200 ok)", async () => {
    const response = await request(createServer(createMemoryCoreService())).get("/api/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("banco pronto: responde 200 com um corpo minimo, sem detalhe interno", async () => {
    const app = createServer(
      createMemoryCoreService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      false,
      async () => true
    );

    const response = await request(app).get("/api/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("banco indisponivel: responde 503, nunca expoe host/versao/stack/mensagem interna", async () => {
    const app = createServer(
      createMemoryCoreService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      false,
      async () => false
    );

    const response = await request(app).get("/api/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "unavailable" });
    expect(JSON.stringify(response.body)).not.toMatch(/postgres|supabase|localhost|at \S+:\d+/i);
  });

  it("checkDatabaseReady que lanca excecao (nunca resolve/rejeita corretamente) ainda assim responde 503, nunca derruba a rota", async () => {
    const app = createServer(
      createMemoryCoreService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      false,
      async () => {
        throw new Error("connection refused");
      }
    );

    const response = await request(app).get("/api/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "unavailable" });
  });
});
