import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  createActiveEmploymentFixture,
  grantAccess,
  platformHeaders,
  revokeAccess,
  userHeaders
} from "./helpers";

// Fase 28 (SPEC-027 v1.0). Revisao destrutiva: os cenarios explicitamente exigidos pela SPEC
// (s43), reproduzidos como testes reais contra PostgreSQL.
describe("Fase 28 - AccessGrant (destrutivo)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  async function findOwnerMembership(fixture: {
    app: unknown;
    organizationId: string;
    ownerId: string;
  }) {
    const memberships = await request(fixture.app as never)
      .get(`/api/organizations/${fixture.organizationId}/memberships`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    return memberships.body.find((m: { role: string }) => m.role === "owner");
  }

  it("ultimo owner: revoke e recusado; AccessGrant permanece active; Membership permanece active", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destr-1");
    const ownerMembership = await findOwnerMembership(fixture);
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId: ownerMembership.id,
      provenanceType: "administrative",
      grantReason: "AccessGrant sobre o unico owner ativo."
    }).expect(201);

    const revoke = await revokeAccess(fixture, grant.body.id, "administrative_correction").expect(
      409
    );
    expect(revoke.body.error.code).toBe("last_owner_required");

    const afterAttempt = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/access-grants/${grant.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(afterAttempt.body.status).toBe("active");

    const membershipAfter = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/memberships`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    const stillOwner = membershipAfter.body.find(
      (m: { id: string }) => m.id === ownerMembership.id
    );
    expect(stillOwner.status).toBe("active");
  });

  it("self-revoke: owner nao-ultimo pode revogar o proprio AccessGrant", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destr-2");
    const second = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "destr-2"
    );
    await request(fixture.app)
      .patch(`/api/memberships/${second.membershipId}`)
      .set(userHeaders(fixture.ownerId))
      .send({ role: "owner" })
      .expect(200);

    const ownerMembership = await findOwnerMembership(fixture);
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId: ownerMembership.id,
      provenanceType: "administrative",
      grantReason: "AccessGrant do proprio owner (nao-ultimo)."
    }).expect(201);

    // O ator revogando e o dono da propria Membership sendo revogada -- self-revoke.
    await revokeAccess(
      fixture,
      grant.body.id,
      "administrative_correction",
      crypto.randomUUID(),
      fixture.ownerId
    ).expect(200);
  });

  it("admin nao pode revogar AccessGrant cujo Membership e role=owner (delegado a membership.manage_owner)", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destr-3");
    const second = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "destr-3-owner2"
    );
    await request(fixture.app)
      .patch(`/api/memberships/${second.membershipId}`)
      .set(userHeaders(fixture.ownerId))
      .send({ role: "owner" })
      .expect(200);
    const admin = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "admin",
      "destr-3-admin"
    );

    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId: second.membershipId,
      provenanceType: "administrative",
      grantReason: "AccessGrant de um segundo owner."
    }).expect(201);

    const response = await revokeAccess(
      fixture,
      grant.body.id,
      "administrative_correction",
      crypto.randomUUID(),
      admin.userId
    ).expect(403);
    expect(response.body.error.code).toBe("permission_denied");

    const stillActive = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/access-grants/${grant.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(stillActive.body.status).toBe("active");
  });

  it("Membership administrativa sem Employment/AccessGrant continua 100% valida", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destr-4");
    const admin = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "admin",
      "destr-4"
    );
    // Nenhum AccessGrant jamais criado para este Membership -- ele deve continuar autorizando
    // normalmente (Membership e a unica fonte de verdade de autorizacao, SPEC-027 s21).
    await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}`)
      .set(userHeaders(admin.userId))
      .expect(200);

    const history = await request(fixture.app)
      .get(
        `/api/organizations/${fixture.organizationId}/memberships/${admin.membershipId}/access-grants`
      )
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(history.body).toHaveLength(0);
  });

  it("cross-tenant: bloqueia Membership/OrganizationPerson de outra Organization; erro generico", async () => {
    const fixtureA = await createActiveEmploymentFixture(database, "destr-5-a");
    const fixtureB = await createActiveEmploymentFixture(database, "destr-5-b");
    const membershipB = await addMembership(
      fixtureB.app,
      fixtureB.organizationId,
      fixtureB.ownerId,
      "member",
      "destr-5-b"
    );

    const crossMembership = await request(fixtureA.app)
      .post(`/api/organizations/${fixtureA.organizationId}/access-grants`)
      .set(userHeaders(fixtureA.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        organizationPersonId: fixtureA.organizationPersonId,
        membershipId: membershipB.membershipId,
        provenanceType: "administrative",
        grantReason: "Membership de outra Organization -- deve ser bloqueado."
      })
      .expect(404);
    expect(crossMembership.body.error.code).toBe("membership_not_found");

    const crossPerson = await request(fixtureA.app)
      .post(`/api/organizations/${fixtureA.organizationId}/access-grants`)
      .set(userHeaders(fixtureA.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        organizationPersonId: fixtureB.organizationPersonId,
        membershipId: (
          await addMembership(
            fixtureA.app,
            fixtureA.organizationId,
            fixtureA.ownerId,
            "member",
            "x"
          )
        ).membershipId,
        provenanceType: "administrative",
        grantReason: "OrganizationPerson de outra Organization -- deve ser bloqueado."
      })
      .expect(404);
    expect(crossPerson.body.error.code).toBe("organization_person_not_found");
  });

  it("IDOR: get/revoke de AccessGrant de outra Organization retorna 404 generico", async () => {
    const fixtureA = await createActiveEmploymentFixture(database, "destr-6-a");
    const fixtureB = await createActiveEmploymentFixture(database, "destr-6-b");
    const membershipB = await addMembership(
      fixtureB.app,
      fixtureB.organizationId,
      fixtureB.ownerId,
      "member",
      "destr-6-b"
    );
    const grantB = await grantAccess(fixtureB, {
      organizationPersonId: fixtureB.organizationPersonId,
      membershipId: membershipB.membershipId,
      provenanceType: "employment",
      employmentId: fixtureB.employmentId
    }).expect(201);

    await request(fixtureA.app)
      .get(`/api/organizations/${fixtureA.organizationId}/access-grants/${grantB.body.id}`)
      .set(userHeaders(fixtureA.ownerId))
      .expect(404);

    await revokeAccess(fixtureA, grantB.body.id).expect(404);
  });

  it("Organization archived bloqueia grant/revoke mas permite leitura historica", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destr-7");
    const membership = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "destr-7"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId: membership.membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/archive`)
      .set(platformHeaders)
      .expect(200);

    await grantAccess(
      fixture,
      {
        organizationPersonId: fixture.organizationPersonId,
        membershipId: membership.membershipId,
        provenanceType: "administrative",
        grantReason: "Nao deve ser possivel em Organization archived."
      },
      crypto.randomUUID()
    ).expect(403);

    await revokeAccess(fixture, grant.body.id).expect(403);

    const historical = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/access-grants/${grant.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(historical.body.status).toBe("active");
  });

  it("no-delete: DELETE fisico em access_grants e bloqueado por trigger", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destr-8");
    const membership = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "destr-8"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId: membership.membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);

    await expect(
      database.pool.query("DELETE FROM access_grants WHERE id = $1", [grant.body.id])
    ).rejects.toThrow(/access_grant_no_physical_delete/);
  });

  it("no-delete: DELETE fisico em access_grant_idempotency_keys e bloqueado por trigger", async () => {
    const rows = await database.pool.query("SELECT id FROM access_grant_idempotency_keys LIMIT 1");
    expect(rows.rowCount).toBeGreaterThan(0);
    await expect(
      database.pool.query("DELETE FROM access_grant_idempotency_keys WHERE id = $1", [
        rows.rows[0].id
      ])
    ).rejects.toThrow(/access_grant_idempotency_key_no_physical_delete/);
  });

  it("imutabilidade: transicao fora de active->revoked e proveniencia apos criacao sao bloqueadas fisicamente", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destr-9");
    const membership = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "destr-9"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId: membership.membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);

    await expect(
      database.pool.query(
        "UPDATE access_grants SET provenance_type = 'administrative' WHERE id = $1",
        [grant.body.id]
      )
    ).rejects.toThrow(/access_grant_provenance_immutable/);

    await revokeAccess(fixture, grant.body.id).expect(200);

    await expect(
      database.pool.query("UPDATE access_grants SET status = 'active' WHERE id = $1", [
        grant.body.id
      ])
    ).rejects.toThrow(/access_grant_final_immutable/);
  });
});
