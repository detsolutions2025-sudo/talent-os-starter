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
  createPostgresJobOpeningService,
  JobOpeningService
} from "../../src/server/job-openings/service";
import type { JobOpeningRepository } from "../../src/server/job-openings/repository";
import { createPostgresJobProfileService } from "../../src/server/job-profiles/service";
import type { JobProfileRepository } from "../../src/server/job-profiles/repository";
import { createPostgresOrganizationalUnitService } from "../../src/server/organizational-units/service";
import type { OrganizationalUnitRepository } from "../../src/server/organizational-units/repository";
import { PostgresCompetencyRepository } from "../../src/server/persistence/postgres-competency-repository";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { PostgresJobOpeningRepository } from "../../src/server/persistence/postgres-job-opening-repository";
import { PostgresJobProfileRepository } from "../../src/server/persistence/postgres-job-profile-repository";
import { PostgresOrganizationalUnitRepository } from "../../src/server/persistence/postgres-organizational-unit-repository";
import { PostgresQuestionRepository } from "../../src/server/persistence/postgres-question-repository";
import { createPostgresQuestionService } from "../../src/server/questions/service";
import type { QuestionRepository } from "../../src/server/questions/repository";
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
  const slug = unique("open-org");
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
  return request(app)
    .post(`/api/organizations/${organizationId}/memberships`)
    .set({ "x-dev-user-id": ownerId })
    .send({ userId, role })
    .expect(201);
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

async function createCompetencyCatalogItem(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  const competency = await request(app)
    .post(`/api/organizations/${organizationId}/competencies`)
    .set({ "x-dev-user-id": ownerId })
    .send({
      code: `OPEN-CMP-${suffix}`,
      name: `Opening competency ${suffix}`,
      category: "technical",
      definition: "Definition",
      positiveEvidences: [{ text: "Yes", displayOrder: 0 }],
      negativeEvidences: [{ text: "No", displayOrder: 0 }],
      practicalExamples: [{ text: "Example", displayOrder: 0 }],
      proficiencyLevels: levels(),
      status: "active"
    })
    .expect(201);
  const catalog = await request(app)
    .get(`/api/organizations/${organizationId}/competencies/catalog`)
    .set({ "x-dev-user-id": ownerId })
    .expect(200);
  const catalogItem = catalog.body[0] as { competencyCatalogItemId: string };
  return { ...catalogItem, organizationCompetencyId: competency.body.id as string };
}

async function createQuestionCatalogItem(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  const question = await request(app)
    .post(`/api/organizations/${organizationId}/questions`)
    .set({ "x-dev-user-id": ownerId })
    .send({
      code: `OPEN-Q-${suffix}`,
      title: `Question ${suffix}`,
      questionText: "Tell us something.",
      type: "open_text",
      category: "general",
      description: "",
      instructions: "",
      options: [],
      settings: {},
      status: "active"
    })
    .expect(201);
  const catalog = await request(app)
    .get(`/api/organizations/${organizationId}/questions/catalog`)
    .set({ "x-dev-user-id": ownerId })
    .expect(200);
  const catalogItem = catalog.body[0] as { questionCatalogItemId: string };
  return { ...catalogItem, organizationQuestionId: question.body.id as string };
}

async function createUnit(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/organizational-units`)
    .set({ "x-dev-user-id": ownerId })
    .send({
      code: `OPEN-OU-${suffix}`,
      name: `Opening Unit ${suffix}`,
      type: "department",
      displayOrder: 0
    })
    .expect(201);
  return response.body as { id: string };
}

async function createPublishedJobProfileVersion(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  const competency = await createCompetencyCatalogItem(
    app,
    organizationId,
    ownerId,
    `JOB-${suffix}`
  );
  const profile = await request(app)
    .post(`/api/organizations/${organizationId}/job-profiles`)
    .set({ "x-dev-user-id": ownerId })
    .send({ code: `OPEN-JOB-${suffix}`, name: `Job ${suffix}` })
    .expect(201);
  const draft = await request(app)
    .post(`/api/organizations/${organizationId}/job-profiles/${profile.body.id}/drafts`)
    .set({ "x-dev-user-id": ownerId })
    .send({
      title: `Job ${suffix}`,
      mission: "Mission",
      summary: "Summary",
      responsibilities: [{ text: "Do work", displayOrder: 0 }],
      requirements: [],
      education: { level: "not_required", area: "", required: false, note: "" },
      certifications: [],
      languages: [],
      tools: [],
      workModel: "remote",
      workSchedule: { weeklyHours: 40, description: "Full", shift: "day" },
      travelRequirement: "none",
      salaryRange: { min: 1000, max: 2000, currency: "USD", periodicity: "monthly" },
      notes: "",
      competencies: [
        {
          competencyCatalogItemId: competency.competencyCatalogItemId,
          expectedLevel: 3,
          required: true,
          displayOrder: 0
        }
      ]
    })
    .expect(201);
  const published = await request(app)
    .post(
      `/api/organizations/${organizationId}/job-profiles/${profile.body.id}/drafts/${draft.body.id}/publish`
    )
    .set({ "x-dev-user-id": ownerId })
    .expect(200);
  return published.body as { id: string };
}

function openingInput(
  jobProfileVersionId: string,
  suffix: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    code: `OPEN-${suffix}`,
    title: `Internal ${suffix}`,
    publicTitle: `Public ${suffix}`,
    positionsCount: 2,
    jobProfileVersionId,
    ...overrides
  };
}

function draftPayload(
  jobProfileVersionId: string,
  competencyCatalogItemId: string,
  questionCatalogItemId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    jobProfileVersionId,
    publicTitle: "Public opening",
    description: "Description",
    responsibilities: [{ text: "Deliver", displayOrder: 0 }],
    requirements: [],
    benefits: [],
    location: { country: "BR", region: "SP", city: "Sao Paulo", publicAddress: "", note: "" },
    workModel: "remote",
    workSchedule: { weeklyHours: 40, description: "Full", shift: "day" },
    salaryRange: { min: 3000, max: 5000, currency: "USD", periodicity: "monthly" },
    positionsCount: 3,
    internalInstructions: "Internal only",
    publicInstructions: "Public info",
    competencies: [
      {
        competencyCatalogItemId,
        expectedLevel: 3,
        required: true,
        weight: 100,
        displayOrder: 0
      }
    ],
    questions: [{ questionCatalogItemId, required: true, displayOrder: 0, weight: 20 }],
    ...overrides
  };
}

function createApp(database: PostgresTestDatabase, service = createPostgresJobOpeningService) {
  return createServer(
    createCoreService(new PostgresCoreRepository(database.pool)),
    createPostgresDnaService(database.pool),
    createPostgresOrganizationalUnitService(database.pool),
    createPostgresCompetencyService(database.pool),
    createPostgresJobProfileService(database.pool),
    createPostgresQuestionService(database.pool),
    service(database.pool)
  );
}

describe("phase 7 job openings API", () => {
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

  it("creates openings with positions only on versions and publishes/open separately", async () => {
    const owner = await createUser(app, "owner-open");
    const admin = await createUser(app, "admin-open");
    const member = await createUser(app, "member-open");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, admin.id, "admin");
    await addMembership(app, organization.id, owner.id, member.id, "member");
    const jobProfileVersion = await createPublishedJobProfileVersion(
      app,
      organization.id,
      owner.id,
      "A"
    );
    const competency = await createCompetencyCatalogItem(app, organization.id, owner.id, "A");
    const question = await createQuestionCatalogItem(app, organization.id, owner.id, "A");

    const opening = await request(app)
      .post(`/api/organizations/${organization.id}/job-openings`)
      .set({ "x-dev-user-id": admin.id })
      .send(openingInput(jobProfileVersion.id, "A", { code: "Case-Code" }))
      .expect(201);
    expect(opening.body.status).toBe("draft");
    expect(opening.body.positionsCount).toBeUndefined();
    expect(opening.body.publishedVersion).toBeNull();

    await expect(database.pool.query("SELECT positions_count FROM job_openings")).rejects.toThrow();

    await request(app)
      .patch(`/api/organizations/${organization.id}/job-openings/${opening.body.id}`)
      .set({ "x-dev-user-id": admin.id })
      .send({ code: "ADMIN-CODE" })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/job-openings/${opening.body.id}/open`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/job-openings`)
      .set(platformHeaders)
      .send(openingInput(jobProfileVersion.id, "PLATFORM"))
      .expect(403);

    const draft = await request(app)
      .get(`/api/organizations/${organization.id}/job-openings/${opening.body.id}/draft`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .patch(
        `/api/organizations/${organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": owner.id })
      .send(
        draftPayload(
          jobProfileVersion.id,
          competency.competencyCatalogItemId,
          question.questionCatalogItemId
        )
      )
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}/publish`
      )
      .set({ "x-dev-user-id": admin.id })
      .expect(403);
    const published = await request(app)
      .post(
        `/api/organizations/${organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}/publish`
      )
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    expect(published.body.versionNumber).toBe(1);
    expect(published.body.jobProfileVersionId).toBe(jobProfileVersion.id);

    await request(app)
      .post(`/api/organizations/${organization.id}/job-openings/${opening.body.id}/open`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/job-openings/${opening.body.id}/cancel`)
      .set({ "x-dev-user-id": admin.id })
      .expect(403);
    await request(app)
      .get(`/api/organizations/${organization.id}/job-openings/${opening.body.id}`)
      .set({ "x-dev-user-id": member.id })
      .expect(200)
      .expect((response) => {
        expect(response.body.publishedVersion.salaryRange).toBeNull();
        expect(response.body.publishedVersion.internalInstructions).toBe("");
      });
  });

  it("validates competencies, questions, limits and same Organization", async () => {
    const ownerA = await createUser(app, "owner-open-a");
    const ownerB = await createUser(app, "owner-open-b");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    const jobA = await createPublishedJobProfileVersion(app, orgA.organization.id, ownerA.id, "B");
    const jobB = await createPublishedJobProfileVersion(app, orgB.organization.id, ownerB.id, "B");
    const unitB = await createUnit(app, orgB.organization.id, ownerB.id, "B");
    const competencyA = await createCompetencyCatalogItem(
      app,
      orgA.organization.id,
      ownerA.id,
      "B"
    );
    const competencyB = await createCompetencyCatalogItem(
      app,
      orgB.organization.id,
      ownerB.id,
      "B"
    );
    const questionA = await createQuestionCatalogItem(app, orgA.organization.id, ownerA.id, "B");
    const questionB = await createQuestionCatalogItem(app, orgB.organization.id, ownerB.id, "B");

    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/job-openings`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(openingInput(jobB.id, "CROSS"))
      .expect(400);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/job-openings`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(openingInput(jobA.id, "CROSS-UNIT", { organizationalUnitId: unitB.id }))
      .expect(400);
    const opening = await request(app)
      .post(`/api/organizations/${orgA.organization.id}/job-openings`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(openingInput(jobA.id, "VALID"))
      .expect(201);
    const otherOpening = await request(app)
      .post(`/api/organizations/${orgA.organization.id}/job-openings`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(openingInput(jobA.id, "OTHER"))
      .expect(201);
    const draft = await request(app)
      .get(`/api/organizations/${orgA.organization.id}/job-openings/${opening.body.id}/draft`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(200);
    const otherDraft = await request(app)
      .get(`/api/organizations/${orgA.organization.id}/job-openings/${otherOpening.body.id}/draft`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(200);

    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-openings/${opening.body.id}/drafts/${otherDraft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send(
        draftPayload(jobA.id, competencyA.competencyCatalogItemId, questionA.questionCatalogItemId)
      )
      .expect(404);

    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send(
        draftPayload(jobA.id, competencyB.competencyCatalogItemId, questionA.questionCatalogItemId)
      )
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send(
        draftPayload(
          jobA.id,
          competencyA.competencyCatalogItemId,
          questionA.questionCatalogItemId,
          { competencies: [{ competencyCatalogItemId: competencyA.competencyCatalogItemId }] }
        )
      )
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send(
        draftPayload(
          jobA.id,
          competencyA.competencyCatalogItemId,
          questionA.questionCatalogItemId,
          {
            competencies: [
              {
                competencyCatalogItemId: competencyA.competencyCatalogItemId,
                expectedLevel: 3,
                required: true,
                weight: 90,
                displayOrder: 0
              }
            ]
          }
        )
      )
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${orgA.organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}/publish`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send(
        draftPayload(jobA.id, competencyA.competencyCatalogItemId, questionB.questionCatalogItemId)
      )
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send(
        draftPayload(
          jobA.id,
          competencyA.competencyCatalogItemId,
          questionA.questionCatalogItemId,
          { competencies: [] }
        )
      )
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${orgA.organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}/publish`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .expect(200);

    const manyQuestions = Array.from({ length: 101 }, (_, index) => ({
      questionCatalogItemId: `${questionA.questionCatalogItemId}-${index}`,
      required: true,
      displayOrder: index,
      weight: 1
    }));
    const manyCompetencies = Array.from({ length: 51 }, (_, index) => ({
      competencyCatalogItemId: `${competencyA.competencyCatalogItemId}-${index}`,
      expectedLevel: 3,
      required: true,
      weight: 1,
      displayOrder: index
    }));
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/job-openings/${opening.body.id}/drafts`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(201);
    const nextDraft = await request(app)
      .get(`/api/organizations/${orgA.organization.id}/job-openings/${opening.body.id}/draft`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(200);
    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-openings/${opening.body.id}/drafts/${nextDraft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send({ questions: manyQuestions })
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${orgA.organization.id}/job-openings/${opening.body.id}/drafts/${nextDraft.body.id}`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send({ competencies: manyCompetencies })
      .expect(400);
  }, 30000);

  it("handles public slug, deadline availability, final states and no salary leak", async () => {
    const owner = await createUser(app, "owner-public");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedJobProfileVersion(app, organization.id, owner.id, "PUB");
    const opening = await createPublishedOpenOpening(app, organization.id, owner.id, job.id, "PUB");
    const futureDeadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const slug = `public-${crypto.randomUUID().slice(0, 8)}`;

    await request(app)
      .patch(`/api/organizations/${organization.id}/job-openings/${opening.id}/publication`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        isPublic: true,
        publicSlug: slug,
        applicationDeadline: futureDeadline,
        showSalary: false
      })
      .expect(200);
    await request(app)
      .get(`/api/public/job-openings/${slug}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.isPubliclyAvailable).toBe(true);
        expect(response.body.salaryRange).toBeNull();
        expect(JSON.stringify(response.body)).not.toContain("Internal only");
      });
    await request(app)
      .patch(`/api/organizations/${organization.id}/job-openings/${opening.id}/publication`)
      .set({ "x-dev-user-id": owner.id })
      .send({ isPublic: true, publicSlug: `${slug}-changed`, applicationDeadline: futureDeadline })
      .expect(409);
    await database.pool.query(
      "UPDATE job_openings SET application_deadline = NOW() - INTERVAL '1 hour' WHERE id = $1",
      [opening.id]
    );
    await request(app)
      .get(`/api/public/job-openings/${slug}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.isPubliclyAvailable).toBe(false);
      });
    const current = await request(app)
      .get(`/api/organizations/${organization.id}/job-openings/${opening.id}`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    expect(current.body.status).toBe("open");
    await request(app)
      .post(`/api/organizations/${organization.id}/job-openings/${opening.id}/close`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/job-openings/${opening.id}/open`)
      .set({ "x-dev-user-id": owner.id })
      .expect(409);
  });

  it("keeps public slugs reserved and removes archived Organizations from public exposure", async () => {
    const owner = await createUser(app, "owner-public-archive");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedJobProfileVersion(app, organization.id, owner.id, "ARCH");
    const firstOpening = await createPublishedOpenOpening(
      app,
      organization.id,
      owner.id,
      job.id,
      "ARCH-A"
    );
    const slug = `reserved-${crypto.randomUUID().slice(0, 8)}`;
    const futureDeadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await request(app)
      .patch(`/api/organizations/${organization.id}/job-openings/${firstOpening.id}/publication`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        isPublic: true,
        publicSlug: slug,
        applicationDeadline: futureDeadline,
        showSalary: false
      })
      .expect(200);
    await request(app)
      .patch(`/api/organizations/${organization.id}/job-openings/${firstOpening.id}/publication`)
      .set({ "x-dev-user-id": owner.id })
      .send({ isPublic: false })
      .expect(200);

    const secondOpening = await createPublishedOpenOpening(
      app,
      organization.id,
      owner.id,
      job.id,
      "ARCH-B"
    );
    await request(app)
      .patch(`/api/organizations/${organization.id}/job-openings/${secondOpening.id}/publication`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        isPublic: true,
        publicSlug: slug,
        applicationDeadline: futureDeadline,
        showSalary: false
      })
      .expect(409);

    await request(app)
      .patch(`/api/organizations/${organization.id}/job-openings/${firstOpening.id}/publication`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        isPublic: true,
        publicSlug: slug,
        applicationDeadline: futureDeadline,
        showSalary: false
      })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/archive`)
      .set(platformHeaders)
      .expect(200);
    await request(app).get(`/api/public/job-openings/${slug}`).expect(404);
  });

  it("preserves published links but rejects new drafts after catalog items become inactive", async () => {
    const owner = await createUser(app, "owner-inactive-items");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedJobProfileVersion(app, organization.id, owner.id, "ITEM");
    const competency = await createCompetencyCatalogItem(app, organization.id, owner.id, "ITEM");
    const question = await createQuestionCatalogItem(app, organization.id, owner.id, "ITEM");
    const opening = await request(app)
      .post(`/api/organizations/${organization.id}/job-openings`)
      .set({ "x-dev-user-id": owner.id })
      .send(openingInput(job.id, "ITEM"))
      .expect(201);
    const draft = await request(app)
      .get(`/api/organizations/${organization.id}/job-openings/${opening.body.id}/draft`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    await request(app)
      .patch(
        `/api/organizations/${organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}`
      )
      .set({ "x-dev-user-id": owner.id })
      .send(
        draftPayload(job.id, competency.competencyCatalogItemId, question.questionCatalogItemId)
      )
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}/publish`
      )
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    await request(app)
      .post(
        `/api/organizations/${organization.id}/competencies/${competency.organizationCompetencyId}/inactivate`
      )
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${organization.id}/questions/${question.organizationQuestionId}/inactivate`
      )
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .get(`/api/organizations/${organization.id}/job-openings/${opening.body.id}/published`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200)
      .expect((response) => {
        expect(response.body.competencies).toHaveLength(1);
        expect(response.body.questions).toHaveLength(1);
      });
    await request(app)
      .post(`/api/organizations/${organization.id}/job-openings/${opening.body.id}/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .expect(400);
  });

  it("serializes concurrent publish, rolls back on audit failure and preserves immutability", async () => {
    const owner = await createUser(app, "owner-race");
    const { organization } = await createOrganization(app, owner.id);
    const job = await createPublishedJobProfileVersion(app, organization.id, owner.id, "RACE");
    const opening = await request(app)
      .post(`/api/organizations/${organization.id}/job-openings`)
      .set({ "x-dev-user-id": owner.id })
      .send(openingInput(job.id, "RACE"))
      .expect(201);
    const draft = await request(app)
      .get(`/api/organizations/${organization.id}/job-openings/${opening.body.id}/draft`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    const results = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}/publish`
        )
        .set({ "x-dev-user-id": owner.id }),
      request(app)
        .post(
          `/api/organizations/${organization.id}/job-openings/${opening.body.id}/drafts/${draft.body.id}/publish`
        )
        .set({ "x-dev-user-id": owner.id })
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    await expect(
      countRows("job_opening_versions", "job_opening_id = $1 AND status = 'published'", [
        opening.body.id
      ])
    ).resolves.toBe(1);
    const published = results.find((result) => result.status === 200);
    await expect(
      database.pool.query(
        "UPDATE job_opening_versions SET public_title = 'Changed' WHERE id = $1",
        [published?.body.id]
      )
    ).rejects.toThrow();

    const draftResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/job-openings/${opening.body.id}/drafts`)
        .set({ "x-dev-user-id": owner.id }),
      request(app)
        .post(`/api/organizations/${organization.id}/job-openings/${opening.body.id}/drafts`)
        .set({ "x-dev-user-id": owner.id })
    ]);
    expect(draftResults.map((result) => result.status).sort()).toEqual([201, 409]);
    await expect(
      countRows(
        "job_opening_versions",
        "job_opening_id = $1 AND status = 'draft' AND discarded_at IS NULL",
        [opening.body.id]
      )
    ).resolves.toBe(1);

    const failingApp = createApp(database, createFailingAuditJobOpeningService);
    await request(failingApp)
      .post(`/api/organizations/${organization.id}/job-openings`)
      .set({ "x-dev-user-id": owner.id })
      .send(openingInput(job.id, "ROLLBACK"))
      .expect(500);
    await expect(
      countRows("job_openings", "organization_id = $1 AND normalized_code = $2", [
        organization.id,
        "open-rollback"
      ])
    ).resolves.toBe(0);
  });

  async function createPublishedOpenOpening(
    targetApp: ReturnType<typeof createServer>,
    organizationId: string,
    ownerId: string,
    jobProfileVersionId: string,
    suffix: string
  ) {
    const opening = await request(targetApp)
      .post(`/api/organizations/${organizationId}/job-openings`)
      .set({ "x-dev-user-id": ownerId })
      .send(openingInput(jobProfileVersionId, suffix))
      .expect(201);
    const draft = await request(targetApp)
      .get(`/api/organizations/${organizationId}/job-openings/${opening.body.id}/draft`)
      .set({ "x-dev-user-id": ownerId })
      .expect(200);
    await request(targetApp)
      .post(
        `/api/organizations/${organizationId}/job-openings/${opening.body.id}/drafts/${draft.body.id}/publish`
      )
      .set({ "x-dev-user-id": ownerId })
      .expect(200);
    await request(targetApp)
      .post(`/api/organizations/${organizationId}/job-openings/${opening.body.id}/open`)
      .set({ "x-dev-user-id": ownerId })
      .expect(200);
    return opening.body as { id: string };
  }

  async function countRows(table: string, where: string, values: unknown[]) {
    const result = await database.pool.query(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${where}`,
      values
    );
    return Number(result.rows[0]?.count ?? 0);
  }
});

function createFailingAuditJobOpeningService(pool: pg.Pool) {
  const runTransaction = async <T>(
    callback: (transaction: {
      core: PostgresCoreRepository;
      openings: JobOpeningRepository;
      jobProfiles: JobProfileRepository;
      units: OrganizationalUnitRepository;
      competencies: CompetencyRepository;
      questions: QuestionRepository;
    }) => Promise<T>
  ) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new FailingAuditCoreRepository(client, true),
        openings: new PostgresJobOpeningRepository(client),
        jobProfiles: new PostgresJobProfileRepository(client),
        units: new PostgresOrganizationalUnitRepository(client),
        competencies: new PostgresCompetencyRepository(client),
        questions: new PostgresQuestionRepository(client)
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
  return new JobOpeningService(
    new PostgresCoreRepository(pool),
    new PostgresJobOpeningRepository(pool),
    new PostgresJobProfileRepository(pool),
    new PostgresOrganizationalUnitRepository(pool),
    new PostgresCompetencyRepository(pool),
    new PostgresQuestionRepository(pool),
    runTransaction
  );
}

class FailingAuditCoreRepository extends PostgresCoreRepository {
  override async addAuditEvent(event: AuditEvent) {
    void event;
    throw new Error("Injected audit failure.");
  }
}
