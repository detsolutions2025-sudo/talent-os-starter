import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  createActiveApplicationFixture,
  createHiredFixture,
  createRecruitmentEmployment,
  employmentAction,
  platformHeaders,
  userHeaders
} from "./helpers";

describe("Fase 24 - OrganizationPerson e Employment fluxo", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("cria Employment de recrutamento somente apos hired e reutiliza OrganizationPerson do Candidate", async () => {
    const active = await createActiveApplicationFixture(database, "not-hired");
    await request(active.app)
      .post(`/api/organizations/${active.organizationId}/employments`)
      .set(userHeaders(active.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        originType: "recruitment",
        candidateApplicationId: active.applicationId,
        effectiveStartDate: "2026-09-01",
        originReason: "Tentativa antes do hired."
      })
      .expect(409);

    const fixture = await createHiredFixture(database, "recruitment");
    const first = await createRecruitmentEmployment(fixture).expect(201);
    expect(first.body.status).toBe("pending");
    expect(first.body.originType).toBe("recruitment");
    expect(first.body.originCandidateApplicationId).toBe(fixture.applicationId);
    expect(first.body.organizationPerson.originCandidateId).toBe(fixture.candidateId);

    await employmentAction(fixture, first.body.id, "activate").expect(200);
    await employmentAction(fixture, first.body.id, "end", crypto.randomUUID(), {
      endDate: "2026-12-01",
      reason: "Fim do contrato."
    }).expect(200);
    const second = await createRecruitmentEmployment(fixture, crypto.randomUUID(), {
      effectiveStartDate: "2027-01-10"
    }).expect(201);
    expect(second.body.organizationPersonId).toBe(first.body.organizationPersonId);
  });

  it("cria Employment administrativo sem Candidate e nao deduplica por email", async () => {
    const fixture = await createHiredFixture(database, "administrative");
    const payload = {
      originType: "administrative",
      displayName: "Pessoa Administrativa",
      primaryEmail: "pessoa.admin@example.com",
      effectiveStartDate: "2026-09-01",
      originReason: "Cadastro administrativo explicito."
    };
    const first = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send(payload)
      .expect(201);
    await employmentAction(fixture, first.body.id, "cancel", crypto.randomUUID(), {
      reason: "Nao iniciado."
    }).expect(200);
    const second = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send(payload)
      .expect(201);
    expect(second.body.organizationPersonId).not.toBe(first.body.organizationPersonId);
    expect(second.body.organizationPerson.originCandidateId).toBeNull();
  });

  it("bloqueia segundo vinculo nao-final e transicoes invalidas", async () => {
    const fixture = await createHiredFixture(database, "lifecycle");
    const created = await createRecruitmentEmployment(fixture).expect(201);
    await createRecruitmentEmployment(fixture, crypto.randomUUID(), {
      effectiveStartDate: "2026-10-01"
    }).expect(409);

    await employmentAction(fixture, created.body.id, "end", crypto.randomUUID(), {
      endDate: "2026-10-01",
      reason: "Nao ativo."
    }).expect(409);
    await employmentAction(fixture, created.body.id, "activate").expect(200);
    await employmentAction(fixture, created.body.id, "cancel", crypto.randomUUID(), {
      reason: "Tarde demais."
    }).expect(409);
    await employmentAction(fixture, created.body.id, "end", crypto.randomUUID(), {
      endDate: "2026-10-01",
      reason: "Encerramento."
    }).expect(200);
    await employmentAction(fixture, created.body.id, "activate").expect(409);
  });

  it("aplica RBAC, leitura administrativa minimizada e bloqueio de Organization arquivada", async () => {
    const fixture = await createHiredFixture(database, "rbac");
    const member = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "rbac"
    );
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(member.userId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        originType: "recruitment",
        candidateApplicationId: fixture.applicationId,
        effectiveStartDate: "2026-09-01",
        originReason: "Member nao pode."
      })
      .expect(403);

    const created = await createRecruitmentEmployment(fixture).expect(201);
    // SPEC-025 s20: "Consultar OrganizationPerson completo" e "Consultar lista minima" sao Sim
    // apenas para owner/admin; member e "Nao" / "Nao por padrao". Member nao recebe permissao
    // implicita de leitura -- nem sequer a lista minimizada existe nesta v1.
    await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/organization-people`)
      .set(userHeaders(member.userId))
      .expect(403);
    await request(fixture.app)
      .get(
        `/api/organizations/${fixture.organizationId}/organization-people/${created.body.organizationPersonId}`
      )
      .set(userHeaders(member.userId))
      .expect(403);
    await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(member.userId))
      .expect(403);

    const adminRead = await request(fixture.app)
      .post(`/api/platform/organizations/${fixture.organizationId}/employments/admin-read`)
      .set(platformHeaders)
      .send({ reason: "Auditoria operacional." })
      .expect(200);
    expect(JSON.stringify(adminRead.body)).not.toContain("@example.com");
    expect(JSON.stringify(adminRead.body)).not.toContain("displayName");

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/archive`)
      .set(platformHeaders)
      .send({})
      .expect(200);
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        originType: "administrative",
        displayName: "Arquivada",
        effectiveStartDate: "2026-09-01",
        originReason: "Nao permitido."
      })
      .expect(403);
    await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
  });
});
