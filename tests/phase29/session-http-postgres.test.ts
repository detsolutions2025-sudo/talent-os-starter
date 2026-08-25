// @vitest-environment node
// Fase 29 (SPEC-028 s9/s13; CA-006 a CA-010). Atributos fisicos do cookie de sessao.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { createAuthApp, createAuthTestContext, extractCookieHeader } from "./helpers";

describe("Session cookies (SPEC-028 s9/s13)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("CA-006: sets HttpOnly + SameSite=Lax + Path=/api, and Secure in production", async () => {
    const ctx = await createAuthTestContext(database);
    const app = createAuthApp(database, ctx, { isProductionEnv: true });
    const accessToken = await ctx.jwks.signToken({ sub: "sess-user-1" });
    const response = await request(app)
      .post("/api/auth/session")
      .send({ accessToken, refreshToken: "fake-refresh-sess-user-1" })
      .expect(204);

    const cookies = ([] as string[]).concat(response.headers["set-cookie"] ?? []);
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\/api/);
      expect(cookie).toMatch(/Secure/i);
    }
  });

  it("does not set Secure in a non-production instance (local HTTP dev)", async () => {
    const ctx = await createAuthTestContext(database);
    const app = createAuthApp(database, ctx, { isProductionEnv: false });
    const accessToken = await ctx.jwks.signToken({ sub: "sess-user-2" });
    const response = await request(app)
      .post("/api/auth/session")
      .send({ accessToken, refreshToken: "fake-refresh-sess-user-2" })
      .expect(204);
    const cookies = ([] as string[]).concat(response.headers["set-cookie"] ?? []);
    for (const cookie of cookies) {
      expect(cookie).not.toMatch(/Secure/i);
    }
  });

  it("rejects a session bridge call with an invalid access token", async () => {
    const ctx = await createAuthTestContext(database);
    const app = createAuthApp(database, ctx);
    await request(app)
      .post("/api/auth/session")
      .send({ accessToken: "not-a-jwt", refreshToken: "x" })
      .expect(403);
  });

  it("CA-009: logout clears both cookies and notifies the provider to revoke the refresh token", async () => {
    const ctx = await createAuthTestContext(database);
    const app = createAuthApp(database, ctx);
    const accessToken = await ctx.jwks.signToken({ sub: "sess-user-3" });
    const sessionResponse = await request(app)
      .post("/api/auth/session")
      .send({ accessToken, refreshToken: "fake-refresh-sess-user-3" })
      .expect(204);
    const cookieHeader = extractCookieHeader(sessionResponse.headers["set-cookie"]);

    const logoutResponse = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookieHeader)
      .expect(204);
    const clearedCookies = ([] as string[]).concat(logoutResponse.headers["set-cookie"] ?? []);
    for (const cookie of clearedCookies) {
      expect(cookie).toMatch(/Max-Age=0/);
    }
    expect(ctx.provider.revokeRefreshCalls).toContain("fake-refresh-sess-user-3");
  });

  it("logout still clears cookies even when the access token is already expired", async () => {
    const ctx = await createAuthTestContext(database);
    const app = createAuthApp(database, ctx);
    const expiredToken = await ctx.jwks.signToken({ sub: "sess-user-4", expiresInSeconds: -10 });
    // Cookie setado manualmente (a ponte de sessao rejeitaria um token expirado) -- simula uma
    // sessao que expirou depois de ja estabelecida.
    const cookieHeader = `sb_at=${expiredToken}; sb_rt=fake-refresh-sess-user-4`;
    const logoutResponse = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookieHeader)
      .expect(204);
    expect(logoutResponse.headers["set-cookie"]).toBeDefined();
  });

  it("refresh rejects when there is no refresh cookie", async () => {
    const ctx = await createAuthTestContext(database);
    const app = createAuthApp(database, ctx);
    await request(app).post("/api/auth/refresh").expect(403);
  });

  it("refresh rotates the session when a valid refresh cookie is presented", async () => {
    const ctx = await createAuthTestContext(database);
    const app = createAuthApp(database, ctx);
    const accessToken = await ctx.jwks.signToken({ sub: "sess-user-5" });
    const sessionResponse = await request(app)
      .post("/api/auth/session")
      .send({ accessToken, refreshToken: "fake-refresh-sess-user-5" })
      .expect(204);
    const cookieHeader = extractCookieHeader(sessionResponse.headers["set-cookie"]);
    const refreshResponse = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookieHeader)
      .expect(204);
    expect(([] as string[]).concat(refreshResponse.headers["set-cookie"] ?? [])).toHaveLength(2);
    expect(ctx.provider.refreshCalls).toContain("fake-refresh-sess-user-5");
  });
});
