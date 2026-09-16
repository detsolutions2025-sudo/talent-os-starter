// Fase 31 (ADR-0027; SPEC-030 v1.0, secao 7.1 a 7.3, 7.8).
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers";

const SUPABASE_URL = "https://canary-project.supabase.co";

describe("Fase 31 - Security headers (SPEC-030 s7.1-7.3)", () => {
  it("CA-001/CA-007/CA-008/CA-009: producao envia a baseline completa em /api/health", async () => {
    const app = createTestApp({ isProductionEnv: true });
    const response = await request(app).get("/api/health").expect(200);

    expect(response.headers["x-content-type-options"]).toBe("nosniff"); // RN-001/CA-007
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin"); // RN-003/CA-008
    expect(response.headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()"); // RN-004/CA-009
  });

  it("CA-006: protecao de framing dupla (frame-ancestors + X-Frame-Options DENY)", async () => {
    const app = createTestApp({ isProductionEnv: true });
    const response = await request(app).get("/api/health").expect(200);

    expect(response.headers["x-frame-options"]).toBe("DENY"); // RN-002
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'"); // RN-002/RN-013
  });

  it("CA-004/CA-005: CSP de producao permite 'self', inclui a origem Supabase configurada, sem unsafe-inline/eval", async () => {
    const app = createTestApp({ isProductionEnv: true, supabaseAuthOrigin: SUPABASE_URL });
    const response = await request(app).get("/api/health").expect(200);
    const csp = response.headers["content-security-policy"] as string;

    expect(csp).toContain("script-src 'self'"); // RN-011
    expect(csp).toContain("style-src 'self'"); // RN-011
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain(`connect-src 'self' ${SUPABASE_URL}`); // RN-012/CA-004
    expect(csp).toContain("object-src 'none'"); // RN-014
    expect(csp).toContain("base-uri 'self'"); // RN-014
    expect(csp).toContain("form-action 'self'"); // RN-014
    expect(csp).toContain("img-src 'self'"); // RN-015
    expect(csp).toContain("font-src 'self'"); // RN-015
  });

  it("ausencia de Supabase configurado: connect-src cai para 'self' sozinho, nunca quebra", async () => {
    const app = createTestApp({ isProductionEnv: true });
    const response = await request(app).get("/api/health").expect(200);
    const csp = response.headers["content-security-policy"] as string;

    expect(csp).toContain("connect-src 'self'");
  });

  it("CA-010: HSTS presente em producao, sem includeSubDomains/preload (RN-008)", async () => {
    const app = createTestApp({ isProductionEnv: true });
    const response = await request(app).get("/api/health").expect(200);

    expect(response.headers["strict-transport-security"]).toBe("max-age=15552000");
  });

  it("CA-003/CA-011: development nunca recebe CSP/HSTS/framing/nosniff -- nunca quebra o Vite dev server", async () => {
    const app = createTestApp({ isProductionEnv: false });
    const response = await request(app).get("/api/health").expect(200);

    expect(response.headers["content-security-policy"]).toBeUndefined();
    expect(response.headers["strict-transport-security"]).toBeUndefined();
    expect(response.headers["x-frame-options"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBeUndefined();
    expect(response.headers["permissions-policy"]).toBeUndefined();
  });

  it("Gate 8: staging recebe a mesma baseline de headers de producao (SPEC-030 s8), mesmo com isProductionEnv=false (flag de cookie da Fase 29, fora do escopo desta correcao)", async () => {
    const app = createTestApp({
      isProductionEnv: false, // simula APP_ENV=staging: cookie Secure NAO se aplica (Fase 29)
      isProductionOrStagingEnv: true // mas headers de borda desta Fase SIM se aplicam (SPEC-030 s8)
    });
    const response = await request(app).get("/api/health").expect(200);

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers["strict-transport-security"]).toBe("max-age=15552000");
  });

  // Residual documentado (gate 8, correcao pre-commit): o cookie de sessao `Secure` (Fase 29,
  // `http/cookies.ts`) continua condicionado exclusivamente a `isProductionEnv` (hoje
  // `APP_ENV === "production"`, nunca `staging`) -- um gap fisico PRE-EXISTENTE a esta Fase, que
  // diverge do texto de SPEC-030 secao 8 ("staging... secure:true nos cookies"). Fora do escopo
  // desta correcao: alterar esse calculo alteraria o contrato de cookie ja fechado e testado pela
  // Fase 29 (autorizacao de execucao, "Fora do Escopo": nao altera nenhuma linha de
  // `http/cookies.ts`). Registrado aqui e no relatorio final para decisao humana futura.

  // Residual explicito (autorizacao de execucao, item 5): o Express desta aplicacao nunca serve
  // o documento HTML do SPA (`express.static` inexistente em todo `src/server`, SPEC-030 secao
  // 3) -- os testes acima provam a politica de CSP das RESPOSTAS JSON de `/api`, nunca do
  // documento HTML servido por outro processo (Vite em dev, hosting estatico/edge em producao).
  // Fechar esse residual (CSP no documento HTML) e responsabilidade da camada de hosting/edge
  // escolhida no futuro (SPEC-030 secao 18/19) -- fora do escopo desta SPEC e desta
  // implementacao. Registrado aqui e no relatorio final, nunca declarado como ja coberto.
});
