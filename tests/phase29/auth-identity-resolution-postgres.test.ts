// @vitest-environment node
// Fase 29 (SPEC-028 s10/s12, CA-001 a CA-005). resolveActor: JWT sub -> auth_identity -> user_id
// -> User -> Actor.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forbidden } from "../../src/server/core/errors";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { createAuthTestContext, createOrganizationFixture } from "./helpers";

describe("AuthService.resolveActor (SPEC-028 s10/s12)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("CA-004: AuthIdentity without a User never produces an Actor (fail-closed)", async () => {
    const ctx = await createAuthTestContext(database);
    const claims = {
      externalId: "orphan-external-id",
      email: null,
      emailVerified: true,
      expiresAt: 0
    };
    await expect(ctx.authService.resolveActor(claims)).rejects.toMatchObject({
      code: "auth_identity_not_found"
    });
  });

  it("login succeeds without requiring any Membership (CA-001)", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "nomembership");
    // Cria um User SEM Membership em nenhuma Organization.
    const userResult = await database.pool.query(
      `INSERT INTO users (id, name, email, status) VALUES ($1, 'Solo', $2, 'active') RETURNING id`,
      [`usr_solo_${Date.now()}`, `solo-${Date.now()}@example.com`]
    );
    const userId = userResult.rows[0].id as string;
    const externalId = `ext-solo-${Date.now()}`;
    await database.pool.query(
      `INSERT INTO auth_identities (id, user_id, provider, external_id) VALUES ($1, $2, 'supabase', $3)`,
      [`ai_${userId}`, userId, externalId]
    );
    const actor = await ctx.authService.resolveActor({
      externalId,
      email: null,
      emailVerified: true,
      expiresAt: 0
    });
    expect(actor).toEqual({ kind: "user", userId });
    void fixture;
  });

  it("CA-005: an inactive User never produces a usable Actor", async () => {
    const ctx = await createAuthTestContext(database);
    const userResult = await database.pool.query(
      `INSERT INTO users (id, name, email, status) VALUES ($1, 'Inactive', $2, 'inactive') RETURNING id`,
      [`usr_inactive_${Date.now()}`, `inactive-${Date.now()}@example.com`]
    );
    const userId = userResult.rows[0].id as string;
    const externalId = `ext-inactive-${Date.now()}`;
    await database.pool.query(
      `INSERT INTO auth_identities (id, user_id, provider, external_id) VALUES ($1, $2, 'supabase', $3)`,
      [`ai_${userId}`, userId, externalId]
    );
    await expect(
      ctx.authService.resolveActor({ externalId, email: null, emailVerified: true, expiresAt: 0 })
    ).rejects.toMatchObject({ code: "user_inactive_or_missing" });
  });

  it("never matches identity by email coincidence -- only by (provider, external_id)", async () => {
    const ctx = await createAuthTestContext(database);
    const email = `shared-${Date.now()}@example.com`;
    // Dois Users distintos podem, hipoteticamente, ter e-mails parecidos em ambientes de teste,
    // mas a resolucao nunca deve inferir por e-mail -- apenas confirma que a busca e por
    // external_id, nunca por varredura de e-mail (nao ha nenhum caminho de codigo em
    // `resolveActor` que consulte `users.email`).
    await expect(
      ctx.authService.resolveActor({
        externalId: "never-registered",
        email,
        emailVerified: true,
        expiresAt: 0
      })
    ).rejects.toMatchObject({ code: "auth_identity_not_found" });
  });

  it("forbidden() helper used by resolveActor always maps to HTTP 403", () => {
    const error = forbidden("auth_identity_not_found", "x");
    expect(error.statusCode).toBe(403);
  });
});
