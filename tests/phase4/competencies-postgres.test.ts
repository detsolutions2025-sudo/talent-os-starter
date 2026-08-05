import request from "supertest";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/app";
import {
  CompetencyService,
  createPostgresCompetencyService
} from "../../src/server/competencies/service";
import type { CompetencyRepository } from "../../src/server/competencies/repository";
import { createCoreService } from "../../src/server/core/service";
import type { AuditEvent } from "../../src/server/core/types";
import { createPostgresDnaService } from "../../src/server/dna/service";
import { createPostgresOrganizationalUnitService } from "../../src/server/organizational-units/service";
import { PostgresCompetencyRepository } from "../../src/server/persistence/postgres-competency-repository";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

const platformHeaders = { "x-dev-platform-admin": "true" };

function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
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
    code: `CMP-${suffix}`,
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
  const slug = unique("cmp-org");
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

async function createGlobal(
  app: ReturnType<typeof createServer>,
  suffix: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await request(app)
    .post("/api/platform/competencies/global")
    .set(platformHeaders)
    .send(competencyInput(suffix, overrides))
    .expect(201);

  return response.body as { id: string; status: "active" | "inactive" | "deprecated" };
}

async function createOwn(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  userId: string,
  suffix: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/competencies`)
    .set({ "x-dev-user-id": userId })
    .send(competencyInput(suffix, overrides))
    .expect(201);

  return response.body as { id: string; code: string; status: "active" | "inactive" };
}

function createApp(database: PostgresTestDatabase, service = createPostgresCompetencyService) {
  return createServer(
    createCoreService(new PostgresCoreRepository(database.pool)),
    createPostgresDnaService(database.pool),
    createPostgresOrganizationalUnitService(database.pool),
    service(database.pool)
  );
}

describe("phase 4 competencies API", () => {
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

  it("manages global competencies with Platform Admin only, normalized code and validation", async () => {
    const owner = await createUser(app, "owner-global");
    const admin = await createUser(app, "admin-global");
    const member = await createUser(app, "member-global");
    const org = await createOrganization(app, owner.id);
    await addMembership(app, org.organization.id, owner.id, admin.id, "admin");
    await addMembership(app, org.organization.id, owner.id, member.id, "member");
    const global = await createGlobal(app, "GLOBAL", { code: " Skill-One " });

    await request(app)
      .post("/api/platform/competencies/global")
      .set({ "x-dev-user-id": owner.id })
      .send(competencyInput("DENIED"))
      .expect(403);
    await request(app)
      .post("/api/platform/competencies/global")
      .set(platformHeaders)
      .send(competencyInput("DUP", { code: "skill-one" }))
      .expect(409);
    await request(app)
      .post("/api/platform/competencies/global")
      .set(platformHeaders)
      .send(competencyInput("BAD-CAT", { category: "custom" }))
      .expect(400);
    await request(app)
      .post("/api/platform/competencies/global")
      .set(platformHeaders)
      .send(competencyInput("BAD-STATUS", { status: "pending" }))
      .expect(400);
    await request(app)
      .post("/api/platform/competencies/global")
      .set(platformHeaders)
      .send(
        competencyInput("BAD-EVIDENCE", { positiveEvidences: new Array(31).fill({ text: "x" }) })
      )
      .expect(400);
    await request(app)
      .post("/api/platform/competencies/global")
      .set(platformHeaders)
      .send(
        competencyInput("BAD-EXAMPLE", { practicalExamples: new Array(21).fill({ text: "x" }) })
      )
      .expect(400);
    await request(app)
      .post("/api/platform/competencies/global")
      .set(platformHeaders)
      .send(competencyInput("BAD-LEVELS", { proficiencyLevels: levels().slice(0, 4) }))
      .expect(400);
    await request(app)
      .post("/api/platform/competencies/global")
      .set(platformHeaders)
      .send(
        competencyInput("DUP-LEVEL", {
          proficiencyLevels: levels().map((level) => ({ ...level, number: 1 }))
        })
      )
      .expect(400);
    await request(app)
      .post("/api/platform/competencies/global")
      .set(platformHeaders)
      .send(
        competencyInput("BAD-LEVEL-CODE", {
          proficiencyLevels: [{ ...levels()[0], code: "starter" }]
        })
      )
      .expect(400);

    await request(app)
      .patch(`/api/platform/competencies/global/${global.id}`)
      .set(platformHeaders)
      .send({ code: "Skill-Two" })
      .expect(200);
  });

  it("creates organization competencies, catalog items and enforces roles and code ownership", async () => {
    const ownerA = await createUser(app, "owner-a-own");
    const ownerB = await createUser(app, "owner-b-own");
    const admin = await createUser(app, "admin-own");
    const member = await createUser(app, "member-own");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    await addMembership(app, orgA.organization.id, ownerA.id, admin.id, "admin");
    await addMembership(app, orgA.organization.id, ownerA.id, member.id, "member");

    const own = await createOwn(app, orgA.organization.id, ownerA.id, "OWN", { code: "same" });
    await createOwn(app, orgA.organization.id, admin.id, "ADMIN");
    await createOwn(app, orgB.organization.id, ownerB.id, "OWN-B", { code: "SAME" });

    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/competencies`)
      .set({ "x-dev-user-id": member.id })
      .send(competencyInput("MEMBER"))
      .expect(403);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/competencies`)
      .set(platformHeaders)
      .send(competencyInput("PLATFORM"))
      .expect(403);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/competencies`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(competencyInput("DUP", { code: "SAME" }))
      .expect(409);

    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/competencies/${own.id}`)
      .set({ "x-dev-user-id": admin.id })
      .send({ code: "ADMIN-CODE" })
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/competencies/${own.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ code: "OWNER-CODE" })
      .expect(200);
    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/competencies/${own.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ organizationId: orgB.organization.id })
      .expect(400);
    await request(app)
      .patch("/api/platform/competencies/global/gcmp_missing")
      .set({ "x-dev-user-id": ownerA.id })
      .send({ name: "Blocked" })
      .expect(403);
    await request(app)
      .patch("/api/platform/competencies/global/gcmp_missing")
      .set({ "x-dev-user-id": admin.id })
      .send({ name: "Blocked" })
      .expect(403);
    await request(app)
      .patch("/api/platform/competencies/global/gcmp_missing")
      .set({ "x-dev-user-id": member.id })
      .send({ name: "Blocked" })
      .expect(403);

    const catalog = await request(app)
      .get(`/api/organizations/${orgA.organization.id}/competencies/catalog`)
      .set({ "x-dev-user-id": member.id })
      .expect(200);

    expect(catalog.body).toEqual([
      expect.objectContaining({
        origin: "organization",
        competencyCatalogItemId: expect.any(String)
      }),
      expect.objectContaining({
        origin: "organization",
        competencyCatalogItemId: expect.any(String)
      })
    ]);
    expect(
      catalog.body.map((item: { competencyCatalogItemId: string }) => item.competencyCatalogItemId)
    ).not.toContain(own.id);
  });

  it("adopts active globals, uses catalog item ids and handles deprecated/inactive status", async () => {
    const owner = await createUser(app, "owner-adopt");
    const { organization } = await createOrganization(app, owner.id);
    const global = await createGlobal(app, "ADOPT");

    const adoption = await request(app)
      .post(`/api/organizations/${organization.id}/competencies/adoptions`)
      .set({ "x-dev-user-id": owner.id })
      .send({ globalCompetencyId: global.id })
      .expect(201);

    expect(adoption.body.catalogItem).toEqual(
      expect.objectContaining({ origin: "global", globalCompetencyId: global.id })
    );
    await request(app)
      .post(`/api/organizations/${organization.id}/competencies/adoptions`)
      .set({ "x-dev-user-id": owner.id })
      .send({ globalCompetencyId: global.id })
      .expect(409);

    await request(app)
      .post(`/api/platform/competencies/global/${global.id}/deprecate`)
      .set(platformHeaders)
      .expect(200);
    const deprecatedCatalog = await request(app)
      .get(`/api/organizations/${organization.id}/competencies/catalog`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    expect(deprecatedCatalog.body).toEqual([
      expect.objectContaining({ deprecated: true, globalStatus: "deprecated" })
    ]);
    await request(app)
      .post(
        `/api/organizations/${organization.id}/competencies/adoptions/${adoption.body.adoption.id}/inactivate`
      )
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${organization.id}/competencies/adoptions/${adoption.body.adoption.id}/activate`
      )
      .set({ "x-dev-user-id": owner.id })
      .expect(409);

    const inactiveGlobal = await createGlobal(app, "INACTIVE");
    await request(app)
      .post(`/api/platform/competencies/global/${inactiveGlobal.id}/inactivate`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/competencies/adoptions`)
      .set({ "x-dev-user-id": owner.id })
      .send({ globalCompetencyId: inactiveGlobal.id })
      .expect(409);

    const reactivatedGlobal = await createGlobal(app, "REACTIVATED");
    const reactivatedAdoption = await request(app)
      .post(`/api/organizations/${organization.id}/competencies/adoptions`)
      .set({ "x-dev-user-id": owner.id })
      .send({ globalCompetencyId: reactivatedGlobal.id })
      .expect(201);
    await request(app)
      .post(`/api/platform/competencies/global/${reactivatedGlobal.id}/inactivate`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .get(
        `/api/organizations/${organization.id}/competencies/catalog/${reactivatedAdoption.body.catalogItem.id}`
      )
      .set({ "x-dev-user-id": owner.id })
      .expect(404);
    await request(app)
      .post(`/api/platform/competencies/global/${reactivatedGlobal.id}/activate`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .get(
        `/api/organizations/${organization.id}/competencies/catalog/${reactivatedAdoption.body.catalogItem.id}`
      )
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    const deprecatedGlobal = await createGlobal(app, "DEPRECATED-NEW");
    await request(app)
      .post(`/api/platform/competencies/global/${deprecatedGlobal.id}/deprecate`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/competencies/adoptions`)
      .set({ "x-dev-user-id": owner.id })
      .send({ globalCompetencyId: deprecatedGlobal.id })
      .expect(409);
  });

  it("serializes simultaneous adoption, code creation and deprecation races", async () => {
    const owner = await createUser(app, "owner-concurrency");
    const { organization } = await createOrganization(app, owner.id);
    const global = await createGlobal(app, "CONCURRENT-ADOPT");

    const adoptionResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/competencies/adoptions`)
        .set({ "x-dev-user-id": owner.id })
        .send({ globalCompetencyId: global.id }),
      request(app)
        .post(`/api/organizations/${organization.id}/competencies/adoptions`)
        .set({ "x-dev-user-id": owner.id })
        .send({ globalCompetencyId: global.id })
    ]);
    expect(adoptionResults.map((result) => result.status).sort()).toEqual([201, 409]);
    await expect(
      countRows("organization_adopted_competencies", "global_competency_id = $1", [global.id])
    ).resolves.toBe(1);
    await expect(
      countRows("competency_catalog_items", "global_competency_id = $1", [global.id])
    ).resolves.toBe(1);

    const codeResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/competencies`)
        .set({ "x-dev-user-id": owner.id })
        .send(competencyInput("CONCURRENT-CODE-A", { code: "CONCURRENT-CODE" })),
      request(app)
        .post(`/api/organizations/${organization.id}/competencies`)
        .set({ "x-dev-user-id": owner.id })
        .send(competencyInput("CONCURRENT-CODE-B", { code: "concurrent-code" }))
    ]);
    expect(codeResults.map((result) => result.status).sort()).toEqual([201, 409]);

    const racingGlobal = await createGlobal(app, "RACE-DEPRECATE");
    const raceResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/competencies/adoptions`)
        .set({ "x-dev-user-id": owner.id })
        .send({ globalCompetencyId: racingGlobal.id }),
      request(app)
        .post(`/api/platform/competencies/global/${racingGlobal.id}/deprecate`)
        .set(platformHeaders)
    ]);
    expect(raceResults.map((result) => result.status).sort()).toEqual(
      expect.arrayContaining([200])
    );
    await expect(
      countRows("organization_adopted_competencies", "global_competency_id = $1", [racingGlobal.id])
    ).resolves.toBeLessThanOrEqual(1);
  });

  it("enforces catalog item origin constraints in PostgreSQL", async () => {
    const owner = await createUser(app, "owner-catalog-constraints");
    const { organization } = await createOrganization(app, owner.id);
    const global = await createGlobal(app, "CATALOG-CONSTRAINT");
    const own = await createOwn(app, organization.id, owner.id, "CATALOG-CONSTRAINT");

    await expect(
      database.pool.query(
        `
          INSERT INTO competency_catalog_items (
            id, organization_id, origin, global_competency_id, organization_competency_id, status
          )
          VALUES ($1, $2, 'global', $3, $4, 'active')
        `,
        [`ccat_${crypto.randomUUID()}`, organization.id, global.id, own.id]
      )
    ).rejects.toThrow();
    await expect(
      database.pool.query(
        `
          INSERT INTO competency_catalog_items (
            id, organization_id, origin, global_competency_id, organization_competency_id, status
          )
          VALUES ($1, $2, 'organization', NULL, NULL, 'active')
        `,
        [`ccat_${crypto.randomUUID()}`, organization.id]
      )
    ).rejects.toThrow();
  });

  it("blocks missing users, inactive users, inactive memberships, archived organizations and cross organization ids", async () => {
    const ownerA = await createUser(app, "owner-a-sec");
    const ownerB = await createUser(app, "owner-b-sec");
    const user = await createUser(app, "inactive-sec");
    const member = await createUser(app, "member-sec");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    const membership = await addMembership(
      app,
      orgA.organization.id,
      ownerA.id,
      member.id,
      "member"
    );
    const ownB = await createOwn(app, orgB.organization.id, ownerB.id, "PRIVATE");
    const global = await createGlobal(app, "SEC");
    const adoption = await request(app)
      .post(`/api/organizations/${orgA.organization.id}/competencies/adoptions`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ globalCompetencyId: global.id })
      .expect(201);

    await request(app)
      .get(`/api/organizations/${orgA.organization.id}/competencies/catalog`)
      .set({ "x-dev-user-id": ownerB.id })
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/competencies/${ownB.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ name: "Leak" })
      .expect(404);
    await request(app)
      .post(
        `/api/organizations/${orgB.organization.id}/competencies/adoptions/${adoption.body.adoption.id}/inactivate`
      )
      .set({ "x-dev-user-id": ownerB.id })
      .expect(404);
    await request(app)
      .get(
        `/api/organizations/${orgB.organization.id}/competencies/catalog/${adoption.body.catalogItem.id}`
      )
      .set({ "x-dev-user-id": ownerB.id })
      .expect(404);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/competencies`)
      .set({ "x-dev-user-id": "usr_missing" })
      .send(competencyInput("MISSING"))
      .expect(403);
    await database.pool.query("UPDATE users SET status = 'inactive' WHERE id = $1", [user.id]);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/competencies`)
      .set({ "x-dev-user-id": user.id })
      .send(competencyInput("INACTIVE-USER"))
      .expect(403);
    await request(app)
      .patch(`/api/memberships/${membership.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ status: "inactive" })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/competencies`)
      .set({ "x-dev-user-id": member.id })
      .send(competencyInput("INACTIVE-MEMBERSHIP"))
      .expect(403);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/archive`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .get(`/api/organizations/${orgA.organization.id}/competencies/catalog`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(403);
    await request(app)
      .post(`/api/platform/organizations/${orgA.organization.id}/competencies/admin-read`)
      .set(platformHeaders)
      .send({})
      .expect(400);
    await request(app)
      .post(`/api/platform/organizations/${orgA.organization.id}/competencies/admin-read`)
      .set(platformHeaders)
      .send({ reason: "support review" })
      .expect(200);
  });

  it("audits operations without full content, rolls back on critical audit failure and never deletes rows", async () => {
    const owner = await createUser(app, "owner-audit");
    const { organization } = await createOrganization(app, owner.id);
    const own = await createOwn(app, organization.id, owner.id, "AUDIT", {
      positiveEvidences: [{ text: "Confidential evidence text", displayOrder: 0 }]
    });

    await request(app)
      .post(`/api/organizations/${organization.id}/competencies/${own.id}/inactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await expect(countRows("organization_competencies", "id = $1", [own.id])).resolves.toBe(1);
    await expect(
      countRows("competency_catalog_items", "organization_competency_id = $1", [own.id])
    ).resolves.toBe(1);

    const audit = await request(app).get("/api/audit-events").set(platformHeaders).expect(200);
    expect(audit.body.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining([
        "organization_competency.created",
        "competency_catalog_item.created",
        "organization_competency.inactivated"
      ])
    );
    expect(JSON.stringify(audit.body)).not.toContain("Confidential evidence text");

    const failingApp = createApp(database, createFailingAuditCompetencyService);
    await request(failingApp)
      .post(`/api/organizations/${organization.id}/competencies`)
      .set({ "x-dev-user-id": owner.id })
      .send(competencyInput("ROLLBACK"))
      .expect(500);
    await expect(
      countRows("organization_competencies", "code = $1", ["CMP-ROLLBACK"])
    ).resolves.toBe(0);

    const recreated = createApp(database);
    await request(recreated)
      .get(`/api/organizations/${organization.id}/competencies`)
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

function createFailingAuditCompetencyService(pool: pg.Pool) {
  const runTransaction = async <T>(
    callback: (transaction: {
      core: PostgresCoreRepository;
      competencies: CompetencyRepository;
    }) => Promise<T>
  ) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new FailingAuditCoreRepository(client, true),
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

  return new CompetencyService(
    new PostgresCoreRepository(pool),
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
