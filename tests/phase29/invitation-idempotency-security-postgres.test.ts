// @vitest-environment node
// Fase 29 (SPEC-028 s19/s26; CA-049 a CA-052). Idempotencia de criacao de convite.
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { createAuthTestContext, createOrganizationFixture, userHeaders } from "./helpers";

describe("Invitation idempotency (SPEC-028 s19/s26)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("retrying the same Idempotency-Key with the same payload returns the same invitation", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "idem1");
    const key = randomUUID();
    const email = `retry-${randomUUID()}@example.com`;
    const body = { email, role: "member" };

    const first = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", key)
      .send(body)
      .expect(201);
    const second = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", key)
      .send(body)
      .expect(201);

    expect(second.body.id).toBe(first.body.id);
    expect(second.body.idempotentReplay).toBe(true);
    // Provider so foi chamado uma vez -- reentrada nunca reenvia o e-mail.
    expect(ctx.provider.invitedEmails.filter((e) => e === email).length).toBe(1);
  });

  it("same key with a different payload (fingerprint mismatch) is a safe conflict", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "idem2");
    const key = randomUUID();

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", key)
      .send({ email: `a-${randomUUID()}@example.com`, role: "member" })
      .expect(201);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", key)
      .send({ email: `b-${randomUUID()}@example.com`, role: "member" })
      .expect(409);
  });

  it("never persists the raw Idempotency-Key -- only a 64-char SHA-256 hash", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "idem3");
    const key = `raw-secret-key-${randomUUID()}`;

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", key)
      .send({ email: `c-${randomUUID()}@example.com`, role: "member" })
      .expect(201);

    const rows = await database.pool.query(
      `SELECT key_hash FROM invitation_idempotency_keys WHERE organization_id = $1`,
      [fixture.organizationId]
    );
    expect(rows.rowCount).toBeGreaterThanOrEqual(1);
    for (const row of rows.rows) {
      expect(row.key_hash).not.toBe(key);
      expect(String(row.key_hash)).toHaveLength(64);
    }
  });

  it("rejects malformed Idempotency-Key values", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "idem4");
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", "short")
      .send({ email: "d@example.com", role: "member" })
      .expect(400);
  });
});
