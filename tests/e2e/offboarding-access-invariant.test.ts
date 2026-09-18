import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  createAdministrativeApplication,
  createFullApp,
  createOrganizationWithPublicJobOpeningFixture,
  hireAndActivateEmployment,
  userHeaders
} from "./helpers";

// Fase 33 (E2E + Estabilizacao minima) -- cenario E. Invariante critica (ADR-0025/SPEC-026/027):
// concluir um Offboarding NUNCA revoga automaticamente Membership ou AccessGrant -- essas sao
// decisoes administrativas explicitas e separadas, nunca um efeito colateral implicito do
// lifecycle de Employment. Esta suite prova isso via HTTP real, do estado inicial (ambos
// ativos) ao estado final (ambos ainda ativos apos o Offboarding ser concluido) -- o teste deve
// falhar se essa regra for removida/alterada. Nenhuma regra de dominio foi tocada para permitir
// este teste.
describe("E2E - Offboarding nao revoga Membership/AccessGrant automaticamente", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("Membership e AccessGrant permanecem ativos apos o Offboarding ser concluido", async () => {
    const app = createFullApp(database);
    const fixture = await createOrganizationWithPublicJobOpeningFixture(app, "offboard-e2e");
    const applicationId = await createAdministrativeApplication(app, fixture);
    const { employmentId, organizationPersonId } = await hireAndActivateEmployment(
      app,
      fixture.organizationId,
      fixture.ownerId,
      applicationId
    );

    // Membership real de sistema para a pessoa contratada (papel "member").
    const { membershipId } = await addMembership(
      app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "offboard-e2e"
    );

    // AccessGrant vinculando o Membership ao OrganizationPerson via o proprio Employment.
    const grant = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/access-grants`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        organizationPersonId,
        membershipId,
        provenanceType: "employment",
        employmentId
      })
      .expect(201);
    const accessGrantId = grant.body.id as string;

    // Confirma estado inicial real (ambos ativos) ANTES do offboarding -- nunca assumido.
    const membershipBefore = await database.pool.query(
      "SELECT status FROM memberships WHERE id = $1",
      [membershipId]
    );
    expect(membershipBefore.rows[0].status).toBe("active");
    const grantBefore = await database.pool.query(
      "SELECT status FROM access_grants WHERE id = $1",
      [accessGrantId]
    );
    expect(grantBefore.rows[0].status).toBe("active");

    // Ciclo completo de Offboarding: criar -> iniciar -> concluir.
    const offboarding = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/employments/${employmentId}/offboardings`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(201);
    const offboardingId = offboarding.body.id as string;

    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/offboardings/${offboardingId}/start`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(200);

    const completed = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/offboardings/${offboardingId}/complete`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(200);
    expect(completed.body.status).toBe("completed");

    // A INVARIANTE: Membership e AccessGrant continuam ativos -- lido diretamente do Postgres,
    // nunca so da resposta HTTP do Offboarding.
    const membershipAfter = await database.pool.query(
      "SELECT status FROM memberships WHERE id = $1",
      [membershipId]
    );
    expect(membershipAfter.rows[0].status).toBe("active");
    const grantAfter = await database.pool.query("SELECT status FROM access_grants WHERE id = $1", [
      accessGrantId
    ]);
    expect(grantAfter.rows[0].status).toBe("active");

    // Confirmado tambem pela API (nao apenas pelo banco) -- visao administrativa real.
    const grantView = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/memberships/${membershipId}/access-grants`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(
      grantView.body.some(
        (g: { id: string; status: string }) => g.id === accessGrantId && g.status === "active"
      )
    ).toBe(true);
  });
});
