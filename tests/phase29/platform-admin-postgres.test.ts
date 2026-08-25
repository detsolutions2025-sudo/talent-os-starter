// @vitest-environment node
// Fase 29 (SPEC-028 s21; CA-027; P-06). Platform Admin nunca resolvido por claim do JWT --
// sempre pela tabela `platform_admins`.
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { createAuthTestContext } from "./helpers";
import { TEST_AUDIENCE, TEST_ISSUER } from "./jwt-fixtures";

async function createActiveUserWithIdentity(database: PostgresTestDatabase, suffix: string) {
  const userId = `usr_pa_${suffix}`;
  const externalId = `ext_pa_${suffix}`;
  await database.pool.query(
    `INSERT INTO users (id, name, email, status) VALUES ($1, 'PA', $2, 'active')`,
    [userId, `pa-${suffix}@example.com`]
  );
  await database.pool.query(
    `INSERT INTO auth_identities (id, user_id, provider, external_id) VALUES ($1, $2, 'supabase', $3)`,
    [`ai_${userId}`, userId, externalId]
  );
  return { userId, externalId };
}

describe("Platform Admin resolution (SPEC-028 s21)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("a User with no platform_admins row resolves to a normal user Actor", async () => {
    const ctx = await createAuthTestContext(database);
    const { userId, externalId } = await createActiveUserWithIdentity(database, "none");
    const actor = await ctx.authService.resolveActor({
      externalId,
      email: null,
      emailVerified: true,
      expiresAt: 0
    });
    expect(actor).toEqual({ kind: "user", userId });
  });

  it("a User with an active platform_admins row resolves to a platform Actor", async () => {
    const ctx = await createAuthTestContext(database);
    const { userId, externalId } = await createActiveUserWithIdentity(database, "active");
    await database.pool.query(
      `INSERT INTO platform_admins (user_id, status) VALUES ($1, 'active')`,
      [userId]
    );
    const actor = await ctx.authService.resolveActor({
      externalId,
      email: null,
      emailVerified: true,
      expiresAt: 0
    });
    expect(actor).toEqual({ kind: "platform", userId });
  });

  it("a REVOKED platform_admins row never elevates -- resolves to a normal user Actor", async () => {
    const ctx = await createAuthTestContext(database);
    const { userId, externalId } = await createActiveUserWithIdentity(database, "revoked");
    await database.pool.query(
      `INSERT INTO platform_admins (user_id, status, revoked_at, revoked_by_user_id)
       VALUES ($1, 'revoked', NOW(), $1)`,
      [userId]
    );
    const actor = await ctx.authService.resolveActor({
      externalId,
      email: null,
      emailVerified: true,
      expiresAt: 0
    });
    expect(actor).toEqual({ kind: "user", userId });
  });

  // P-06 (por analogia com organization claim forjada): uma claim arbitraria dentro do JWT
  // (mesmo que nomeada para parecer autoridade de Platform Admin) e estruturalmente descartada
  // -- `VerifiedProviderClaims` (auth/jwt.ts) so carrega externalId/email/emailVerified/exp;
  // nunca existe um campo para "role" ou "platform_admin" nessa estrutura, entao nao ha CAMINHO
  // DE CODIGO que possa le-la, independentemente do que o token contenha.
  it("a forged custom claim inside a valid JWT has zero effect on Platform Admin resolution", async () => {
    const ctx = await createAuthTestContext(database);
    const { userId, externalId } = await createActiveUserWithIdentity(database, "forged");
    const now = Math.floor(Date.now() / 1000);
    const forgedToken = await new SignJWT({
      platform_admin: true,
      role: "platform_admin",
      is_admin: true
    })
      .setProtectedHeader({ alg: "ES256", kid: "test-key-1" })
      .setSubject(externalId)
      .setIssuer(TEST_ISSUER)
      .setAudience(TEST_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(ctx.jwks.privateKey);

    const { verifyProviderToken } = await import("../../src/server/auth/jwt");
    const claims = await verifyProviderToken(forgedToken, ctx.jwks.getKey, {
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE
    });
    // As claims forjadas nunca aparecem no objeto verificado.
    expect(Object.keys(claims).sort()).toEqual([
      "email",
      "emailVerified",
      "expiresAt",
      "externalId"
    ]);

    const actor = await ctx.authService.resolveActor(claims);
    expect(actor).toEqual({ kind: "user", userId });
  });
});
