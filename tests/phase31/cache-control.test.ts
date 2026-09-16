// Fase 31 (ADR-0027; SPEC-030 v1.0, secao 7.7).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp, platformHeaders } from "./helpers";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const routesSource = readFileSync(
  path.join(currentDir, "../../src/server/http/routes.ts"),
  "utf-8"
);

describe("Fase 31 - Cache-Control (SPEC-030 s7.7)", () => {
  it("CA-034: resposta de rota Membership/Platform Admin (classe E/F) contem Cache-Control: no-store", async () => {
    const app = createTestApp();
    const response = await request(app).get("/api/organizations").set(platformHeaders);

    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("RN-036: aplica-se tambem a uma mutacao (POST) bem-sucedida ou rejeitada", async () => {
    const app = createTestApp();
    const response = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "Org", slug: "org-cache", initialOwnerUserId: "usr_missing" });

    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("RN-037 (preservacao): as chamadas manuais 'no-store' das rotas publicas token-based (Pre-Entrevista/Avaliacao Comportamental/Proposta) continuam no codigo-fonte, sem alteracao", () => {
    // Sem `preInterviews`/`behavioralAssessments`/`proposals` conectados neste harness em
    // memoria, essas rotas nao existem para uma prova end-to-end -- verificacao estrutural
    // direta do codigo-fonte, que e exatamente o que RN-037 exige preservar (nenhuma
    // remocao/alteracao das chamadas manuais ja existentes antes desta Fase).
    const manualNoStoreCalls = routesSource.match(/response\.set\("Cache-Control", "no-store"\)/g);
    expect(manualNoStoreCalls).toHaveLength(9);
  });

  it("RN-038: GET /api/health (classe A) preserva o comportamento de cache atual -- nunca ganha no-store por forca desta Fase", async () => {
    const app = createTestApp();
    const response = await request(app).get("/api/health").expect(200);

    expect(response.headers["cache-control"]).toBeUndefined();
  });
});
