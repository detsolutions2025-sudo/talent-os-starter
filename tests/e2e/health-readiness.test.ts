import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { createFullApp } from "./helpers";

// Fase 33 (E2E + Estabilizacao minima) -- cenario G. Entrada HTTP real -> aplicacao real ->
// PostgreSQL real -> resposta HTTP, para as duas rotas de liveness/readiness (ADR-0027 s12).
// Deliberadamente simples e rapido -- health/readiness sao a primeira linha de defesa
// operacional, nao um fluxo de negocio.
describe("E2E - Health / Readiness (Postgres real disponivel)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("GET /api/health responde ok sem depender do banco (liveness)", async () => {
    const app = createFullApp(database);
    const response = await request(app).get("/api/health").expect(200);
    expect(response.body).toMatchObject({ status: "ok" });
  });

  it("GET /api/ready responde ok quando o Postgres real esta disponivel (readiness)", async () => {
    const checkDatabaseReady = async () => {
      try {
        await database.pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    };
    const app = createFullApp(database, checkDatabaseReady);
    const response = await request(app).get("/api/ready").expect(200);
    expect(response.body).toMatchObject({ status: "ok" });
  });

  it("GET /api/ready responde 503 quando a checagem de banco falha, sem vazar detalhe interno", async () => {
    const checkDatabaseReady = async () => false;
    const app = createFullApp(database, checkDatabaseReady);
    const response = await request(app).get("/api/ready").expect(503);
    expect(response.body).toEqual({ status: "unavailable" });
  });

  it("nenhuma das duas rotas carrega Cache-Control: no-store do roteador de negocio (classe A, fora do router /api)", async () => {
    const app = createFullApp(database);
    const health = await request(app).get("/api/health").expect(200);
    expect(health.headers["cache-control"]).toBeUndefined();
  });
});
