import request from "supertest";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/app";
import { createPostgresCompetencyService } from "../../src/server/competencies/service";
import type { CompetencyRepository } from "../../src/server/competencies/repository";
import { createCoreService } from "../../src/server/core/service";
import type { AuditEvent } from "../../src/server/core/types";
import { createPostgresDnaService } from "../../src/server/dna/service";
import { createPostgresJobProfileService } from "../../src/server/job-profiles/service";
import { createPostgresOrganizationalUnitService } from "../../src/server/organizational-units/service";
import { PostgresCompetencyRepository } from "../../src/server/persistence/postgres-competency-repository";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { PostgresQuestionRepository } from "../../src/server/persistence/postgres-question-repository";
import { QuestionService, createPostgresQuestionService } from "../../src/server/questions/service";
import type { QuestionRepository } from "../../src/server/questions/repository";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

const platformHeaders = { "x-dev-platform-admin": "true" };

function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
}

function questionInput(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    code: `Q-${suffix}`,
    title: `Question ${suffix}`,
    questionText: `Question text ${suffix}`,
    type: "open_text",
    category: "general",
    description: "",
    instructions: "",
    options: [],
    settings: {},
    status: "active",
    ...overrides
  };
}

function levels() {
  return [
    ["basic", "Basic"],
    ["intermediate", "Intermediate"],
    ["proficient", "Proficient"],
    ["advanced", "Advanced"],
    ["reference", "Reference"]
  ].map(([code, displayName], index) => ({
    number: index + 1,
    code,
    displayName,
    description: `${displayName} description`,
    observableEvidences: []
  }));
}

function competencyInput(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    code: `CMP-Q-${suffix}`,
    name: `Competency ${suffix}`,
    category: "technical",
    definition: `Definition ${suffix}`,
    positiveEvidences: [{ text: "Does the thing", displayOrder: 0 }],
    negativeEvidences: [{ text: "Does not do the thing", displayOrder: 0 }],
    practicalExamples: [{ text: "Practical context", displayOrder: 0 }],
    proficiencyLevels: levels(),
    status: "active",
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
  const slug = unique("q-org");
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

async function createGlobalQuestion(
  app: ReturnType<typeof createServer>,
  suffix: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await request(app)
    .post("/api/platform/questions/global")
    .set(platformHeaders)
    .send(questionInput(suffix, overrides))
    .expect(201);

  return response.body as { id: string; status: "active" | "inactive" | "deprecated" };
}

async function createOrganizationQuestion(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  userId: string,
  suffix: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/questions`)
    .set({ "x-dev-user-id": userId })
    .send(questionInput(suffix, overrides))
    .expect(201);

  return response.body as { id: string; code: string; status: "active" | "inactive" };
}

async function createCompetencyCatalogItem(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  userId: string,
  suffix: string
) {
  await request(app)
    .post(`/api/organizations/${organizationId}/competencies`)
    .set({ "x-dev-user-id": userId })
    .send(competencyInput(suffix))
    .expect(201);
  const catalog = await request(app)
    .get(`/api/organizations/${organizationId}/competencies/catalog`)
    .set({ "x-dev-user-id": userId })
    .expect(200);
  return catalog.body[0] as { competencyCatalogItemId: string };
}

function createApp(database: PostgresTestDatabase, service = createPostgresQuestionService) {
  return createServer(
    createCoreService(new PostgresCoreRepository(database.pool)),
    createPostgresDnaService(database.pool),
    createPostgresOrganizationalUnitService(database.pool),
    createPostgresCompetencyService(database.pool),
    createPostgresJobProfileService(database.pool),
    service(database.pool)
  );
}

describe("phase 6 question bank API", () => {
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

  it("manages global questions with Platform Admin only and normalized code", async () => {
    const owner = await createUser(app, "owner-global-question");
    const admin = await createUser(app, "admin-global-question");
    const member = await createUser(app, "member-global-question");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, admin.id, "admin");
    await addMembership(app, organization.id, owner.id, member.id, "member");
    const global = await createGlobalQuestion(app, "GLOBAL", { code: " Global-Q " });

    await request(app)
      .post("/api/platform/questions/global")
      .set({ "x-dev-user-id": owner.id })
      .send(questionInput("DENIED"))
      .expect(403);
    await request(app)
      .post("/api/platform/questions/global")
      .set(platformHeaders)
      .send(questionInput("DUP", { code: "global-q" }))
      .expect(409);
    await request(app)
      .post("/api/platform/questions/global")
      .set(platformHeaders)
      .send(questionInput("BAD-TYPE", { type: "essay" }))
      .expect(400);
    await request(app)
      .post("/api/platform/questions/global")
      .set(platformHeaders)
      .send(questionInput("BAD-CATEGORY", { category: "custom" }))
      .expect(400);
    await request(app)
      .post("/api/platform/questions/global")
      .set(platformHeaders)
      .send(questionInput("GLOBAL-COMP", { competencyCatalogItemId: "ccat_forbidden" }))
      .expect(400);
    await request(app)
      .patch(`/api/platform/questions/global/${global.id}`)
      .set(platformHeaders)
      .send({ code: "GLOBAL-Q2" })
      .expect(200);
    await request(app)
      .patch(`/api/platform/questions/global/${global.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({ title: "Blocked" })
      .expect(403);
    await request(app)
      .patch(`/api/platform/questions/global/${global.id}`)
      .set({ "x-dev-user-id": admin.id })
      .send({ title: "Blocked" })
      .expect(403);
    await request(app)
      .patch(`/api/platform/questions/global/${global.id}`)
      .set({ "x-dev-user-id": member.id })
      .send({ title: "Blocked" })
      .expect(403);
    await request(app)
      .post(`/api/platform/organizations/${organization.id}/questions/admin-read`)
      .set(platformHeaders)
      .send({ reason: "support" })
      .expect(200);
  });

  it("creates organization questions, catalog items, stable options and competency links", async () => {
    const ownerA = await createUser(app, "owner-a-question");
    const ownerB = await createUser(app, "owner-b-question");
    const admin = await createUser(app, "admin-question");
    const member = await createUser(app, "member-question");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    await addMembership(app, orgA.organization.id, ownerA.id, admin.id, "admin");
    await addMembership(app, orgA.organization.id, ownerA.id, member.id, "member");
    const competencyA = await createCompetencyCatalogItem(
      app,
      orgA.organization.id,
      ownerA.id,
      "A"
    );
    const competencyB = await createCompetencyCatalogItem(
      app,
      orgB.organization.id,
      ownerB.id,
      "B"
    );

    const own = await createOrganizationQuestion(app, orgA.organization.id, ownerA.id, "OWN", {
      code: "same",
      type: "single_choice",
      options: [
        { id: "stable_no", text: "No", displayOrder: 1, status: "active" },
        { id: "stable_yes", text: "Yes", displayOrder: 0, status: "active" }
      ],
      competencyCatalogItemId: competencyA.competencyCatalogItemId
    });
    await createOrganizationQuestion(app, orgB.organization.id, ownerB.id, "OWN-B", {
      code: "SAME"
    });

    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/questions`)
      .set({ "x-dev-user-id": member.id })
      .send(questionInput("MEMBER"))
      .expect(403);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/questions`)
      .set(platformHeaders)
      .send(questionInput("PLATFORM"))
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/questions/${own.id}`)
      .set(platformHeaders)
      .send({ title: "Platform blocked" })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/questions`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(questionInput("DUP", { code: "SAME" }))
      .expect(409);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/questions`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(
        questionInput("BAD-COMP", { competencyCatalogItemId: competencyB.competencyCatalogItemId })
      )
      .expect(400);
    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/questions/${own.id}`)
      .set({ "x-dev-user-id": admin.id })
      .send({ code: "ADMIN-CODE" })
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/questions/${own.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ code: "OWNER-CODE", organizationId: orgB.organization.id })
      .expect(400);

    const reordered = await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/questions/${own.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({
        options: [
          { id: "stable_yes", text: "Yes", displayOrder: 1, status: "active" },
          { id: "stable_no", text: "No", displayOrder: 0, status: "active" }
        ]
      })
      .expect(200);
    expect(reordered.body.options.map((option: { id: string }) => option.id).sort()).toEqual([
      "stable_no",
      "stable_yes"
    ]);

    const catalog = await request(app)
      .get(`/api/organizations/${orgA.organization.id}/questions/catalog`)
      .set({ "x-dev-user-id": member.id })
      .expect(200);
    expect(catalog.body).toEqual([
      expect.objectContaining({
        origin: "organization",
        questionCatalogItemId: expect.any(String),
        competencyCatalogItemId: competencyA.competencyCatalogItemId
      })
    ]);
    expect(
      catalog.body.map((item: { questionCatalogItemId: string }) => item.questionCatalogItemId)
    ).not.toContain(own.id);
  });

  it("validates options, scale, numeric and rejects contextual fields", async () => {
    const owner = await createUser(app, "owner-validation-question");
    const { organization } = await createOrganization(app, owner.id);

    await request(app)
      .post(`/api/organizations/${organization.id}/questions`)
      .set({ "x-dev-user-id": owner.id })
      .send(questionInput("NO-OPTIONS", { type: "single_choice", options: [] }))
      .expect(400);
    await request(app)
      .post(`/api/organizations/${organization.id}/questions`)
      .set({ "x-dev-user-id": owner.id })
      .send(questionInput("OPEN-OPTIONS", { options: [{ id: "a", text: "A" }] }))
      .expect(400);
    await request(app)
      .post(`/api/organizations/${organization.id}/questions`)
      .set({ "x-dev-user-id": owner.id })
      .send(questionInput("BAD-SCALE", { type: "scale", settings: { min: 5, max: 1, step: 1 } }))
      .expect(400);
    await request(app)
      .post(`/api/organizations/${organization.id}/questions`)
      .set({ "x-dev-user-id": owner.id })
      .send(questionInput("BAD-NUMERIC", { type: "numeric", settings: { min: 10, max: 1 } }))
      .expect(400);
    await request(app)
      .post(`/api/organizations/${organization.id}/questions`)
      .set({ "x-dev-user-id": owner.id })
      .send(questionInput("WEIGHT", { weight: 1 }))
      .expect(400);
    await request(app)
      .post(`/api/organizations/${organization.id}/questions`)
      .set({ "x-dev-user-id": owner.id })
      .send(questionInput("SCORE", { score: 1 }))
      .expect(400);
    await request(app)
      .post(`/api/organizations/${organization.id}/questions`)
      .set({ "x-dev-user-id": owner.id })
      .send(questionInput("CORRECT", { correctAnswer: "yes" }))
      .expect(400);
  });

  it("adopts active globals and handles deprecated and inactive statuses", async () => {
    const owner = await createUser(app, "owner-adopt-question");
    const { organization } = await createOrganization(app, owner.id);
    const global = await createGlobalQuestion(app, "ADOPT");

    const adoption = await request(app)
      .post(`/api/organizations/${organization.id}/questions/adoptions`)
      .set({ "x-dev-user-id": owner.id })
      .send({ globalQuestionId: global.id })
      .expect(201);

    expect(adoption.body.catalogItem).toEqual(
      expect.objectContaining({ origin: "global", globalQuestionId: global.id })
    );
    await request(app)
      .post(`/api/organizations/${organization.id}/questions/adoptions`)
      .set({ "x-dev-user-id": owner.id })
      .send({ globalQuestionId: global.id })
      .expect(409);
    await request(app)
      .post(`/api/platform/questions/global/${global.id}/deprecate`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .get(`/api/organizations/${organization.id}/questions/catalog`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([expect.objectContaining({ deprecated: true })]);
      });
    await request(app)
      .post(
        `/api/organizations/${organization.id}/questions/adoptions/${adoption.body.adoption.id}/inactivate`
      )
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${organization.id}/questions/adoptions/${adoption.body.adoption.id}/activate`
      )
      .set({ "x-dev-user-id": owner.id })
      .expect(409);

    const inactiveGlobal = await createGlobalQuestion(app, "INACTIVE");
    await request(app)
      .post(`/api/platform/questions/global/${inactiveGlobal.id}/inactivate`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/questions/adoptions`)
      .set({ "x-dev-user-id": owner.id })
      .send({ globalQuestionId: inactiveGlobal.id })
      .expect(409);
  });

  it("serializes simultaneous adoption, duplicate code creation and deprecation races", async () => {
    const owner = await createUser(app, "owner-concurrency-question");
    const { organization } = await createOrganization(app, owner.id);
    const global = await createGlobalQuestion(app, "CONCURRENT-ADOPT");

    const adoptionResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/questions/adoptions`)
        .set({ "x-dev-user-id": owner.id })
        .send({ globalQuestionId: global.id }),
      request(app)
        .post(`/api/organizations/${organization.id}/questions/adoptions`)
        .set({ "x-dev-user-id": owner.id })
        .send({ globalQuestionId: global.id })
    ]);
    expect(adoptionResults.map((result) => result.status).sort()).toEqual([201, 409]);
    await expect(
      countRows("organization_adopted_questions", "global_question_id = $1", [global.id])
    ).resolves.toBe(1);
    await expect(
      countRows("question_catalog_items", "global_question_id = $1", [global.id])
    ).resolves.toBe(1);

    const codeResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/questions`)
        .set({ "x-dev-user-id": owner.id })
        .send(questionInput("CONCURRENT-CODE-A", { code: "CONCURRENT-Q" })),
      request(app)
        .post(`/api/organizations/${organization.id}/questions`)
        .set({ "x-dev-user-id": owner.id })
        .send(questionInput("CONCURRENT-CODE-B", { code: "concurrent-q" }))
    ]);
    expect(codeResults.map((result) => result.status).sort()).toEqual([201, 409]);

    const racingGlobal = await createGlobalQuestion(app, "RACE-DEPRECATE");
    const raceResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/questions/adoptions`)
        .set({ "x-dev-user-id": owner.id })
        .send({ globalQuestionId: racingGlobal.id }),
      request(app)
        .post(`/api/platform/questions/global/${racingGlobal.id}/deprecate`)
        .set(platformHeaders)
    ]);
    expect(raceResults.map((result) => result.status)).toContain(200);
    await expect(
      countRows("organization_adopted_questions", "global_question_id = $1", [racingGlobal.id])
    ).resolves.toBeLessThanOrEqual(1);

    const inactiveRaceGlobal = await createGlobalQuestion(app, "RACE-INACTIVATE");
    const inactiveRaceResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/questions/adoptions`)
        .set({ "x-dev-user-id": owner.id })
        .send({ globalQuestionId: inactiveRaceGlobal.id }),
      request(app)
        .post(`/api/platform/questions/global/${inactiveRaceGlobal.id}/inactivate`)
        .set(platformHeaders)
    ]);
    expect(inactiveRaceResults.map((result) => result.status)).toContain(200);
    await expect(
      countRows("organization_adopted_questions", "global_question_id = $1", [
        inactiveRaceGlobal.id
      ])
    ).resolves.toBeLessThanOrEqual(1);
  });

  it("enforces catalog item origin constraints in PostgreSQL", async () => {
    const owner = await createUser(app, "owner-catalog-question");
    const { organization } = await createOrganization(app, owner.id);
    const global = await createGlobalQuestion(app, "CATALOG");
    const own = await createOrganizationQuestion(app, organization.id, owner.id, "CATALOG");

    await expect(
      database.pool.query(
        `
          INSERT INTO question_catalog_items (
            id, organization_id, origin, global_question_id, organization_question_id, status
          )
          VALUES ($1, $2, 'global', $3, $4, 'active')
        `,
        [`qcat_${crypto.randomUUID()}`, organization.id, global.id, own.id]
      )
    ).rejects.toThrow();
    await expect(
      database.pool.query(
        `
          INSERT INTO question_catalog_items (
            id, organization_id, origin, global_question_id, organization_question_id, status
          )
          VALUES ($1, $2, 'organization', NULL, NULL, 'active')
        `,
        [`qcat_${crypto.randomUUID()}`, organization.id]
      )
    ).rejects.toThrow();
    await expect(
      database.pool.query(
        `
          INSERT INTO question_catalog_items (
            id, organization_id, origin, global_question_id, organization_question_id, status
          )
          VALUES ($1, $2, NULL, NULL, NULL, 'active')
        `,
        [`qcat_${crypto.randomUUID()}`, organization.id]
      )
    ).rejects.toThrow();
  });

  it("blocks inactive users, inactive memberships, archived organizations and cross organization ids", async () => {
    const ownerA = await createUser(app, "owner-a-sec-question");
    const ownerB = await createUser(app, "owner-b-sec-question");
    const user = await createUser(app, "inactive-sec-question");
    const member = await createUser(app, "member-sec-question");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    const membership = await addMembership(
      app,
      orgA.organization.id,
      ownerA.id,
      member.id,
      "member"
    );
    const ownB = await createOrganizationQuestion(app, orgB.organization.id, ownerB.id, "PRIVATE");
    const global = await createGlobalQuestion(app, "SEC");
    const adoption = await request(app)
      .post(`/api/organizations/${orgA.organization.id}/questions/adoptions`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ globalQuestionId: global.id })
      .expect(201);

    await request(app)
      .get(`/api/organizations/${orgA.organization.id}/questions/catalog`)
      .set({ "x-dev-user-id": ownerB.id })
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/questions/${ownB.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ title: "Leak" })
      .expect(404);
    await request(app)
      .post(
        `/api/organizations/${orgB.organization.id}/questions/adoptions/${adoption.body.adoption.id}/inactivate`
      )
      .set({ "x-dev-user-id": ownerB.id })
      .expect(404);
    await request(app)
      .get(
        `/api/organizations/${orgB.organization.id}/questions/catalog/${adoption.body.catalogItem.id}`
      )
      .set({ "x-dev-user-id": ownerB.id })
      .expect(404);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/questions`)
      .set({ "x-dev-user-id": "usr_missing" })
      .send(questionInput("MISSING"))
      .expect(403);
    await database.pool.query("UPDATE users SET status = 'inactive' WHERE id = $1", [user.id]);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/questions`)
      .set({ "x-dev-user-id": user.id })
      .send(questionInput("INACTIVE-USER"))
      .expect(403);
    await request(app)
      .patch(`/api/memberships/${membership.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ status: "inactive" })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/questions`)
      .set({ "x-dev-user-id": member.id })
      .send(questionInput("INACTIVE-MEMBERSHIP"))
      .expect(403);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/archive`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .get(`/api/organizations/${orgA.organization.id}/questions/catalog`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(403);
    await request(app)
      .post(`/api/platform/organizations/${orgA.organization.id}/questions/admin-read`)
      .set(platformHeaders)
      .send({})
      .expect(400);
  });

  it("audits without full content, rolls back on audit failure, persists and never deletes rows", async () => {
    const owner = await createUser(app, "owner-audit-question");
    const { organization } = await createOrganization(app, owner.id);
    const own = await createOrganizationQuestion(app, organization.id, owner.id, "AUDIT", {
      questionText: "Confidential full question text"
    });

    await request(app)
      .post(`/api/organizations/${organization.id}/questions/${own.id}/inactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await expect(countRows("organization_questions", "id = $1", [own.id])).resolves.toBe(1);
    await expect(
      countRows("question_catalog_items", "organization_question_id = $1", [own.id])
    ).resolves.toBe(1);

    const audit = await request(app).get("/api/audit-events").set(platformHeaders).expect(200);
    expect(audit.body.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining([
        "organization_question.created",
        "question_catalog_item.created",
        "organization_question.inactivated"
      ])
    );
    expect(JSON.stringify(audit.body)).not.toContain("Confidential full question text");

    const failingApp = createApp(database, createFailingAuditQuestionService);
    await request(failingApp)
      .post(`/api/organizations/${organization.id}/questions`)
      .set({ "x-dev-user-id": owner.id })
      .send(questionInput("ROLLBACK"))
      .expect(500);
    await expect(countRows("organization_questions", "code = $1", ["Q-ROLLBACK"])).resolves.toBe(0);

    const recreated = createApp(database);
    await request(recreated)
      .get(`/api/organizations/${organization.id}/questions`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([expect.objectContaining({ id: own.id })]);
      });
  });

  async function countRows(table: string, where: string, values: unknown[]) {
    const result = await database.pool.query(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${where}`,
      values
    );
    return Number(result.rows[0]?.count ?? 0);
  }
});

function createFailingAuditQuestionService(pool: pg.Pool) {
  const runTransaction = async <T>(
    callback: (transaction: {
      core: PostgresCoreRepository;
      questions: QuestionRepository;
      competencies: CompetencyRepository;
    }) => Promise<T>
  ) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new FailingAuditCoreRepository(client, true),
        questions: new PostgresQuestionRepository(client),
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

  return new QuestionService(
    new PostgresCoreRepository(pool),
    new PostgresQuestionRepository(pool),
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
