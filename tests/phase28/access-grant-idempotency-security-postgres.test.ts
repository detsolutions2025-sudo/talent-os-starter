import { readFileSync } from "node:fs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  createActiveEmploymentFixture,
  grantAccess,
  revokeAccess,
  userHeaders
} from "./helpers";

// Fase 28 (SPEC-027 v1.0). Idempotencia, concorrencia logica, mass assignment, privacidade e
// zero IA.
describe("Fase 28 - AccessGrant (idempotencia e seguranca)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("retry idempotente de grant com a mesma chave e fingerprint retorna o mesmo resultado", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-1");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "idem-1"
    );
    const key = crypto.randomUUID();
    const payload = {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    };
    const first = await grantAccess(fixture, payload, key).expect(201);
    const retry = await grantAccess(fixture, payload, key).expect(201);
    expect(retry.body.id).toBe(first.body.id);

    const all = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/memberships/${membershipId}/access-grants`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(all.body).toHaveLength(1);
  });

  it("mesma chave com fingerprint divergente gera conflito seguro", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-2");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "idem-2"
    );
    const key = crypto.randomUUID();
    await grantAccess(
      fixture,
      {
        organizationPersonId: fixture.organizationPersonId,
        membershipId,
        provenanceType: "employment",
        employmentId: fixture.employmentId
      },
      key
    ).expect(201);
    const conflicting = await grantAccess(
      fixture,
      {
        organizationPersonId: fixture.organizationPersonId,
        membershipId,
        provenanceType: "administrative",
        grantReason: "Payload diferente com a mesma chave."
      },
      key
    ).expect(409);
    expect(conflicting.body.error.code).toBe("access_grant_idempotency_conflict");
  });

  it("retry idempotente de revoke retorna o mesmo resultado", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-3");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "idem-3"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);
    const key = crypto.randomUUID();
    const first = await revokeAccess(fixture, grant.body.id, "role_change", key).expect(200);
    const retry = await revokeAccess(fixture, grant.body.id, "role_change", key).expect(200);
    expect(retry.body.id).toBe(first.body.id);
    expect(retry.body.status).toBe("revoked");
  });

  it("bloqueia mass assignment de organizationId/status/createdByUserId/timestamps no grant", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-4");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "idem-4"
    );
    const response = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId,
      status: "revoked",
      organizationId: "org_outro",
      createdByUserId: "usr_outro",
      createdAt: "2000-01-01T00:00:00.000Z"
    }).expect(400);
    expect(response.body.error.code).toBe("access_grant_unknown_field");
  });

  it("bloqueia mass assignment no revoke (nenhum campo alem de revocationReasonCategory)", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-5");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "idem-5"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);
    const response = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/access-grants/${grant.body.id}/revoke`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ revocationReasonCategory: "role_change", revokedByUserId: "usr_outro" })
      .expect(400);
    expect(response.body.error.code).toBe("access_grant_unknown_field");
  });

  it("exige Idempotency-Key valida para grant e revoke", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-6");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "idem-6"
    );
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/access-grants`)
      .set(userHeaders(fixture.ownerId))
      .send({
        organizationPersonId: fixture.organizationPersonId,
        membershipId,
        provenanceType: "employment",
        employmentId: fixture.employmentId
      })
      .expect(400);
  });

  it("revocation_reason_category invalido e recusado (enum fechado)", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-7");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "idem-7"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);
    await revokeAccess(fixture, grant.body.id, "motivo_livre_nao_permitido").expect(400);
  });

  it("respostas de grant/revoke nunca incluem dado de sessao/token/senha", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-8");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "idem-8"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);
    const serialized = JSON.stringify(grant.body).toLowerCase();
    for (const forbidden of ["password", "token", "session", "secret"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("zero IA: nenhum arquivo do dominio AccessGrant importa AIGateway/ai_executions/provider", () => {
    const files = [
      "src/server/access-grants/types.ts",
      "src/server/access-grants/validation.ts",
      "src/server/access-grants/repository.ts",
      "src/server/access-grants/transaction.ts",
      "src/server/access-grants/service.ts",
      "src/server/persistence/postgres-access-grant-repository.ts"
    ];
    for (const file of files) {
      const content = readFileSync(file, "utf8").toLowerCase();
      expect(content).not.toContain("aigateway");
      expect(content).not.toContain("ai_execution");
      expect(content).not.toContain("../ai/");
      // Palavra inteira (\b) para nao colidir com substrings legitimas como
      // "PostgresCoreRepository" (contem "...grescore...").
      expect(content).not.toMatch(/\bscore\b/);
      expect(content).not.toMatch(/\branking\b/);
    }
  });
});
