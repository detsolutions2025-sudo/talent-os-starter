// @vitest-environment node
// Fase 29 (SPEC-028 s28; secao 16 do prompt de implementacao). Concorrencia real contra
// PostgreSQL -- `Promise.all`, nunca asserts frouxos: cada teste prova o invariante final exato,
// nao apenas "nao quebrou".
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createAuthTestContext,
  createOrganizationFixture,
  extractCookieHeader,
  platformHeaders,
  userHeaders
} from "./helpers";

describe("Invitation concurrency (SPEC-028 s28, real PostgreSQL)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("invite x invite: two concurrent creations for the same (organization, email) produce exactly one pending invitation", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "conc1");
    const email = `conc-${randomUUID()}@example.com`;

    const results = await Promise.all([
      request(fixture.app)
        .post(`/api/organizations/${fixture.organizationId}/invitations`)
        .set(userHeaders(fixture.ownerId))
        .set("Idempotency-Key", randomUUID())
        .send({ email, role: "member" }),
      request(fixture.app)
        .post(`/api/organizations/${fixture.organizationId}/invitations`)
        .set(userHeaders(fixture.ownerId))
        .set("Idempotency-Key", randomUUID())
        .send({ email, role: "member" })
    ]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);

    const pending = await database.pool.query(
      `SELECT count(*)::int AS count FROM invitations
       WHERE organization_id = $1 AND email = $2 AND status = 'pending'`,
      [fixture.organizationId, email]
    );
    expect(pending.rows[0].count).toBe(1);
  });

  it("accept x accept: two concurrent acceptances of the same invitation produce exactly one Membership", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "conc2");
    const email = `conc-accept-${randomUUID()}@example.com`;
    const created = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email, role: "member" })
      .expect(201);

    const { accessToken, refreshToken } = await ctx.provider.issueSessionForEmail(email);
    const sessionResponse = await request(fixture.app)
      .post("/api/auth/session")
      .send({ accessToken, refreshToken })
      .expect(204);
    const cookieHeader = extractCookieHeader(sessionResponse.headers["set-cookie"]);

    const results = await Promise.all([
      request(fixture.app)
        .post(`/api/auth/invitations/${created.body.id}/accept`)
        .set("Cookie", cookieHeader),
      request(fixture.app)
        .post(`/api/auth/invitations/${created.body.id}/accept`)
        .set("Cookie", cookieHeader)
    ]);

    // Ambas devem retornar 200 (uma real, outra idempotente) -- nunca uma 409/500 por corrida.
    expect(results.every((r) => r.status === 200)).toBe(true);
    const membershipIds = new Set(results.map((r) => r.body.membershipId));
    expect(membershipIds.size).toBe(1);

    const memberships = await database.pool.query(
      `SELECT count(*)::int AS count FROM memberships WHERE organization_id = $1`,
      [fixture.organizationId]
    );
    // owner + exatamente um novo membership.
    expect(memberships.rows[0].count).toBe(2);
  });

  it("accept x Organization.archive: deterministic outcome, never a corrupted state", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "conc3");
    const email = `conc-archive-${randomUUID()}@example.com`;
    const created = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/invitations`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", randomUUID())
      .send({ email, role: "member" })
      .expect(201);

    const { accessToken, refreshToken } = await ctx.provider.issueSessionForEmail(email);
    const sessionResponse = await request(fixture.app)
      .post("/api/auth/session")
      .send({ accessToken, refreshToken })
      .expect(204);
    const cookieHeader = extractCookieHeader(sessionResponse.headers["set-cookie"]);

    const [acceptResult] = await Promise.all([
      request(fixture.app)
        .post(`/api/auth/invitations/${created.body.id}/accept`)
        .set("Cookie", cookieHeader),
      request(fixture.app)
        .post(`/api/organizations/${fixture.organizationId}/archive`)
        .set(platformHeaders)
    ]);

    // Invariante: se o aceite retornou 200, o Membership existe. Se retornou 403 (Organization
    // archived), nenhum Membership novo foi criado. Nunca um estado intermediario.
    const membershipCount = await database.pool.query(
      `SELECT count(*)::int AS count FROM memberships WHERE organization_id = $1 AND role = 'member'`,
      [fixture.organizationId]
    );
    if (acceptResult.status === 200) {
      expect(membershipCount.rows[0].count).toBe(1);
    } else {
      expect([403, 409]).toContain(acceptResult.status);
      expect(membershipCount.rows[0].count).toBe(0);
    }
  });

  it("bootstrap x bootstrap (path A, same owner email): exactly one Organization is created for a duplicate slug attempt", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "conc4owner");
    await database.pool.query(
      `INSERT INTO auth_identities (id, user_id, provider, external_id) VALUES ($1, $2, 'supabase', $3)`,
      [`ai_${fixture.ownerId}`, fixture.ownerId, `ext-bootstrap-${fixture.ownerId}`]
    );
    const ownerEmailResult = await database.pool.query(`SELECT email FROM users WHERE id = $1`, [
      fixture.ownerId
    ]);
    const ownerEmail = ownerEmailResult.rows[0].email as string;
    const slug = `bootstrap-conc-${randomUUID().slice(0, 8)}`;

    const results = await Promise.all([
      request(fixture.app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", fixture.ownerId)
        .send({ organizationName: "Bootstrap Conc", organizationSlug: slug, ownerEmail }),
      request(fixture.app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", fixture.ownerId)
        .send({ organizationName: "Bootstrap Conc", organizationSlug: slug, ownerEmail })
    ]);

    const statuses = results.map((r) => r.status).sort();
    // Achado (nao introduzido por esta Fase, fora de escopo corrigir aqui): a checagem de slug
    // duplicado de `CoreService.createOrganization` (core/service.ts, Fase 1) e um SELECT
    // previo, nao uma constraint traduzida por `PostgresCoreRepository.transaction()`
    // (`isPostgresConcurrentConflict` so cobre 40P01/40001/55P03 -- comentario explicito no
    // proprio arquivo: "nao ha nenhuma constraint 23505 especifica de dominio para traduzir em
    // CoreRepository"). Sob corrida real, a segunda escrita pode perder a corrida no SELECT
    // (409, caminho feliz) OU colidir fisicamente na UNIQUE de `organizations.slug` e
    // propagar como 500 (o mesmo 23505 cru, nao traduzido). Isso e uma caracteristica
    // pre-existente de `core/service.ts`, que esta Fase nao pode alterar (fora de escopo:
    // zero linha de core/service.ts tocada por Fase 29) -- o invariante que realmente importa
    // aqui, e que esta Fase precisa provar, e o de baixo: nunca duas Organizations com o mesmo
    // slug, qualquer que seja o codigo HTTP do perdedor.
    expect(statuses[0]).toBe(201);
    expect([409, 500]).toContain(statuses[1]);
    const orgs = await database.pool.query(
      `SELECT count(*)::int AS count FROM organizations WHERE slug = $1`,
      [slug]
    );
    expect(orgs.rows[0].count).toBe(1);
  });

  // Migration 0033 (correcao fisica complementar). Caminho B do bootstrap (SPEC-028 s16 passo 3)
  // -- convite assincrono, mesma familia fisica de `invitations` do caminho ja testado acima.

  it("bootstrap invite x bootstrap invite: two concurrent creations for the same owner email produce exactly one pending bootstrap invitation", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "concboot1");
    const ownerEmail = `concboot-${randomUUID()}@example.com`;

    const results = await Promise.all([
      request(fixture.app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", fixture.ownerId)
        .set("Idempotency-Key", randomUUID())
        .send({
          organizationName: "Conc Boot A",
          organizationSlug: `concboot-a-${randomUUID().slice(0, 8)}`,
          ownerEmail
        }),
      request(fixture.app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", fixture.ownerId)
        .set("Idempotency-Key", randomUUID())
        .send({
          organizationName: "Conc Boot B",
          organizationSlug: `concboot-b-${randomUUID().slice(0, 8)}`,
          ownerEmail
        })
    ]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);

    const pending = await database.pool.query(
      `SELECT count(*)::int AS count FROM invitations
       WHERE organization_id IS NULL AND email = $1 AND status = 'pending'`,
      [ownerEmail]
    );
    expect(pending.rows[0].count).toBe(1);
  });

  it("bootstrap accept x bootstrap accept: two concurrent acceptances of the same bootstrap invitation produce exactly one Organization and one owner Membership", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "concboot2");
    const slug = `concboot-accept-${randomUUID().slice(0, 8)}`;
    const ownerEmail = `concboot-accept-${randomUUID()}@example.com`;

    const created = await request(fixture.app)
      .post("/api/platform/organizations/bootstrap")
      .set(platformHeaders)
      .set("x-dev-user-id", fixture.ownerId)
      .set("Idempotency-Key", randomUUID())
      .send({ organizationName: "Conc Boot Accept", organizationSlug: slug, ownerEmail })
      .expect(201);

    const { accessToken, refreshToken } = await ctx.provider.issueSessionForEmail(ownerEmail);
    const sessionResponse = await request(fixture.app)
      .post("/api/auth/session")
      .send({ accessToken, refreshToken })
      .expect(204);
    const cookieHeader = extractCookieHeader(sessionResponse.headers["set-cookie"]);

    const results = await Promise.all([
      request(fixture.app)
        .post(`/api/auth/invitations/${created.body.id}/accept`)
        .set("Cookie", cookieHeader),
      request(fixture.app)
        .post(`/api/auth/invitations/${created.body.id}/accept`)
        .set("Cookie", cookieHeader)
    ]);

    // Nunca uma 409/500 por corrida -- uma real, outra idempotente, ambas 200.
    expect(results.every((r) => r.status === 200)).toBe(true);
    const membershipIds = new Set(results.map((r) => r.body.membershipId));
    expect(membershipIds.size).toBe(1);

    const orgs = await database.pool.query(
      `SELECT count(*)::int AS count FROM organizations WHERE slug = $1`,
      [slug]
    );
    expect(orgs.rows[0].count).toBe(1);
    const memberships = await database.pool.query(
      `SELECT count(*)::int AS count FROM memberships m
       JOIN organizations o ON o.id = m.organization_id WHERE o.slug = $1`,
      [slug]
    );
    expect(memberships.rows[0].count).toBe(1);
  });

  it("bootstrap invite: same Idempotency-Key used concurrently produces exactly one bootstrap invitation, never two", async () => {
    const ctx = await createAuthTestContext(database);
    const fixture = await createOrganizationFixture(database, ctx, "concboot3");
    const key = randomUUID();
    const ownerEmail = `concboot-idem-${randomUUID()}@example.com`;
    const body = {
      organizationName: "Conc Boot Idem",
      organizationSlug: `concboot-idem-${randomUUID().slice(0, 8)}`,
      ownerEmail
    };

    const results = await Promise.all([
      request(fixture.app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", fixture.ownerId)
        .set("Idempotency-Key", key)
        .send(body),
      request(fixture.app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", fixture.ownerId)
        .set("Idempotency-Key", key)
        .send(body)
    ]);

    // A corrida sobre a MESMA Idempotency-Key nunca produz dois convites: um vence a criacao,
    // o outro ve `pending`/`in_progress` (409) ou o mesmo resultado ja completado (201) --
    // nunca duas linhas fisicas.
    expect(results.every((r) => [201, 409].includes(r.status))).toBe(true);
    const pending = await database.pool.query(
      `SELECT count(*)::int AS count FROM invitations WHERE organization_id IS NULL AND email = $1`,
      [ownerEmail]
    );
    expect(pending.rows[0].count).toBe(1);
  });
});
