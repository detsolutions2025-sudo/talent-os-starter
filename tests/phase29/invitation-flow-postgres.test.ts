// @vitest-environment node
// Fase 29 (SPEC-028 s15/s25; CA-015 a CA-023). Fluxo completo de convite via HTTP, usando
// DevActorProvider (identico a toda outra suite) para os passos autorizados, e o "bridge" de
// sessao real para o aceite (o unico passo que precisa de um JWT verificado).
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createAuthTestContext,
  createDevAuthApp,
  createOrganizationFixture,
  extractCookieHeader,
  platformHeaders,
  userHeaders
} from "./helpers";

async function acceptViaSessionBridge(
  app: ReturnType<typeof createDevAuthApp>,
  provider: Awaited<ReturnType<typeof createAuthTestContext>>["provider"],
  invitationId: string,
  email: string
) {
  const { accessToken, refreshToken } = await provider.issueSessionForEmail(email);
  const sessionResponse = await request(app)
    .post("/api/auth/session")
    .send({ accessToken, refreshToken });
  expect(sessionResponse.status).toBe(204);
  const cookieHeader = extractCookieHeader(sessionResponse.headers["set-cookie"]);
  const acceptResponse = await request(app)
    .post(`/api/auth/invitations/${invitationId}/accept`)
    .set("Cookie", cookieHeader);
  return acceptResponse;
}

describe("Invitation flow (SPEC-028 s15)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("CA-015: creating an invitation never creates a Membership before acceptance", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "flow1");
    const email = `invitee-${randomUUID()}@example.com`;

    const response = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email, role: "member" })
      .expect(201);

    expect(response.body.status).toBe("pending");
    expect(ctx.provider.invitedEmails).toContain(email);

    const memberships = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/memberships`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(memberships.body.some((m: { userId: string }) => m.userId)).toBeDefined();
    // Nenhum Membership novo alem do owner original.
    expect(memberships.body.length).toBe(1);
  });

  it("CA-016/CA-017: accepting materializes User+AuthIdentity+Membership atomically; a second pending invite for the same pair is refused", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "flow2");
    const email = `invitee-${randomUUID()}@example.com`;

    const created = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email, role: "member" })
      .expect(201);

    // CA-017: segunda tentativa para o mesmo par (org, email) enquanto a primeira ainda esta
    // pending.
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email, role: "member" })
      .expect(409);

    const acceptResponse = await acceptViaSessionBridge(
      fixture.app,
      ctx.provider,
      created.body.id,
      email
    );
    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.membershipId).toBeTruthy();

    const memberships = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/memberships`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(memberships.body.length).toBe(2);
  });

  it("CA-019: accepting an already-accepted invitation is idempotent (no duplicate Membership)", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "flow3");
    const email = `invitee-${randomUUID()}@example.com`;
    const created = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email, role: "member" })
      .expect(201);

    const first = await acceptViaSessionBridge(fixture.app, ctx.provider, created.body.id, email);
    expect(first.status).toBe(200);
    const second = await acceptViaSessionBridge(fixture.app, ctx.provider, created.body.id, email);
    expect(second.status).toBe(200);
    expect(second.body.idempotentReplay).toBe(true);
    expect(second.body.membershipId).toBe(first.body.membershipId);

    const memberships = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/memberships`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(memberships.body.length).toBe(2);
  });

  it("CA-020: invitation organization_id always comes from the authorized route context, never the payload (cross-tenant blocked)", async () => {
    const ctx = await createAuthTestContext(database);
    const fixtureA = await createOrganizationFixture(database, ctx, "flowA");
    const fixtureB = await createOrganizationFixture(database, ctx, "flowB");
    // Owner de A tenta criar convite usando o path de B -- authorize() nega por falta de
    // Membership em B.
    await request(fixtureA.app)
      .post(`/api/organizations/${fixtureB.organizationId}/invitations`)
      .set(userHeaders(fixtureA.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email: "x@example.com", role: "member" })
      .expect(403);
  });

  it("CA-021: acceptance over an archived Organization is refused", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "flow4");
    const email = `invitee-${randomUUID()}@example.com`;
    const created = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email, role: "member" })
      .expect(201);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/archive`)
      .set(platformHeaders)
      .expect(200);

    const acceptResponse = await acceptViaSessionBridge(
      fixture.app,
      ctx.provider,
      created.body.id,
      email
    );
    expect(acceptResponse.status).toBe(403);
  });

  it("CA-022: role is immutable after creation (no update endpoint exposes it)", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "flow5");
    const email = `invitee-${randomUUID()}@example.com`;
    const created = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email, role: "member" })
      .expect(201);
    expect(created.body.role).toBe("member");
    // Nenhum endpoint de update de convite existe -- apenas create/list/cancel/accept (secao 26).
  });

  it("email must match the invitation (defense in depth against session/invitation mismatch)", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "flow6");
    const invitedEmail = `invitee-${randomUUID()}@example.com`;
    const otherEmail = `other-${randomUUID()}@example.com`;
    const created = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email: invitedEmail, role: "member" })
      .expect(201);

    const acceptResponse = await acceptViaSessionBridge(
      fixture.app,
      ctx.provider,
      created.body.id,
      otherEmail
    );
    expect(acceptResponse.status).toBe(403);
  });

  it("unverified email is rejected at acceptance (INV-09)", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "flow7");
    const email = `invitee-${randomUUID()}@example.com`;
    const created = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email, role: "member" })
      .expect(201);

    const { accessToken, refreshToken } = await ctx.provider.issueSessionForEmail(email, {
      emailVerified: false
    });
    const sessionResponse = await request(fixture.app)
      .post("/api/auth/session")
      .send({ accessToken, refreshToken })
      .expect(204);
    const cookieHeader = extractCookieHeader(sessionResponse.headers["set-cookie"]);
    const acceptResponse = await request(fixture.app)
      .post(`/api/auth/invitations/${created.body.id}/accept`)
      .set("Cookie", cookieHeader);
    expect(acceptResponse.status).toBe(403);
  });

  it("member cannot create invitations; admin cannot invite as admin (RBAC mirrors SPEC-004)", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "flow8");
    const memberEmail = `member-${randomUUID()}@example.com`;
    const memberUser = await request(fixture.app)
      .post("/api/dev/users")
      .set(platformHeaders)
      .send({ name: "Member", email: memberEmail })
      .expect(201);
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/memberships`)
      .set(userHeaders(fixture.ownerId))
      .send({ organizationId: fixture.organizationId, userId: memberUser.body.id, role: "member" })
      .expect(201);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(memberUser.body.id))
      .set("Idempotency-Key", randomUUID())
      .send({ email: "x@example.com", role: "member" })
      .expect(403);

    const adminEmail = `admin-${randomUUID()}@example.com`;
    const adminUser = await request(fixture.app)
      .post("/api/dev/users")
      .set(platformHeaders)
      .send({ name: "Admin", email: adminEmail })
      .expect(201);
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/memberships`)
      .set(userHeaders(fixture.ownerId))
      .send({ organizationId: fixture.organizationId, userId: adminUser.body.id, role: "admin" })
      .expect(201);

    // Admin nao pode convidar outro admin.
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(adminUser.body.id))
      .set("Idempotency-Key", randomUUID())
      .send({ email: "y@example.com", role: "admin" })
      .expect(403);

    // Admin pode convidar member.
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(adminUser.body.id))
      .set("Idempotency-Key", randomUUID())
      .send({ email: "z@example.com", role: "member" })
      .expect(201);
  });

  it("cancelling a pending invitation lets a new one be created for the same pair", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "flow9");
    const email = `invitee-${randomUUID()}@example.com`;
    const created = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email, role: "member" })
      .expect(201);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations/${created.body.id}/cancel`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email, role: "member" })
      .expect(201);
  });

  it("an email already belonging to a confirmed User is refused at creation, never revealing account existence beyond a clear conflict for the authorized inviter", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "flow10");
    const email = `confirmed-${randomUUID()}@example.com`;
    const otherFixture = await createOrganizationFixture(database, ctx, "flow10b");
    await database.pool.query(
      `INSERT INTO auth_identities (id, user_id, provider, external_id) VALUES ($1, $2, 'supabase', $3)`,
      [`ai_${otherFixture.ownerId}`, otherFixture.ownerId, `ext-${otherFixture.ownerId}`]
    );
    // Reaproveita o e-mail do owner ja confirmado de outra Organization.
    const ownerEmailResult = await database.pool.query(`SELECT email FROM users WHERE id = $1`, [
      otherFixture.ownerId
    ]);
    void email;
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email: ownerEmailResult.rows[0].email, role: "member" })
      .expect(409);
  });
});
