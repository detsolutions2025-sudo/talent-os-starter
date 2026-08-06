import request from "supertest";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/app";
import {
  CandidateService,
  createPostgresCandidateService
} from "../../src/server/candidates/service";
import type { CandidateRepository } from "../../src/server/candidates/repository";
import { createPostgresCompetencyService } from "../../src/server/competencies/service";
import { createCoreService } from "../../src/server/core/service";
import type { AuditEvent } from "../../src/server/core/types";
import { createPostgresDnaService } from "../../src/server/dna/service";
import { createPostgresJobOpeningService } from "../../src/server/job-openings/service";
import { createPostgresJobProfileService } from "../../src/server/job-profiles/service";
import { createPostgresOrganizationalUnitService } from "../../src/server/organizational-units/service";
import { PostgresCandidateRepository } from "../../src/server/persistence/postgres-candidate-repository";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresQuestionService } from "../../src/server/questions/service";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

const platformHeaders = { "x-dev-platform-admin": "true" };

function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
}

async function createUser(app: ReturnType<typeof createServer>, prefix: string) {
  const response = await request(app)
    .post("/api/dev/users")
    .set(platformHeaders)
    .send({ name: prefix, email: `${unique(prefix)}@example.com` })
    .expect(201);
  return response.body as { id: string };
}

async function createOrganization(app: ReturnType<typeof createServer>, ownerId: string) {
  const slug = unique("cand-org");
  const response = await request(app)
    .post("/api/organizations")
    .set(platformHeaders)
    .send({ name: `Organization ${slug}`, slug, initialOwnerUserId: ownerId })
    .expect(201);
  return response.body as { organization: { id: string } };
}

async function addMembership(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  userId: string,
  role: "admin" | "member"
) {
  await request(app)
    .post(`/api/organizations/${organizationId}/memberships`)
    .set({ "x-dev-user-id": ownerId })
    .send({ userId, role })
    .expect(201);
}

function candidatePayload(email: string, overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Ana Candidate",
    preferredName: "Ana",
    email,
    phone: "+55 11 99999-0000",
    secondaryPhone: "+55 11 98888-0000",
    source: "manual",
    professionalSummary: "Senior operator",
    location: {
      country: "BR",
      state: "SP",
      city: "Sao Paulo",
      neighborhood: "Centro",
      postalCode: "01000-000",
      address: "Rua Segura 123"
    },
    experiences: [
      {
        company: "Example Co",
        title: "Analyst",
        startDate: "2020-01-01",
        current: true,
        description: "Work",
        location: "Sao Paulo"
      }
    ],
    education: [{ institution: "Uni", course: "CS", level: "undergraduate", current: false }],
    certifications: [{ name: "Cert", issuer: "Issuer" }],
    languages: [{ language: "English", level: "advanced" }],
    professionalLinks: [{ type: "linkedin", url: "https://example.com/in/ana" }],
    declaredCompetencies: ["TypeScript"],
    workAuthorization: { country: "BR", authorized: true, sponsorshipRequired: false },
    salaryExpectation: { min: 1000, max: 2000, currency: "USD", periodicity: "monthly" },
    consent: {
      status: "granted",
      source: "manual",
      termsVersion: "v1",
      purpose: "Recruiting"
    },
    ...overrides
  };
}

function createApp(database: PostgresTestDatabase, service = createPostgresCandidateService) {
  return createServer(
    createCoreService(new PostgresCoreRepository(database.pool)),
    createPostgresDnaService(database.pool),
    createPostgresOrganizationalUnitService(database.pool),
    createPostgresCompetencyService(database.pool),
    createPostgresJobProfileService(database.pool),
    createPostgresQuestionService(database.pool),
    createPostgresJobOpeningService(database.pool),
    service(database.pool)
  );
}

describe("phase 8 candidates API", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createServer>;

  beforeAll(async () => {
    process.env.APP_ENV = "test";
    database = await createPostgresTestDatabase();
  });

  beforeEach(() => {
    process.env.APP_ENV = "test";
    app = createApp(database);
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("creates candidates with email unique per Organization but not globally", async () => {
    const ownerA = await createUser(app, "owner-cand-a");
    const ownerB = await createUser(app, "owner-cand-b");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);

    const first = await request(app)
      .post(`/api/organizations/${orgA.organization.id}/candidates`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(candidatePayload("  PERSON@Example.com "))
      .expect(201);
    expect(first.body.normalizedEmail).toBe("person@example.com");

    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/candidates`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(candidatePayload("person@example.com"))
      .expect(409);

    await request(app)
      .post(`/api/organizations/${orgB.organization.id}/candidates`)
      .set({ "x-dev-user-id": ownerB.id })
      .send(candidatePayload("person@example.com"))
      .expect(201);
  });

  it("protects member DTOs, inactive lists and administrative history", async () => {
    const owner = await createUser(app, "owner-cand-member");
    const member = await createUser(app, "member-cand");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, member.id, "member");

    const created = await request(app)
      .post(`/api/organizations/${organization.id}/candidates`)
      .set({ "x-dev-user-id": owner.id })
      .send(candidatePayload("member-view@example.com"))
      .expect(201);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/internal-notes`)
      .set({ "x-dev-user-id": owner.id })
      .send({ content: "Sensitive note" })
      .expect(201);

    await request(app)
      .get(`/api/organizations/${organization.id}/candidates`)
      .set({ "x-dev-user-id": member.id })
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
        expect(Object.keys(response.body[0]).sort()).toEqual(
          [
            "certifications",
            "city",
            "declaredCompetencies",
            "education",
            "experiences",
            "fullName",
            "id",
            "languages",
            "preferredName",
            "professionalLinks",
            "professionalSummary",
            "source",
            "state",
            "status"
          ].sort()
        );
        expect(JSON.stringify(response.body)).not.toContain("salaryExpectation");
        expect(JSON.stringify(response.body)).not.toContain("secondaryPhone");
        expect(JSON.stringify(response.body)).not.toContain("workAuthorization");
        expect(JSON.stringify(response.body)).not.toContain("Sensitive note");
        expect(JSON.stringify(response.body)).not.toContain("Rua Segura");
        expect(JSON.stringify(response.body)).not.toContain("member-view@example.com");
        expect(JSON.stringify(response.body)).not.toContain("+55 11");
      });

    await request(app)
      .get(`/api/organizations/${organization.id}/candidates/${created.body.id}`)
      .set({ "x-dev-user-id": member.id })
      .expect(200)
      .expect((response) => {
        expect(Object.keys(response.body).sort()).toEqual(
          [
            "certifications",
            "city",
            "declaredCompetencies",
            "education",
            "experiences",
            "fullName",
            "id",
            "languages",
            "preferredName",
            "professionalLinks",
            "professionalSummary",
            "source",
            "state",
            "status"
          ].sort()
        );
        expect(JSON.stringify(response.body)).not.toContain("salaryExpectation");
        expect(JSON.stringify(response.body)).not.toContain("secondaryPhone");
        expect(JSON.stringify(response.body)).not.toContain("workAuthorization");
        expect(JSON.stringify(response.body)).not.toContain("Sensitive note");
        expect(JSON.stringify(response.body)).not.toContain("Rua Segura");
      });

    await request(app)
      .get(`/api/organizations/${organization.id}/candidates/inactive`)
      .set({ "x-dev-user-id": member.id })
      .expect(403);
    await request(app)
      .get(`/api/organizations/${organization.id}/candidates/${created.body.id}/history`)
      .set({ "x-dev-user-id": member.id })
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${organization.id}/candidates/${created.body.id}`)
      .set({ "x-dev-user-id": member.id })
      .send({ fullName: "Blocked" })
      .expect(403);
  });

  it("validates candidate structured data and canonical values", async () => {
    const owner = await createUser(app, "owner-cand-validation");
    const { organization } = await createOrganization(app, owner.id);
    const route = `/api/organizations/${organization.id}/candidates`;
    const headers = { "x-dev-user-id": owner.id };

    const invalidCases = [
      candidatePayload("invalid-email"),
      candidatePayload("valid-name@example.com", { fullName: "A" }),
      candidatePayload("valid-source@example.com", { source: "unknown" }),
      candidatePayload("valid-phone@example.com", { phone: "abc" }),
      candidatePayload("valid-exp-date@example.com", {
        experiences: [
          {
            company: "Example",
            title: "Analyst",
            startDate: "2024-01-01",
            endDate: "2023-01-01",
            current: false
          }
        ]
      }),
      candidatePayload("valid-current@example.com", {
        experiences: [
          {
            company: "Example",
            title: "Analyst",
            startDate: "2024-01-01",
            endDate: "2025-01-01",
            current: true
          }
        ]
      }),
      candidatePayload("valid-education@example.com", {
        education: [{ institution: "Uni", course: "CS", level: "invalid" }]
      }),
      candidatePayload("valid-education-dates@example.com", {
        education: [
          {
            institution: "Uni",
            course: "CS",
            level: "undergraduate",
            startDate: "2025-01-01",
            endDate: "2024-01-01",
            current: false
          }
        ]
      }),
      candidatePayload("valid-education-current@example.com", {
        education: [
          {
            institution: "Uni",
            course: "CS",
            level: "undergraduate",
            startDate: "2024-01-01",
            endDate: "2025-01-01",
            current: true
          }
        ]
      }),
      candidatePayload("valid-cert-dates@example.com", {
        certifications: [
          {
            name: "Cert",
            issuer: "Issuer",
            issuedAt: "2025-01-01",
            expiresAt: "2024-01-01"
          }
        ]
      }),
      candidatePayload("valid-language@example.com", {
        languages: [
          { language: "English", level: "advanced" },
          { language: "english", level: "basic" }
        ]
      }),
      candidatePayload("valid-language-level@example.com", {
        languages: [{ language: "English", level: "invalid" }]
      }),
      candidatePayload("valid-link@example.com", {
        professionalLinks: [{ type: "linkedin", url: "notaurl" }]
      }),
      candidatePayload("valid-competency@example.com", {
        declaredCompetencies: ["TypeScript", "typescript"]
      }),
      candidatePayload("valid-salary@example.com", {
        salaryExpectation: { min: 3000, max: 1000, currency: "USD", periodicity: "monthly" }
      }),
      candidatePayload("valid-availability@example.com", {
        availability: { noticePeriodDays: -1 }
      })
    ];

    for (const payload of invalidCases) {
      await request(app).post(route).set(headers).send(payload).expect(400);
    }
  });

  it("allows admin updates and keeps Platform Admin administrative only", async () => {
    const owner = await createUser(app, "owner-cand-admin");
    const admin = await createUser(app, "admin-cand-admin");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, admin.id, "admin");
    const created = await request(app)
      .post(`/api/organizations/${organization.id}/candidates`)
      .set({ "x-dev-user-id": owner.id })
      .send(candidatePayload("admin@example.com"))
      .expect(201);

    await request(app)
      .patch(`/api/organizations/${organization.id}/candidates/${created.body.id}`)
      .set({ "x-dev-user-id": admin.id })
      .send({ fullName: "Admin Updated" })
      .expect(200)
      .expect((response) => {
        expect(response.body.fullName).toBe("Admin Updated");
      });
    await request(app)
      .post(`/api/organizations/${organization.id}/candidates`)
      .set(platformHeaders)
      .send(candidatePayload("platform-operate@example.com"))
      .expect(403);
    await request(app)
      .get(`/api/organizations/${organization.id}/candidates`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .get(`/api/organizations/${organization.id}/candidates/${created.body.id}`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${organization.id}/candidates/${created.body.id}`)
      .set(platformHeaders)
      .send({ fullName: "Platform Blocked" })
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${organization.id}/candidates/${created.body.id}/email`)
      .set(platformHeaders)
      .send({ email: "platform-blocked@example.com" })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/inactivate`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/reactivate`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/consents`)
      .set(platformHeaders)
      .send({
        status: "granted",
        source: "manual",
        termsVersion: "v1",
        purpose: "Recruiting"
      })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/consents/revoke`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/internal-notes`)
      .set(platformHeaders)
      .send({ content: "Blocked" })
      .expect(403);
    await request(app)
      .get(`/api/organizations/${organization.id}/candidates/${created.body.id}/history`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .post(`/api/platform/organizations/${organization.id}/candidates/admin-read`)
      .set(platformHeaders)
      .send({ reason: "support audit" })
      .expect(200)
      .expect((response) => {
        expect(response.body[0]).toEqual(
          expect.objectContaining({
            id: created.body.id,
            normalizedEmail: "admin@example.com"
          })
        );
        expect(JSON.stringify(response.body)).not.toContain("salaryExpectation");
      });
  });

  it("blocks cross-Organization access, archived Organizations and organization_id changes", async () => {
    const ownerA = await createUser(app, "owner-cand-sec-a");
    const ownerB = await createUser(app, "owner-cand-sec-b");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    const candidate = await request(app)
      .post(`/api/organizations/${orgA.organization.id}/candidates`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(candidatePayload("secure@example.com"))
      .expect(201);

    await request(app)
      .get(`/api/organizations/${orgB.organization.id}/candidates/${candidate.body.id}`)
      .set({ "x-dev-user-id": ownerB.id })
      .expect(404);
    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/candidates/${candidate.body.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ organizationId: orgB.organization.id, fullName: "Changed" })
      .expect(400);
    await expect(
      database.pool.query("UPDATE candidates SET organization_id = $1 WHERE id = $2", [
        orgB.organization.id,
        candidate.body.id
      ])
    ).rejects.toThrow();

    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/archive`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .get(`/api/organizations/${orgA.organization.id}/candidates`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(403);
  });

  it("rejects protected fields, cross-Organization notes and concurrent email duplicates", async () => {
    const ownerA = await createUser(app, "owner-cand-mass-a");
    const ownerB = await createUser(app, "owner-cand-mass-b");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    const headersA = { "x-dev-user-id": ownerA.id };

    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/candidates`)
      .set(headersA)
      .send(candidatePayload("mass-create@example.com", { organization_id: orgB.organization.id }))
      .expect(400);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/candidates`)
      .set(headersA)
      .send(candidatePayload("mass-created-by@example.com", { createdByUserId: ownerB.id }))
      .expect(400);

    const created = await request(app)
      .post(`/api/organizations/${orgA.organization.id}/candidates`)
      .set(headersA)
      .send(candidatePayload("mass-safe@example.com"))
      .expect(201);

    for (const payload of [
      { organization_id: orgB.organization.id },
      { status: "inactive" },
      { email: "mass-direct@example.com" },
      { internalNote: "not here" },
      { created_at: "2026-01-01T00:00:00.000Z" },
      { updatedByUserId: ownerB.id }
    ]) {
      await request(app)
        .patch(`/api/organizations/${orgA.organization.id}/candidates/${created.body.id}`)
        .set(headersA)
        .send(payload)
        .expect(400);
    }
    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/candidates/${created.body.id}/email`)
      .set(headersA)
      .send({ email: "allowed-route@example.com", organization_id: orgB.organization.id })
      .expect(400);
    await request(app)
      .post(
        `/api/organizations/${orgB.organization.id}/candidates/${created.body.id}/internal-notes`
      )
      .set({ "x-dev-user-id": ownerB.id })
      .send({ content: "wrong organization" })
      .expect(404);

    const createResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${orgA.organization.id}/candidates`)
        .set(headersA)
        .send(candidatePayload("race-create@example.com")),
      request(app)
        .post(`/api/organizations/${orgA.organization.id}/candidates`)
        .set(headersA)
        .send(candidatePayload("RACE-CREATE@example.com"))
    ]);
    expect(createResults.map((response) => response.status).sort()).toEqual([201, 409]);

    const first = await request(app)
      .post(`/api/organizations/${orgA.organization.id}/candidates`)
      .set(headersA)
      .send(candidatePayload("race-a@example.com"))
      .expect(201);
    const second = await request(app)
      .post(`/api/organizations/${orgA.organization.id}/candidates`)
      .set(headersA)
      .send(candidatePayload("race-b@example.com"))
      .expect(201);
    const emailResults = await Promise.all([
      request(app)
        .patch(`/api/organizations/${orgA.organization.id}/candidates/${first.body.id}/email`)
        .set(headersA)
        .send({ email: "race-target@example.com" }),
      request(app)
        .patch(`/api/organizations/${orgA.organization.id}/candidates/${second.body.id}/email`)
        .set(headersA)
        .send({ email: "RACE-TARGET@example.com" })
    ]);
    expect(emailResults.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it("handles consent, inactive status, no physical delete and audit rollback", async () => {
    const owner = await createUser(app, "owner-cand-consent");
    const { organization } = await createOrganization(app, owner.id);
    const created = await request(app)
      .post(`/api/organizations/${organization.id}/candidates`)
      .set({ "x-dev-user-id": owner.id })
      .send(candidatePayload("consent@example.com"))
      .expect(201);

    const service = createPostgresCandidateService(database.pool);
    await expect(
      service.ensureOperationalUseAllowed(
        { kind: "user", userId: owner.id },
        organization.id,
        created.body.id
      )
    ).resolves.toBeUndefined();

    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/consents`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        status: "pending",
        source: "manual",
        termsVersion: "v1",
        purpose: "Recruiting"
      })
      .expect(201);
    await expect(
      service.ensureOperationalUseAllowed(
        { kind: "user", userId: owner.id },
        organization.id,
        created.body.id
      )
    ).rejects.toThrow();

    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/consents`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        status: "granted",
        source: "manual",
        termsVersion: "v1",
        purpose: "Recruiting",
        expiresAt: "2020-01-01T00:00:00.000Z"
      })
      .expect(201);
    await expect(
      service.ensureOperationalUseAllowed(
        { kind: "user", userId: owner.id },
        organization.id,
        created.body.id
      )
    ).rejects.toThrow();

    for (const status of ["revoked", "expired"] as const) {
      await request(app)
        .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/consents`)
        .set({ "x-dev-user-id": owner.id })
        .send({
          status,
          source: "manual",
          termsVersion: "v1",
          purpose: "Recruiting"
        })
        .expect(201);
      await expect(
        service.ensureOperationalUseAllowed(
          { kind: "user", userId: owner.id },
          organization.id,
          created.body.id
        )
      ).rejects.toThrow();
    }

    const failingApp = createApp(database, createFailingAuditCandidateService);
    const revokedBefore = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_consents WHERE candidate_id = $1 AND status = 'revoked'",
      [created.body.id]
    );
    await request(failingApp)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/consents/revoke`)
      .set({ "x-dev-user-id": owner.id })
      .expect(500);
    const revokedAfter = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_consents WHERE candidate_id = $1 AND status = 'revoked'",
      [created.body.id]
    );
    expect(Number(revokedAfter.rows[0]?.count ?? 0)).toBe(
      Number(revokedBefore.rows[0]?.count ?? 0)
    );

    await request(failingApp)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/inactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(500);
    const activeAfterRollback = await database.pool.query(
      "SELECT status FROM candidates WHERE id = $1",
      [created.body.id]
    );
    expect(activeAfterRollback.rows[0]?.status).toBe("active");

    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/internal-notes`)
      .set({ "x-dev-user-id": owner.id })
      .send({ content: "Sensitive note for audit" })
      .expect(201);

    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/inactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await expect(
      database.pool.query("DELETE FROM candidates WHERE id = $1", [created.body.id])
    ).rejects.toThrow();
    await expect(
      database.pool.query("DELETE FROM candidate_consents WHERE candidate_id = $1", [
        created.body.id
      ])
    ).rejects.toThrow();
    await expect(
      database.pool.query("DELETE FROM candidate_internal_notes WHERE candidate_id = $1", [
        created.body.id
      ])
    ).rejects.toThrow();

    await request(failingApp)
      .post(`/api/organizations/${organization.id}/candidates`)
      .set({ "x-dev-user-id": owner.id })
      .send(candidatePayload("rollback@example.com"))
      .expect(500);
    const count = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidates WHERE organization_id = $1 AND normalized_email = $2",
      [organization.id, "rollback@example.com"]
    );
    expect(Number(count.rows[0]?.count ?? 0)).toBe(0);

    app = createApp(database);
    await request(app)
      .get(`/api/organizations/${organization.id}/candidates/${created.body.id}`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(created.body.id);
      });

    const auditResponse = await request(app)
      .get("/api/audit-events")
      .set(platformHeaders)
      .expect(200);
    const candidateAudit = auditResponse.body.filter(
      (event: AuditEvent) => event.metadata.candidateId === created.body.id
    );
    const auditJson = JSON.stringify(candidateAudit);
    expect(auditJson).not.toContain("Rua Segura");
    expect(auditJson).not.toContain("+55 11");
    expect(auditJson).not.toContain("Sensitive note for audit");
    expect(auditJson).not.toContain("salaryExpectation");
    expect(auditJson).not.toContain("consent@example.com");
  });
});

function createFailingAuditCandidateService(pool: pg.Pool) {
  const runTransaction = async <T>(
    callback: (transaction: {
      core: PostgresCoreRepository;
      candidates: CandidateRepository;
    }) => Promise<T>
  ) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new FailingAuditCoreRepository(client, true),
        candidates: new PostgresCandidateRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  return new CandidateService(
    new PostgresCoreRepository(pool),
    new PostgresCandidateRepository(pool),
    runTransaction
  );
}

class FailingAuditCoreRepository extends PostgresCoreRepository {
  override async addAuditEvent(event: AuditEvent) {
    void event;
    throw new Error("Injected audit failure.");
  }
}
