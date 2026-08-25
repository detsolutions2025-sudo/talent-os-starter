// @vitest-environment node
// Fase 29 (SPEC-028 CA-029/CA-030; gates P-01/P-02/P-05/P-06/P-07). Prova executavel de
// isolamento dev/producao: uma app com `SupabaseActorProvider` real (nunca `DevActorProvider`)
// recebendo os headers de desenvolvimento -- devem ser estruturalmente ignorados.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createActorProvider,
  DevActorProvider,
  SupabaseActorProvider
} from "../../src/server/http/actor-provider";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createAuthApp,
  createAuthTestContext,
  createOrganizationFixture,
  extractCookieHeader,
  userHeaders
} from "./helpers";

describe("createActorProvider factory (SPEC-028 s22)", () => {
  it("returns DevActorProvider for development/test, never requiring AuthService", () => {
    expect(createActorProvider("development", {})).toBeInstanceOf(DevActorProvider);
    expect(createActorProvider("test", {})).toBeInstanceOf(DevActorProvider);
  });

  it("throws instead of silently falling back to DevActorProvider outside development/test", () => {
    expect(() => createActorProvider("production", {})).toThrow();
    expect(() => createActorProvider("staging", {})).toThrow();
  });

  it("returns SupabaseActorProvider outside development/test when AuthService is provided", async () => {
    const database = await createPostgresTestDatabase();
    try {
      const ctx = await createAuthTestContext(database);
      const provider = createActorProvider("production", { authService: ctx.authService });
      expect(provider).toBeInstanceOf(SupabaseActorProvider);
    } finally {
      await database.cleanup();
    }
  });
});

describe("SupabaseActorProvider dev-header isolation (P-01/P-02)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("P-01: x-dev-user-id never authenticates against a SupabaseActorProvider app", async () => {
    const ctx = await createAuthTestContext(database);
    const app = createAuthApp(database, ctx, { isProductionEnv: true });
    const response = await request(app).get("/api/me").set(userHeaders("usr_anything"));
    expect(response.status).toBe(403);
  });

  it("P-02: x-dev-platform-admin never elevates privilege against a SupabaseActorProvider app", async () => {
    const ctx = await createAuthTestContext(database);
    const app = createAuthApp(database, ctx, { isProductionEnv: true });
    const response = await request(app)
      .post("/api/platform/organizations/bootstrap")
      .set({ "x-dev-platform-admin": "true" })
      .send({ organizationName: "X", organizationSlug: "x", ownerEmail: "a@b.com" });
    expect(response.status).toBe(403);
  });

  it("request with no cookie and no headers at all is rejected (fail-closed, INV-09)", async () => {
    const ctx = await createAuthTestContext(database);
    const app = createAuthApp(database, ctx);
    const response = await request(app).get("/api/me");
    expect(response.status).toBe(403);
  });

  it("a genuine session cookie resolves a real Actor and Membership-based RBAC still governs access", async () => {
    // Prova end-to-end minima: cria Organization/owner via DevActorProvider app (mesmo banco),
    // depois autentica o MESMO owner via SupabaseActorProvider (sessao real, cookie), provando
    // que os dois provedores concordam sobre a mesma identidade subjacente sem nunca se
    // misturar no mesmo processo em execucao.
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "actorprov");

    // Materializa uma AuthIdentity real para o owner (mesmo caminho fisico usado pelo aceite de
    // convite) para poder emitir uma sessao valida sobre esse User.
    const externalId = "ext-owner-actorprov";
    await database.pool.query(
      `INSERT INTO auth_identities (id, user_id, provider, external_id) VALUES ($1, $2, 'supabase', $3)`,
      [`ai_${fixture.ownerId}`, fixture.ownerId, externalId]
    );
    const accessToken = await ctx.jwks.signToken({ sub: externalId, email: "owner@example.com" });

    const supabaseApp = createAuthApp(database, ctx, { isProductionEnv: true });
    const sessionResponse = await request(supabaseApp)
      .post("/api/auth/session")
      .send({ accessToken, refreshToken: "fake-refresh-actorprov" });
    expect(sessionResponse.status).toBe(204);
    const cookieHeader = extractCookieHeader(sessionResponse.headers["set-cookie"]);

    const meResponse = await request(supabaseApp).get("/api/me").set("Cookie", cookieHeader);
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.id).toBe(fixture.ownerId);
  });
});
