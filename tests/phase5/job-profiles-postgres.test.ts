import request from "supertest";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/app";
import { createPostgresCompetencyService } from "../../src/server/competencies/service";
import type { CompetencyRepository } from "../../src/server/competencies/repository";
import { createCoreService } from "../../src/server/core/service";
import type { AuditEvent } from "../../src/server/core/types";
import { createPostgresDnaService } from "../../src/server/dna/service";
import {
  createPostgresJobProfileService,
  JobProfileService
} from "../../src/server/job-profiles/service";
import type { JobProfileRepository } from "../../src/server/job-profiles/repository";
import { createPostgresOrganizationalUnitService } from "../../src/server/organizational-units/service";
import { PostgresCompetencyRepository } from "../../src/server/persistence/postgres-competency-repository";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { PostgresJobProfileRepository } from "../../src/server/persistence/postgres-job-profile-repository";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

const platformHeaders = { "x-dev-platform-admin": "true" };

function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
}

function levels() {
  return ["basic", "intermediate", "proficient", "advanced", "reference"].map((code, index) => ({
    number: index + 1,
    code,
    displayName: code,
    description: `${code} description`,
    observableEvidences: []
  }));
}

function competencyInput(suffix: string) {
  return {
    code: `JOB-CMP-${suffix}`,
    name: `Job competency ${suffix}`,
    category: "technical",
    definition: `Definition ${suffix}`,
    positiveEvidences: [{ text: "Observed behavior", displayOrder: 0 }],
    negativeEvidences: [{ text: "Missing behavior", displayOrder: 0 }],
    practicalExamples: [{ text: "Practical example", displayOrder: 0 }],
    proficiencyLevels: levels(),
    status: "active"
  };
}

function jobInput(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    code: `JOB-${suffix}`,
    name: `Job ${suffix}`,
    ...overrides
  };
}

function draftInput(competencyCatalogItemId: string, overrides: Record<string, unknown> = {}) {
  return {
    title: "Software Engineer",
    mission: "Build reliable product capabilities.",
    summary: "Owns implementation work with clear delivery quality.",
    responsibilities: [{ text: "Deliver tested increments", displayOrder: 0 }],
    requirements: [],
    education: { level: "not_required", area: "", required: false, note: "" },
    certifications: [],
    languages: [],
    tools: [],
    workModel: "remote",
    workSchedule: { weeklyHours: 40, description: "Full time", shift: "day" },
    travelRequirement: "none",
    salaryRange: { min: 1000, max: 2000, currency: "USD", periodicity: "monthly" },
    notes: "",
    competencies: [
      {
        competencyCatalogItemId,
        expectedLevel: 3,
        required: true,
        displayOrder: 0
      }
    ],
    ...overrides
  };
}

async function createUser(app: ReturnType<typeof createServer>, emailPrefix: string) {
  const response = await request(app)
    .post("/api/dev/users")
    .set(platformHeaders)
    .send({ name: emailPrefix, email: `${unique(emailPrefix)}@example.com` })
    .expect(201);

  return response.body as { id: string; email: string };
}

async function createOrganization(app: ReturnType<typeof createServer>, ownerId: string) {
  const slug = unique("job-org");
  const response = await request(app)
    .post("/api/organizations")
    .set(platformHeaders)
    .send({ name: `Organization ${slug}`, slug, initialOwnerUserId: ownerId })
    .expect(201);

  return response.body as {
    organization: { id: string };
    membership: { id: string };
  };
}

async function addMembership(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  userId: string,
  role: "admin" | "member" | "owner"
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/memberships`)
    .set({ "x-dev-user-id": ownerId })
    .send({ userId, role })
    .expect(201);

  return response.body as { id: string };
}

async function createCatalogItem(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string
) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const global = await request(app)
    .post("/api/platform/competencies/global")
    .set(platformHeaders)
    .send(competencyInput(suffix))
    .expect(201);

  const adoption = await request(app)
    .post(`/api/organizations/${organizationId}/competencies/adoptions`)
    .set({ "x-dev-user-id": ownerId })
    .send({ globalCompetencyId: global.body.id })
    .expect(201);

  return {
    ...adoption.body.catalogItem,
    adoptionId: adoption.body.adoption.id
  } as { id: string; globalCompetencyId: string; adoptionId: string };
}

function createApp(database: PostgresTestDatabase, jobProfiles = createPostgresJobProfileService) {
  return createServer(
    createCoreService(new PostgresCoreRepository(database.pool)),
    createPostgresDnaService(database.pool),
    createPostgresOrganizationalUnitService(database.pool),
    createPostgresCompetencyService(database.pool),
    jobProfiles(database.pool)
  );
}

describe("phase 5 job profiles API", () => {
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

  it("creates job profiles with normalized code, role rules and no cross-organization leakage", async () => {
    const ownerA = await createUser(app, "owner-a-job");
    const ownerB = await createUser(app, "owner-b-job");
    const admin = await createUser(app, "admin-job");
    const member = await createUser(app, "member-job");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    await addMembership(app, orgA.organization.id, ownerA.id, admin.id, "admin");
    await addMembership(app, orgA.organization.id, ownerA.id, member.id, "member");

    const profile = await request(app)
      .post(`/api/organizations/${orgA.organization.id}/job-profiles`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(jobInput("CORE", { code: " Role-One " }))
      .expect(201);

    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/job-profiles`)
      .set({ "x-dev-user-id": admin.id })
      .send(jobInput("ADMIN"))
      .expect(201);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/job-profiles`)
      .set({ "x-dev-user-id": member.id })
      .send(jobInput("MEMBER"))
      .expect(403);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/job-profiles`)
      .set(platformHeaders)
      .send(jobInput("PLATFORM"))
      .expect(403);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/job-profiles`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(jobInput("DUP", { code: "role-one" }))
      .expect(409);
    await request(app)
      .post(`/api/organizations/${orgB.organization.id}/job-profiles`)
      .set({ "x-dev-user-id": ownerB.id })
      .send(jobInput("B", { code: "ROLE-ONE" }))
      .expect(201);

    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/job-profiles/${profile.body.id}`)
      .set({ "x-dev-user-id": admin.id })
      .send({ code: "ADMIN-CODE" })
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/job-profiles/${profile.body.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ code: "OWNER-CODE" })
      .expect(200);
    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/job-profiles/${profile.body.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ organizationId: orgB.organization.id })
      .expect(400);
    await request(app)
      .get(`/api/organizations/${orgB.organization.id}/job-profiles/${profile.body.id}`)
      .set({ "x-dev-user-id": ownerB.id })
      .expect(404);
  });

  it("versions drafts, publishes transactionally and redacts salary for members", async () => {
    const owner = await createUser(app, "owner-version");
    const admin = await createUser(app, "admin-version");
    const member = await createUser(app, "member-version");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, admin.id, "admin");
    await addMembership(app, organization.id, owner.id, member.id, "member");
    const catalogItem = await createCatalogItem(app, organization.id, owner.id);
    const profile = await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles`)
      .set({ "x-dev-user-id": owner.id })
      .send(jobInput("VERSION"))
      .expect(201);

    const draft = await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/drafts`)
      .set({ "x-dev-user-id": admin.id })
      .send({})
      .expect(201);
    await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send({})
      .expect(409);
    await request(app)
      .patch(
        `/api/organizations/${organization.id}/job-profiles/${profile.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": admin.id })
      .send(draftInput(catalogItem.id))
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${organization.id}/job-profiles/${profile.body.id}/drafts/${draft.body.id}/publish`
      )
      .set({ "x-dev-user-id": admin.id })
      .expect(403);
    const published = await request(app)
      .post(
        `/api/organizations/${organization.id}/job-profiles/${profile.body.id}/drafts/${draft.body.id}/publish`
      )
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    expect(published.body.versionNumber).toBe(1);
    expect(published.body.status).toBe("published");
    expect(published.body.competencies[0].competencyCatalogItemId).toBe(catalogItem.id);
    expect(JSON.stringify(published.body)).not.toContain(catalogItem.globalCompetencyId);

    await request(app)
      .get(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/published`)
      .set({ "x-dev-user-id": member.id })
      .expect(200)
      .expect((response) => {
        expect(response.body.salaryRange).toBeNull();
      });
    await request(app)
      .get(
        `/api/organizations/${organization.id}/job-profiles/${profile.body.id}/versions/${published.body.id}`
      )
      .set({ "x-dev-user-id": member.id })
      .expect(200)
      .expect((response) => {
        expect(response.body.salaryRange).toBeNull();
      });
    await request(app)
      .get(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/draft`)
      .set({ "x-dev-user-id": member.id })
      .expect(403);
    await request(app)
      .get(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/versions`)
      .set({ "x-dev-user-id": member.id })
      .expect(403);
    await request(app)
      .get(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/history`)
      .set({ "x-dev-user-id": member.id })
      .expect(403);

    const audit = await request(app).get("/api/audit-events").set(platformHeaders).expect(200);
    expect(JSON.stringify(audit.body)).not.toContain("salaryRange");
    expect(JSON.stringify(audit.body)).not.toContain("1000");
  });

  it("archives the previous publication, blocks mutation in PostgreSQL and never physically deletes", async () => {
    const owner = await createUser(app, "owner-immutable");
    const { organization } = await createOrganization(app, owner.id);
    const catalogItem = await createCatalogItem(app, organization.id, owner.id);
    const profile = await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles`)
      .set({ "x-dev-user-id": owner.id })
      .send(jobInput("IMMUTABLE"))
      .expect(201);

    const first = await createAndPublish(
      app,
      organization.id,
      owner.id,
      profile.body.id,
      catalogItem.id
    );
    const secondDraft = await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send({})
      .expect(201);
    await request(app)
      .patch(
        `/api/organizations/${organization.id}/job-profiles/${profile.body.id}/drafts/${secondDraft.body.id}`
      )
      .set({ "x-dev-user-id": owner.id })
      .send(draftInput(catalogItem.id, { summary: "Second publication" }))
      .expect(200);
    const second = await request(app)
      .post(
        `/api/organizations/${organization.id}/job-profiles/${profile.body.id}/drafts/${secondDraft.body.id}/publish`
      )
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    const versions = await request(app)
      .get(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/versions`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    expect(versions.body.map((version: { status: string }) => version.status)).toEqual(
      expect.arrayContaining(["published", "archived"])
    );
    await expect(
      database.pool.query("UPDATE job_profile_versions SET title = 'Changed' WHERE id = $1", [
        first.id
      ])
    ).rejects.toThrow();
    await expect(
      database.pool.query("UPDATE job_profile_versions SET title = 'Changed' WHERE id = $1", [
        second.body.id
      ])
    ).rejects.toThrow();
    await expect(
      database.pool.query(
        "DELETE FROM job_profile_version_competencies WHERE job_profile_version_id = $1",
        [first.id]
      )
    ).rejects.toThrow();
    await expect(
      countRows("job_profile_versions", "job_profile_id = $1", [profile.body.id])
    ).resolves.toBe(2);
  });

  it("rejects invalid competencies, direct source IDs, duplicate links, weight and cross-organization catalog items", async () => {
    const ownerA = await createUser(app, "owner-a-cmp-job");
    const ownerB = await createUser(app, "owner-b-cmp-job");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    const catalogA = await createCatalogItem(app, orgA.organization.id, ownerA.id);
    const catalogB = await createCatalogItem(app, orgB.organization.id, ownerB.id);
    const profile = await request(app)
      .post(`/api/organizations/${orgA.organization.id}/job-profiles`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(jobInput("COMPETENCY"))
      .expect(201);
    const draft = await request(app)
      .post(`/api/organizations/${orgA.organization.id}/job-profiles/${profile.body.id}/drafts`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({})
      .expect(201);

    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-profiles/${profile.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send(draftInput(catalogB.id))
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-profiles/${profile.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send(
        draftInput(catalogA.id, {
          competencies: [
            {
              competencyCatalogItemId: catalogA.id,
              expectedLevel: 3,
              required: true,
              displayOrder: 0
            },
            {
              competencyCatalogItemId: catalogA.id,
              expectedLevel: 4,
              required: true,
              displayOrder: 1
            }
          ]
        })
      )
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-profiles/${profile.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send(
        draftInput(catalogA.id, {
          competencies: [
            {
              competencyCatalogItemId: catalogA.id,
              expectedLevel: 6,
              required: true,
              displayOrder: 0
            }
          ]
        })
      )
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-profiles/${profile.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send(
        draftInput(catalogA.id, {
          competencies: [
            {
              competencyCatalogItemId: catalogA.globalCompetencyId,
              expectedLevel: 3,
              required: true,
              displayOrder: 0
            }
          ]
        })
      )
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-profiles/${profile.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send(draftInput(catalogA.id, { weight: 10 }))
      .expect(400);
    await request(app)
      .post(
        `/api/organizations/${orgA.organization.id}/competencies/adoptions/${catalogA.adoptionId}/inactivate`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .expect(200);
    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-profiles/${profile.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send(draftInput(catalogA.id))
      .expect(400);
  });

  it("rejects invalid salary, malformed structured fields and version ids from another job profile", async () => {
    const owner = await createUser(app, "owner-validation-job");
    const { organization } = await createOrganization(app, owner.id);
    const catalogItem = await createCatalogItem(app, organization.id, owner.id);
    const firstProfile = await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles`)
      .set({ "x-dev-user-id": owner.id })
      .send(jobInput("VALIDATION-A"))
      .expect(201);
    const secondProfile = await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles`)
      .set({ "x-dev-user-id": owner.id })
      .send(jobInput("VALIDATION-B"))
      .expect(201);
    const firstDraft = await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles/${firstProfile.body.id}/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send({})
      .expect(201);
    const secondDraft = await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles/${secondProfile.body.id}/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send({})
      .expect(201);

    for (const salaryRange of [
      { min: -1, max: 2000, currency: "USD", periodicity: "monthly" },
      { min: 3000, max: 2000, currency: "USD", periodicity: "monthly" },
      { min: 1000, max: 2000, currency: "US", periodicity: "monthly" },
      { min: 1000, max: 2000, currency: "USD", periodicity: "weekly" }
    ]) {
      await request(app)
        .patch(
          `/api/organizations/${organization.id}/job-profiles/${firstProfile.body.id}/drafts/${firstDraft.body.id}`
        )
        .set({ "x-dev-user-id": owner.id })
        .send(draftInput(catalogItem.id, { salaryRange }))
        .expect(400);
    }

    await request(app)
      .patch(
        `/api/organizations/${organization.id}/job-profiles/${firstProfile.body.id}/drafts/${firstDraft.body.id}`
      )
      .set({ "x-dev-user-id": owner.id })
      .send(draftInput(catalogItem.id, { requirements: [{ text: "missing type" }] }))
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${organization.id}/job-profiles/${firstProfile.body.id}/drafts/${firstDraft.body.id}`
      )
      .set({ "x-dev-user-id": owner.id })
      .send(draftInput(catalogItem.id, { education: { level: "invalid" } }))
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${organization.id}/job-profiles/${firstProfile.body.id}/drafts/${firstDraft.body.id}`
      )
      .set({ "x-dev-user-id": owner.id })
      .send(
        draftInput(catalogItem.id, {
          languages: [{ language: "en", expectedLevel: "bad", required: true }]
        })
      )
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${organization.id}/job-profiles/${firstProfile.body.id}/drafts/${firstDraft.body.id}`
      )
      .set({ "x-dev-user-id": owner.id })
      .send(
        draftInput(catalogItem.id, {
          tools: [{ name: "SQL", expectedLevel: "bad", required: true }]
        })
      )
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${organization.id}/job-profiles/${firstProfile.body.id}/drafts/${firstDraft.body.id}`
      )
      .set({ "x-dev-user-id": owner.id })
      .send(draftInput(catalogItem.id, { workModel: "nomad" }))
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${organization.id}/job-profiles/${firstProfile.body.id}/drafts/${secondDraft.body.id}`
      )
      .set({ "x-dev-user-id": owner.id })
      .send(draftInput(catalogItem.id))
      .expect(404);
  });

  it("denies inactive users, inactive memberships, archived organizations and Platform Admin operations", async () => {
    const owner = await createUser(app, "owner-auth-job");
    const admin = await createUser(app, "admin-auth-job");
    const member = await createUser(app, "member-auth-job");
    const inactive = await createUser(app, "inactive-auth-job");
    const stranger = await createUser(app, "stranger-auth-job");
    const { organization } = await createOrganization(app, owner.id);
    const adminMembership = await addMembership(app, organization.id, owner.id, admin.id, "admin");
    await addMembership(app, organization.id, owner.id, member.id, "member");
    const profile = await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles`)
      .set({ "x-dev-user-id": owner.id })
      .send(jobInput("AUTH"))
      .expect(201);

    await request(app)
      .get(`/api/organizations/${organization.id}/job-profiles`)
      .set({ "x-dev-user-id": stranger.id })
      .expect(403);
    await database.pool.query("UPDATE users SET status = 'inactive' WHERE id = $1", [inactive.id]);
    await request(app)
      .get(`/api/organizations/${organization.id}/job-profiles`)
      .set({ "x-dev-user-id": inactive.id })
      .expect(403);
    await request(app)
      .patch(`/api/memberships/${adminMembership.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({ status: "inactive" })
      .expect(200);
    await request(app)
      .patch(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}`)
      .set({ "x-dev-user-id": admin.id })
      .send({ name: "Denied" })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/drafts`)
      .set(platformHeaders)
      .send({})
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}`)
      .set(platformHeaders)
      .send({ name: "Denied" })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/activate`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/inactivate`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .post(`/api/platform/organizations/${organization.id}/job-profiles/admin-read`)
      .set(platformHeaders)
      .send({})
      .expect(400);
    await request(app)
      .post(`/api/platform/organizations/${organization.id}/job-profiles/admin-read`)
      .set(platformHeaders)
      .send({ reason: "support review" })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/archive`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .get(`/api/organizations/${organization.id}/job-profiles`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);

    const audit = await request(app).get("/api/audit-events").set(platformHeaders).expect(200);
    expect(audit.body.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining(["job_profile.permission_denied", "job_profile.administrative_read"])
    );
    expect(JSON.stringify(audit.body)).not.toContain("Authorization");
  });

  it("serializes concurrent create and publish, rolls back on audit failure and persists after recreation", async () => {
    const owner = await createUser(app, "owner-concurrent-job");
    const { organization } = await createOrganization(app, owner.id);
    const catalogItem = await createCatalogItem(app, organization.id, owner.id);

    const createResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/job-profiles`)
        .set({ "x-dev-user-id": owner.id })
        .send(jobInput("CONCURRENT-A", { code: "CONCURRENT-JOB" })),
      request(app)
        .post(`/api/organizations/${organization.id}/job-profiles`)
        .set({ "x-dev-user-id": owner.id })
        .send(jobInput("CONCURRENT-B", { code: "concurrent-job" }))
    ]);
    expect(createResults.map((result) => result.status).sort()).toEqual([201, 409]);

    const profile = await request(app)
      .post(`/api/organizations/${organization.id}/job-profiles`)
      .set({ "x-dev-user-id": owner.id })
      .send(jobInput("PUBLISH-RACE"))
      .expect(201);
    const draftResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/drafts`)
        .set({ "x-dev-user-id": owner.id })
        .send(draftInput(catalogItem.id)),
      request(app)
        .post(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/drafts`)
        .set({ "x-dev-user-id": owner.id })
        .send(draftInput(catalogItem.id))
    ]);
    expect(draftResults.map((result) => result.status).sort()).toEqual([201, 409]);
    await expect(
      countRows(
        "job_profile_versions",
        "job_profile_id = $1 AND status = 'draft' AND discarded_at IS NULL",
        [profile.body.id]
      )
    ).resolves.toBe(1);
    const draft = draftResults.find((result) => result.status === 201);
    expect(draft).toBeDefined();
    const publishResults = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${organization.id}/job-profiles/${profile.body.id}/drafts/${draft?.body.id}/publish`
        )
        .set({ "x-dev-user-id": owner.id }),
      request(app)
        .post(
          `/api/organizations/${organization.id}/job-profiles/${profile.body.id}/drafts/${draft?.body.id}/publish`
        )
        .set({ "x-dev-user-id": owner.id })
    ]);
    expect(publishResults.map((result) => result.status).sort()).toEqual([200, 409]);
    await expect(
      countRows("job_profile_versions", "job_profile_id = $1 AND status = 'published'", [
        profile.body.id
      ])
    ).resolves.toBe(1);

    const failingApp = createApp(database, createFailingAuditJobProfileService);
    await request(failingApp)
      .post(`/api/organizations/${organization.id}/job-profiles`)
      .set({ "x-dev-user-id": owner.id })
      .send(jobInput("ROLLBACK"))
      .expect(500);
    await expect(
      countRows("job_profiles", "organization_id = $1 AND normalized_code = $2", [
        organization.id,
        "job-rollback"
      ])
    ).resolves.toBe(0);

    const recreated = createApp(database);
    await request(recreated)
      .get(`/api/organizations/${organization.id}/job-profiles/${profile.body.id}/published`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
  });

  async function createAndPublish(
    targetApp: ReturnType<typeof createServer>,
    organizationId: string,
    ownerId: string,
    jobProfileId: string,
    competencyCatalogItemId: string
  ) {
    const draft = await request(targetApp)
      .post(`/api/organizations/${organizationId}/job-profiles/${jobProfileId}/drafts`)
      .set({ "x-dev-user-id": ownerId })
      .send(draftInput(competencyCatalogItemId))
      .expect(201);

    const response = await request(targetApp)
      .post(
        `/api/organizations/${organizationId}/job-profiles/${jobProfileId}/drafts/${draft.body.id}/publish`
      )
      .set({ "x-dev-user-id": ownerId })
      .expect(200);

    return response.body as { id: string };
  }

  async function countRows(table: string, where: string, values: unknown[]) {
    const result = await database.pool.query(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${where}`,
      values
    );
    return Number(result.rows[0]?.count ?? 0);
  }
});

function createFailingAuditJobProfileService(pool: pg.Pool) {
  const runTransaction = async <T>(
    callback: (transaction: {
      core: PostgresCoreRepository;
      jobProfiles: JobProfileRepository;
      competencies: CompetencyRepository;
    }) => Promise<T>
  ) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new FailingAuditCoreRepository(client, true),
        jobProfiles: new PostgresJobProfileRepository(client),
        competencies: new PostgresCompetencyRepository(client)
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

  return new JobProfileService(
    new PostgresCoreRepository(pool),
    new PostgresJobProfileRepository(pool),
    new PostgresCompetencyRepository(pool),
    runTransaction
  );
}

class FailingAuditCoreRepository extends PostgresCoreRepository {
  override async addAuditEvent(event: AuditEvent) {
    void event;
    throw new Error("Injected audit failure.");
  }
}
