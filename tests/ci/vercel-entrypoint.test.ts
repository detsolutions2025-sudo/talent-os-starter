import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wave de Hospedagem (ADR-0028). Prova a suposicao central do roteamento da Vercel
// (`vercel.json`: `{"source": "/api/:path*", "destination": "/api"}`): a function precisa
// receber o PATH ORIGINAL, incluindo o prefixo `/api`, porque o `express()` interno monta suas
// rotas com `app.use("/api", ...)` (ver `src/server/app.ts`). Nenhuma conexao real de banco e
// necessaria -- `/api/health` e uma rota estatica, registrada antes de qualquer service que
// toque o pool, e `buildApp()` nunca conecta eagerly (pg.Pool e preguicoso).
//
// Testa a FONTE (`src/server/vercel-entry.ts`), nao o bundle gerado (`api/index.js`) -- ver
// `tests/ci/vercel-api-bundle.test.ts` para a prova de que o bundle publicado de fato existe e
// roda como Node ESM puro (a classe exata de bug que quebrou o primeiro deploy real: import
// relativo sem extensao, que so falha sob o loader nativo do Node, nunca sob `tsx`/Vitest).
describe("Vercel entrypoint (src/server/vercel-entry.ts)", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_DATABASE_URL", "postgresql://user:pass@localhost:5432/postgres");
    vi.stubEnv("APP_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("exporta um handler (req, res) que delega ao Express real, preservando o path /api/*", async () => {
    const { default: handler } = await import("../../src/server/vercel-entry");
    expect(typeof handler).toBe("function");

    const response = await request(handler).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", service: "talent-os" });
  });

  it("o mesmo handler atende multiplas invocacoes em sequencia, sem reconstruir o app a cada uma", async () => {
    const { default: handler } = await import("../../src/server/vercel-entry");

    const first = await request(handler).get("/api/health");
    const second = await request(handler).get("/api/health");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
