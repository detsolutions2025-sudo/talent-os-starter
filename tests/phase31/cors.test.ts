// Fase 31 (ADR-0027; SPEC-030 v1.0, secao 7.6).
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp, platformHeaders } from "./helpers";

const TRUSTED_ORIGIN = "https://app.example.com";
const HOSTILE_ORIGIN = "https://evil.example.com";

describe("Fase 31 - CORS (SPEC-030 s7.6)", () => {
  it("CA-012: Modo A (lista vazia) -- nenhum header CORS e enviado, nada quebra", async () => {
    const app = createTestApp();
    const response = await request(app)
      .get("/api/health")
      .set("Origin", TRUSTED_ORIGIN)
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("CA-013: origem permitida recebe Access-Control-Allow-Origin exata + credentials true", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });
    const response = await request(app)
      .get("/api/health")
      .set("Origin", TRUSTED_ORIGIN)
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBe(TRUSTED_ORIGIN);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("CA-014: origem hostil nunca recebe Access-Control-Allow-Origin nem Allow-Credentials", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });
    const response = await request(app)
      .get("/api/health")
      .set("Origin", HOSTILE_ORIGIN)
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined(); // RN-032
  });

  it("RN-031: origem com prefixo/sufixo semelhante nunca casa por substring", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });

    const suffixAttack = await request(app)
      .get("/api/health")
      .set("Origin", "https://app.example.com.evil.com")
      .expect(200);
    expect(suffixAttack.headers["access-control-allow-origin"]).toBeUndefined();

    const prefixAttack = await request(app)
      .get("/api/health")
      .set("Origin", "https://evil-app.example.com")
      .expect(200);
    expect(prefixAttack.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("CA-015 (INV-02/RN-030): nunca wildcard + credentials -- origem aprovada e refletida, nunca '*'", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });
    const response = await request(app)
      .get("/api/health")
      .set("Origin", TRUSTED_ORIGIN)
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).not.toBe("*");
  });

  it("CA-016: preflight OPTIONS de origem permitida nao exige Actor e recebe headers CORS corretos", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });
    const response = await request(app)
      .options("/api/organizations")
      .set("Origin", TRUSTED_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe(TRUSTED_ORIGIN);
  });

  it("CA-017: preflight OPTIONS de origem hostil nao recebe autorizacao CORS", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });
    const response = await request(app)
      .options("/api/organizations")
      .set("Origin", HOSTILE_ORIGIN)
      .set("Access-Control-Request-Method", "POST");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("CA-018/CA-019/RN-028: metodos anunciados incluem o inventario real (GET/POST/PATCH/PUT/DELETE)", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });
    const response = await request(app)
      .options("/api/organizations")
      .set("Origin", TRUSTED_ORIGIN)
      .set("Access-Control-Request-Method", "PUT")
      .expect(204);

    const methods = (response.headers["access-control-allow-methods"] as string) ?? "";
    for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
      expect(methods).toContain(method);
    }
  });

  it("RN-029: cabecalhos anunciados sao os realmente usados, nunca wildcard", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });
    const response = await request(app)
      .options("/api/organizations")
      .set("Origin", TRUSTED_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .expect(204);

    const headers = (response.headers["access-control-allow-headers"] as string) ?? "";
    expect(headers).not.toBe("*");
    expect(headers).toContain("Content-Type");
    expect(headers).toContain("Idempotency-Key");
    expect(headers).toContain("Authorization");
  });

  it("CORS nao interfere no corpo/status de uma requisicao real bem-sucedida (origem permitida)", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });
    const response = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .set("Origin", TRUSTED_ORIGIN)
      .send({ name: "Org CORS", slug: "org-cors", initialOwnerUserId: "usr_missing" });

    // Sem usuario real cadastrado, a operacao de negocio falha (esperado) -- a prova aqui e que
    // a requisicao chegou ate a logica de negocio normalmente, nunca bloqueada por CORS.
    expect(response.status).not.toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBe(TRUSTED_ORIGIN);
  });
});
