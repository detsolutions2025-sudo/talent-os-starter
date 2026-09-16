// Fase 31 (ADR-0027; SPEC-030 v1.0, secao 7.4).
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp, createTestAppWithRepository, platformHeaders } from "./helpers";

const TRUSTED_ORIGIN = "https://app.example.com";
const HOSTILE_ORIGIN = "https://evil.example.com";

describe("Fase 31 - CSRF via Origin/Referer (SPEC-030 s7.4)", () => {
  it("guarda de ativacao: sem nenhuma origem confiavel configurada, o middleware e no-op (preserva ~30 arquivos de teste anteriores a esta Fase)", async () => {
    const app = createTestApp(); // trustedFrontendOrigins vazio (default)
    const response = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "Org", slug: "org-noop", initialOwnerUserId: "usr_missing" });

    // Nenhuma rejeicao de CSRF (403 com code "origin_rejected") mesmo sem enviar Origin/Referer.
    expect(response.status).not.toBe(403);
  });

  it("Gate 9.3: Modo A (same-origin, CORS efetivamente irrelevante) continua com CSRF ativo -- Origin da propria origem configurada e validado normalmente, nunca bypassado por 'nao ser cross-origin'", async () => {
    const SAME_ORIGIN = "https://app.example.com";
    const app = createTestApp({ trustedFrontendOrigins: new Set([SAME_ORIGIN]) });

    const withOrigin = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .set("Origin", SAME_ORIGIN)
      .send({ name: "Org", slug: "org-same-origin-ok", initialOwnerUserId: "usr_missing" });
    expect(withOrigin.status).not.toBe(403);

    // A MESMA configuracao, sem Origin/Referer nenhum -- fail-closed continua se aplicando
    // integralmente, mesmo em topologia same-origin (RN-021): CSRF nunca assume "somos a mesma
    // origem, entao nao precisa validar".
    const withoutOrigin = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "Org", slug: "org-same-origin-no-header", initialOwnerUserId: "usr_x" });
    expect(withoutOrigin.status).toBe(403);
  });

  it("Gate 9.9: ausencia de uma requisicao cross-origin real (nenhum header CORS envolvido) nao desabilita CSRF -- validado por status/corpo da mutacao, nunca por cabecalhos de CORS", async () => {
    const { app, repository } = createTestAppWithRepository({
      trustedFrontendOrigins: new Set([TRUSTED_ORIGIN])
    });
    const response = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "Org", slug: "org-gate9-9", initialOwnerUserId: "usr_x" });
    // Nenhum header `Origin` -> CSRF fail-closed (RN-021), independentemente de o teste nunca ter
    // tocado em nenhum header Access-Control-*.
    expect(response.status).toBe(403);
    expect(repository.snapshot().organizations).toHaveLength(0);
  });

  it("CA-020: mutacao classe E com Origin valido e processada normalmente", async () => {
    const { app, repository } = createTestAppWithRepository({
      trustedFrontendOrigins: new Set([TRUSTED_ORIGIN])
    });
    await request(app)
      .post("/api/dev/users")
      .set(platformHeaders)
      .set("Origin", TRUSTED_ORIGIN)
      .send({ name: "Owner", email: "owner@example.com" })
      .expect(201);
    const owner = repository.snapshot().users[0];

    const response = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .set("Origin", TRUSTED_ORIGIN)
      .send({ name: "Org CSRF OK", slug: "org-csrf-ok", initialOwnerUserId: owner.id })
      .expect(201);

    expect(response.body.organization.status).toBe("active");
  });

  it("CA-021: mutacao classe F com Origin hostil e rejeitada (403) antes de qualquer efeito colateral", async () => {
    const { app, repository } = createTestAppWithRepository({
      trustedFrontendOrigins: new Set([TRUSTED_ORIGIN])
    });

    const response = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .set("Origin", HOSTILE_ORIGIN)
      .send({ name: "Org Hostile", slug: "org-hostile", initialOwnerUserId: "usr_x" })
      .expect(403);

    expect(response.body.error.code).toBe("origin_rejected");
    expect(repository.snapshot().organizations).toHaveLength(0); // sem efeito colateral
  });

  it("CA-022/CA-023/CA-024: PATCH/PUT/DELETE com Origin hostil sao rejeitados pela mesma regra (RN-016)", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });

    for (const method of ["patch", "put", "delete"] as const) {
      const pending = request(app)[method]("/api/organizations/org-any");
      const response = await pending.set(platformHeaders).set("Origin", HOSTILE_ORIGIN).send({});
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("origin_rejected");
    }
  });

  it("Gate 13.12: Origin malformado (nao e uma URL/origem valida) e rejeitado com 403 limpo, nunca lanca excecao nao tratada", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });
    const response = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .set("Origin", "not-a-valid-origin")
      .send({ name: "Org", slug: "org-malformed-origin", initialOwnerUserId: "usr_x" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("origin_rejected");
  });

  it("CA-025 (RN-019): Origin literal 'null' e rejeitado, nunca aceito por engano", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });
    const response = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .set("Origin", "null")
      .send({ name: "Org Null", slug: "org-null", initialOwnerUserId: "usr_x" });

    expect(response.status).toBe(403);
  });

  it("CA-026 (RN-020): sem Origin, com Referer valido -- fallback aceito", async () => {
    const { app, repository } = createTestAppWithRepository({
      trustedFrontendOrigins: new Set([TRUSTED_ORIGIN])
    });
    await request(app)
      .post("/api/dev/users")
      .set(platformHeaders)
      .set("Referer", `${TRUSTED_ORIGIN}/login`)
      .send({ name: "Owner2", email: "owner2@example.com" })
      .expect(201);
    const owner = repository.snapshot().users[0];

    await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .set("Referer", `${TRUSTED_ORIGIN}/settings`)
      .send({ name: "Org Referer", slug: "org-referer", initialOwnerUserId: owner.id })
      .expect(201);
  });

  it("Referer hostil (sem Origin) e rejeitado pela mesma regra", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });
    const response = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .set("Referer", `${HOSTILE_ORIGIN}/anything`)
      .send({ name: "Org", slug: "org-referer-hostile", initialOwnerUserId: "usr_x" });

    expect(response.status).toBe(403);
  });

  it("CA-027 (RN-021): ausencia simultanea de Origin e Referer -- fail-closed", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });
    const response = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "Org", slug: "org-none", initialOwnerUserId: "usr_x" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("origin_rejected");
  });

  it("CA-028/CA-029 (RN-017): rotas sob /public/ nunca exigem Origin/Referer, mesmo sem nenhum dos dois", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });
    const response = await request(app)
      .post("/api/public/job-openings/any-slug/applications")
      .send({});

    // Sem `publicApplications` conectado neste harness em memoria a rota real nao existe
    // (404) -- a prova aqui e que o CSRF NUNCA intercepta (nunca 403/origin_rejected), que e
    // exatamente a responsabilidade deste middleware (RN-017), independente de qual servico de
    // dominio trata a rota.
    expect(response.status).not.toBe(403);
  });

  it("CA-030/CA-031 (RN-023): classe G (/auth/*, /platform/organizations/bootstrap) nunca ganha excecao -- Origin valido passa pelo CSRF, hostil e rejeitado", async () => {
    const app = createTestApp({ trustedFrontendOrigins: new Set([TRUSTED_ORIGIN]) });

    for (const path of [
      "/api/auth/session",
      "/api/auth/refresh",
      "/api/auth/logout",
      "/api/auth/invitations/inv-1/accept",
      "/api/platform/organizations/bootstrap"
    ]) {
      const hostile = await request(app).post(path).set("Origin", HOSTILE_ORIGIN).send({});
      expect(hostile.status).toBe(403);
      expect(hostile.body.error.code).toBe("origin_rejected");

      const trusted = await request(app).post(path).set("Origin", TRUSTED_ORIGIN).send({});
      // `auth` (AuthService) nao esta conectado neste harness em memoria -- a rota real nao
      // existe (404), mas a prova aqui e que o CSRF DEIXA PASSAR (nunca 403/origin_rejected)
      // quando a origem e confiavel, exatamente como RN-023 exige.
      expect(trusted.status).not.toBe(403);
    }
  });
});
