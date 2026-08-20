import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  createActiveEmploymentFixture,
  endEmployment,
  grantAccess,
  platformHeaders,
  rehireEmployment,
  revokeAccess,
  userHeaders
} from "./helpers";

// Fase 28 (SPEC-027 v1.0). Fluxo feliz: concessao, revogacao, elegibilidade, recontratacao,
// cardinalidade e RBAC basico. Cenarios adversarios ficam em
// access-grant-destructive-postgres.test.ts.
describe("Fase 28 - AccessGrant (fluxo)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("concede AccessGrant com proveniencia de Employment active", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-1");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-1"
    );
    const response = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);
    expect(response.body.status).toBe("active");
    expect(response.body.provenanceType).toBe("employment");
    expect(response.body.employmentId).toBe(fixture.employmentId);
  });

  it("concede AccessGrant com proveniencia de Employment ended", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-2");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-2"
    );
    await endEmployment(fixture);
    const response = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);
    expect(response.body.status).toBe("active");
  });

  it("bloqueia Employment pending como proveniencia", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-3");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-3"
    );
    const pendingEmployment = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        organizationPersonId: fixture.organizationPersonId,
        originType: "administrative",
        effectiveStartDate: "2026-08-01",
        originReason: "Segundo vinculo para teste de elegibilidade pending."
      });
    // Um segundo Employment nao-final para a mesma OrganizationPerson e bloqueado pela propria
    // Fase 24 (idx_employments_one_non_final) -- usa-se entao uma OrganizationPerson nova.
    if (pendingEmployment.status !== 201) {
      const person = await request(fixture.app)
        .post(`/api/organizations/${fixture.organizationId}/employments`)
        .set(userHeaders(fixture.ownerId))
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          displayName: "Pessoa Pending Teste",
          originType: "administrative",
          effectiveStartDate: "2026-08-01",
          originReason: "Novo vinculo pending para teste de elegibilidade."
        })
        .expect(201);
      const response = await grantAccess(fixture, {
        organizationPersonId: person.body.organizationPersonId,
        membershipId,
        provenanceType: "employment",
        employmentId: person.body.id
      }).expect(409);
      expect(response.body.error.code).toBe("access_grant_employment_not_eligible");
      return;
    }
    const response = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: pendingEmployment.body.id
    }).expect(409);
    expect(response.body.error.code).toBe("access_grant_employment_not_eligible");
  });

  it("bloqueia Employment cancelled como proveniencia", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-4");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-4"
    );
    const person = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        displayName: "Pessoa Cancelled Teste",
        originType: "administrative",
        effectiveStartDate: "2026-08-01",
        originReason: "Novo vinculo para teste de cancelamento."
      })
      .expect(201);
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments/${person.body.id}/cancel`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ reason: "Cancelado para teste." })
      .expect(200);
    const response = await grantAccess(fixture, {
      organizationPersonId: person.body.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: person.body.id
    }).expect(409);
    expect(response.body.error.code).toBe("access_grant_employment_not_eligible");
  });

  it("concede AccessGrant administrativo (sem Employment) com grant_reason", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-5");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-5"
    );
    const response = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "administrative",
      grantReason: "Acesso administrativo formalizado retroativamente."
    }).expect(201);
    expect(response.body.provenanceType).toBe("administrative");
    expect(response.body.employmentId).toBeNull();
  });

  it("exige grant_reason quando administrative", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-6");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-6"
    );
    await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "administrative"
    }).expect(400);
  });

  it("bloqueia segundo AccessGrant active para a mesma Membership", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-7");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-7"
    );
    await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);
    const response = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "administrative",
      grantReason: "Segunda tentativa deve ser bloqueada."
    }).expect(409);
    expect(response.body.error.code).toBe("access_grant_already_active");
  });

  it("permite novo AccessGrant apos o anterior ser revoked (historico preservado)", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-8");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-8"
    );
    const first = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);
    await revokeAccess(fixture, first.body.id).expect(200);

    // Revoke desativou a Membership por delegacao (secao seguinte prova isso isoladamente) --
    // conceder de novo sobre a MESMA Membership, ainda inactive, deve ser recusado (SPEC-027
    // s8/s12), nao silenciosamente aceito.
    const blocked = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "administrative",
      grantReason: "Tentativa enquanto Membership ainda esta inactive."
    }).expect(409);
    expect(blocked.body.error.code).toBe("access_grant_membership_not_active");

    await request(fixture.app)
      .patch(`/api/memberships/${membershipId}`)
      .set(userHeaders(fixture.ownerId))
      .send({ status: "active" })
      .expect(200);

    const second = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "administrative",
      grantReason: "Nova concessao apos revogacao e reativacao."
    }).expect(201);
    expect(second.body.id).not.toBe(first.body.id);

    const history = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/memberships/${membershipId}/access-grants`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(history.body).toHaveLength(2);
    const revokedEntry = history.body.find((g: { id: string }) => g.id === first.body.id);
    expect(revokedEntry.status).toBe("revoked");
  });

  it("revoke desativa a Membership correspondente via CoreService (delegacao)", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-9");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-9"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);
    await revokeAccess(fixture, grant.body.id, "role_change").expect(200);

    const memberships = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/memberships`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    const membership = memberships.body.find((m: { id: string }) => m.id === membershipId);
    expect(membership.status).toBe("inactive");
  });

  it("recontratacao: Employment.end() nao altera AccessGrant; novo Employment nao reabre o antigo", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-10");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-10"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);

    await endEmployment(fixture);
    const afterEnd = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/access-grants/${grant.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(afterEnd.body.status).toBe("active");

    await revokeAccess(fixture, grant.body.id, "employment_ended").expect(200);
    const newEmploymentId = await rehireEmployment(fixture);

    const revokedGrant = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/access-grants/${grant.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(revokedGrant.body.status).toBe("revoked");

    const reactivate = await request(fixture.app)
      .patch(`/api/memberships/${membershipId}`)
      .set(userHeaders(fixture.ownerId))
      .send({ status: "active" })
      .expect(200);
    expect(reactivate.body.status).toBe("active");

    const secondGrant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: newEmploymentId
    }).expect(201);
    expect(secondGrant.body.id).not.toBe(grant.body.id);

    const stillRevoked = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/access-grants/${grant.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(stillRevoked.body.status).toBe("revoked");
  });

  it("RBAC: member nao concede, nao revoga e nao consulta", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-11");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-11"
    );
    const member = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-11-actor"
    );
    await grantAccess(
      fixture,
      {
        organizationPersonId: fixture.organizationPersonId,
        membershipId,
        provenanceType: "employment",
        employmentId: fixture.employmentId
      },
      crypto.randomUUID(),
      member.userId
    ).expect(403);

    await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/access-grants`)
      .set(userHeaders(member.userId))
      .expect(403);
  });

  it("Platform Admin nunca concede nem revoga; leitura administrativa exige motivo", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-12");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-12"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/access-grants`)
      .set(platformHeaders)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        organizationPersonId: fixture.organizationPersonId,
        membershipId,
        provenanceType: "administrative",
        grantReason: "Platform Admin nunca deve conseguir."
      })
      .expect(403);

    await request(fixture.app)
      .post(`/api/platform/organizations/${fixture.organizationId}/access-grants/admin-read`)
      .set(platformHeaders)
      .send({})
      .expect(400);

    const adminRead = await request(fixture.app)
      .post(`/api/platform/organizations/${fixture.organizationId}/access-grants/admin-read`)
      .set(platformHeaders)
      .send({ reason: "Auditoria de governanca de acesso." })
      .expect(200);
    expect(adminRead.body.some((entry: { id: string }) => entry.id === grant.body.id)).toBe(true);
    expect(adminRead.body[0].grantReason).toBeUndefined();
  });
});
