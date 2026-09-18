// @vitest-environment node
// `jose` (assinatura/verificacao JWT real) exige a Web Crypto API nativa do Node -- o
// ambiente jsdom (default deste projeto, vitest.config.ts) tem seu proprio polyfill de
// `Uint8Array`/`crypto`, incompativel com os `instanceof` internos de `jose` (mesmo padrao ja
// usado por todo arquivo de tests/phase29 que assina/verifica token real).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  bootstrapOwnerWithRealSession,
  createAuthTestContext,
  createFullDevAppWithAuth,
  createFullAuthApp,
  createOpenJobOpening,
  extractCookieHeader,
  userHeaders
} from "./helpers";

// Fase 33 (E2E + Estabilizacao minima) -- cenario A + gate obrigatorio de tenant isolation
// (secao 4 do prompt). Cadeia de autenticacao REAL e completa, sem nenhum atalho:
//
//   provider (fake, fronteira externa) -> POST /auth/session -> verificacao real de assinatura
//   JWT -> cookie HttpOnly -> requisicao autenticada -> SupabaseActorProvider.resolve() ->
//   AuthIdentity -> User -> Membership -> RBAC (authorize()) -> service -> Postgres real.
//
// Nenhum header de dev-bypass e usado nesta requisicao final -- apenas o cookie de sessao real
// emitido pela propria aplicacao. O UNICO test double e a fronteira EXTERNA do provider
// (`FakeSupabaseAdminPortE2E`, nunca fala com a rede) -- documentado em tests/e2e/helpers.ts.
describe("E2E - Autenticacao real + tenant + RBAC (isolamento cross-tenant obrigatorio)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("uma sessao real chega ao tenant correto, e o mesmo cookie autentica requisicoes subsequentes", async () => {
    const ctx = await createAuthTestContext(database);
    const devApp = createFullDevAppWithAuth(database, ctx);
    const authApp = createFullAuthApp(database, ctx);

    const ownerA = await bootstrapOwnerWithRealSession(devApp, ctx, database, "auth-a");

    const sessionResponse = await request(authApp)
      .post("/api/auth/session")
      .send({ accessToken: ownerA.accessToken, refreshToken: ownerA.refreshToken })
      .expect(204);
    const cookie = extractCookieHeader(sessionResponse.headers["set-cookie"]);
    expect(cookie).toContain("sb_at=");

    // Requisicao autenticada real via cookie -- prova que a sessao chega ao User/tenant certo.
    const me = await request(authApp).get("/api/me").set("Cookie", cookie).expect(200);
    expect(me.body.user.id).toBe(ownerA.userId);
    expect(
      me.body.organizations.some((org: { id: string }) => org.id === ownerA.organizationId)
    ).toBe(true);

    // A MESMA sessao consegue operar dentro do proprio tenant (RBAC real: owner pode listar).
    const ownJobOpenings = await request(authApp)
      .get(`/api/organizations/${ownerA.organizationId}/job-openings`)
      .set("Cookie", cookie)
      .expect(200);
    expect(Array.isArray(ownJobOpenings.body)).toBe(true);
  });

  it("GATE OBRIGATORIO: credencial/membership de uma Organization nunca le, altera ou executa acao sobre recurso de outra Organization", async () => {
    const ctx = await createAuthTestContext(database);
    const devApp = createFullDevAppWithAuth(database, ctx);
    const authApp = createFullAuthApp(database, ctx);

    const ownerA = await bootstrapOwnerWithRealSession(devApp, ctx, database, "tenant-a");
    const ownerB = await bootstrapOwnerWithRealSession(devApp, ctx, database, "tenant-b");

    const sessionA = await request(authApp)
      .post("/api/auth/session")
      .send({ accessToken: ownerA.accessToken, refreshToken: ownerA.refreshToken })
      .expect(204);
    const cookieA = extractCookieHeader(sessionA.headers["set-cookie"]);

    // Recurso real pertencente a B: uma Vaga interna aberta no tenant B (dev-auth, setup).
    const jobOpeningIdB = await createOpenJobOpening(
      devApp,
      ownerB.organizationId,
      ownerB.userId,
      "tenant-b"
    );

    // LEITURA cross-tenant: owner de A (sessao real, cookie real) tentando LISTAR vagas de B.
    const crossRead = await request(authApp)
      .get(`/api/organizations/${ownerB.organizationId}/job-openings`)
      .set("Cookie", cookieA);
    expect(crossRead.status).toBe(403);
    expect(crossRead.body.error.code).toBe("membership_required");

    // LEITURA cross-tenant de um recurso ESPECIFICO (nao apenas a listagem).
    const crossReadOne = await request(authApp)
      .get(`/api/organizations/${ownerB.organizationId}/job-openings/${jobOpeningIdB}`)
      .set("Cookie", cookieA);
    expect(crossReadOne.status).toBe(403);

    // ESCRITA cross-tenant: tentativa de alterar o recurso de B usando a sessao real de A.
    const crossWrite = await request(authApp)
      .patch(`/api/organizations/${ownerB.organizationId}/job-openings/${jobOpeningIdB}`)
      .set("Cookie", cookieA)
      .send({ title: "Tentativa de alteracao indevida" });
    expect(crossWrite.status).toBe(403);

    // EXECUCAO de acao cross-tenant (transicao de estado, nao so leitura/escrita de campo) --
    // "pause" e uma transicao valida a partir do estado "open" em que a Vaga ja se encontra.
    const crossAction = await request(authApp)
      .post(`/api/organizations/${ownerB.organizationId}/job-openings/${jobOpeningIdB}/pause`)
      .set("Cookie", cookieA);
    expect(crossAction.status).toBe(403);

    // Confirma, via o proprio tenant B (dev-auth), que NADA foi alterado pelas tentativas acima
    // -- prova de estado persistido, nunca so a resposta HTTP.
    const stillB = await request(devApp)
      .get(`/api/organizations/${ownerB.organizationId}/job-openings/${jobOpeningIdB}`)
      .set(userHeaders(ownerB.userId))
      .expect(200);
    expect(stillB.body.status).toBe("open");
  });

  it("um Member (sessao real, role correta) tem RBAC real aplicado -- pode ler mas nao pode criar Vaga na propria Organization", async () => {
    const ctx = await createAuthTestContext(database);
    const devApp = createFullDevAppWithAuth(database, ctx);
    const authApp = createFullAuthApp(database, ctx);

    const owner = await bootstrapOwnerWithRealSession(devApp, ctx, database, "member-rbac");
    const { userId: memberUserId } = await addMembership(
      devApp,
      owner.organizationId,
      owner.userId,
      "member",
      "member-rbac"
    );
    const emailResult = await database.pool.query(`SELECT email FROM users WHERE id = $1`, [
      memberUserId
    ]);
    const { accessToken, refreshToken, externalId } = await ctx.provider.issueSessionForEmail(
      emailResult.rows[0].email
    );
    await database.pool.query(
      `INSERT INTO auth_identities (id, user_id, provider, external_id) VALUES ($1, $2, 'supabase', $3)`,
      [`ai_${memberUserId}`, memberUserId, externalId]
    );

    const sessionResponse = await request(authApp)
      .post("/api/auth/session")
      .send({ accessToken, refreshToken })
      .expect(204);
    const cookie = extractCookieHeader(sessionResponse.headers["set-cookie"]);

    const canRead = await request(authApp)
      .get(`/api/organizations/${owner.organizationId}/job-openings`)
      .set("Cookie", cookie)
      .expect(200);
    expect(Array.isArray(canRead.body)).toBe(true);

    const cannotCreate = await request(authApp)
      .post(`/api/organizations/${owner.organizationId}/job-openings`)
      .set("Cookie", cookie)
      .send({ code: "MEMBER-001", title: "Tentativa de Member", positionsCount: 1 });
    expect(cannotCreate.status).toBe(403);
  });
});
