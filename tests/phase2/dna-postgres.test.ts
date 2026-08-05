import request from "supertest";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/app";
import type { CoreRepository } from "../../src/server/core/repository";
import { createCoreService } from "../../src/server/core/service";
import type { AuditEvent } from "../../src/server/core/types";
import { createPostgresDnaService, DnaService } from "../../src/server/dna/service";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { PostgresDnaRepository } from "../../src/server/persistence/postgres-dna-repository";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

const platformHeaders = { "x-dev-platform-admin": "true" };

function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
}

function publishableDna(suffix = "base") {
  return {
    mission: `Mission ${suffix}`,
    vision: `Vision ${suffix}`,
    purpose: `Purpose ${suffix}`,
    values: [
      {
        name: `Value ${suffix}`,
        description: `Value description ${suffix}`,
        practicalMeaning: "",
        expectedBehaviors: ["Collaborate"],
        incompatibleBehaviors: ["Hide information"]
      }
    ],
    competencies: [
      {
        name: `Competency ${suffix}`,
        description: `Competency description ${suffix}`,
        importance: "high",
        examples: ["Solve problems"]
      }
    ],
    culture: "Direct and collaborative",
    leadershipStyle: "Clear ownership",
    workEnvironment: "Focused"
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
  const slug = unique("dna-org");
  const response = await request(app)
    .post("/api/organizations")
    .set(platformHeaders)
    .send({ name: `Organization ${slug}`, slug, initialOwnerUserId: ownerId })
    .expect(201);

  return response.body as {
    organization: { id: string; slug: string };
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
  return request(app)
    .post(`/api/organizations/${organizationId}/memberships`)
    .set({ "x-dev-user-id": ownerId })
    .send({ userId, role })
    .expect(201);
}

describe("phase 2 organization DNA API", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createServer>;

  beforeAll(async () => {
    process.env.APP_ENV = "test";
    database = await createPostgresTestDatabase();
  });

  beforeEach(() => {
    process.env.APP_ENV = "test";
    app = createServer(
      createCoreService(new PostgresCoreRepository(database.pool)),
      createPostgresDnaService(database.pool)
    );
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("creates a first draft and prevents a second active draft", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);

    const draft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send({ mission: "Draft mission" })
      .expect(201);

    expect(draft.body).toEqual(expect.objectContaining({ status: "draft", versionNumber: null }));

    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send({})
      .expect(409);
  });

  it("edits, discards and blocks discarded drafts", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const draft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send({ mission: "Before" })
      .expect(201);

    await request(app)
      .patch(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({ mission: "After" })
      .expect(200)
      .expect((response) => {
        expect(response.body.mission).toBe("After");
      });

    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}/discard`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    await request(app)
      .patch(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({ mission: "Nope" })
      .expect(409);
    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}/publish`)
      .set({ "x-dev-user-id": owner.id })
      .expect(409);

    const versions = await request(app)
      .get(`/api/organizations/${organization.id}/dna/versions`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    expect(versions.body).toEqual([
      expect.objectContaining({
        id: draft.body.id,
        status: "draft",
        discardedAt: expect.any(String)
      })
    ]);
  });

  it("publishes atomically and copies the published version into a new draft", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const firstDraft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send(publishableDna("v1"))
      .expect(201);

    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${firstDraft.body.id}/publish`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200)
      .expect((response) => {
        expect(response.body.versionNumber).toBe(1);
        expect(response.body.status).toBe("published");
      });

    const copiedDraft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send({})
      .expect(201);

    expect(copiedDraft.body.id).not.toBe(firstDraft.body.id);
    expect(copiedDraft.body.mission).toBe("Mission v1");

    await request(app)
      .patch(`/api/organizations/${organization.id}/dna/drafts/${copiedDraft.body.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({ mission: "Mission v2" })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${copiedDraft.body.id}/publish`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200)
      .expect((response) => {
        expect(response.body.versionNumber).toBe(2);
      });

    const versions = await request(app)
      .get(`/api/organizations/${organization.id}/dna/versions`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    expect(
      versions.body.filter((version: { status: string }) => version.status === "published")
    ).toHaveLength(1);
    expect(
      versions.body.filter((version: { status: string }) => version.status === "archived")
    ).toHaveLength(1);
  });

  it("enforces role permissions for publish, draft and history access", async () => {
    const owner = await createUser(app, "owner");
    const admin = await createUser(app, "admin");
    const member = await createUser(app, "member");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, admin.id, "admin");
    await addMembership(app, organization.id, owner.id, member.id, "member");
    const draft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": admin.id })
      .send(publishableDna("roles"))
      .expect(201);

    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}/publish`)
      .set({ "x-dev-user-id": admin.id })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}/publish`)
      .set({ "x-dev-user-id": member.id })
      .expect(403);
    await request(app)
      .get(`/api/organizations/${organization.id}/dna/draft`)
      .set({ "x-dev-user-id": member.id })
      .expect(403);
    await request(app)
      .get(`/api/organizations/${organization.id}/dna/versions`)
      .set({ "x-dev-user-id": member.id })
      .expect(403);

    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}/publish`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .get(`/api/organizations/${organization.id}/dna`)
      .set({ "x-dev-user-id": member.id })
      .expect(200);
  });

  it("blocks Platform Admin from functional DNA operations", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const draft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send(publishableDna("platform"))
      .expect(201);

    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set(platformHeaders)
      .send({})
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}`)
      .set(platformHeaders)
      .send({ mission: "Platform edit" })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}/publish`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}/discard`)
      .set(platformHeaders)
      .expect(403);
  });

  it("blocks manual organizationId and versionId manipulation across Organizations", async () => {
    const ownerA = await createUser(app, "owner-a");
    const ownerB = await createUser(app, "owner-b");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    const draftB = await request(app)
      .post(`/api/organizations/${orgB.organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": ownerB.id })
      .send(publishableDna("b"))
      .expect(201);

    await request(app)
      .get(`/api/organizations/${orgB.organization.id}/dna/draft`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(403);
    await request(app)
      .get(`/api/organizations/${orgA.organization.id}/dna/versions/${draftB.body.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(404);
  });

  it("keeps published and archived versions immutable through draft routes", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const firstDraft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send(publishableDna("immutable-v1"))
      .expect(201);

    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${firstDraft.body.id}/publish`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .patch(`/api/organizations/${organization.id}/dna/drafts/${firstDraft.body.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({ mission: "Mutated published" })
      .expect(409);

    const secondDraft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send({ mission: "Mission immutable-v2" })
      .expect(201);
    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${secondDraft.body.id}/publish`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .patch(`/api/organizations/${organization.id}/dna/drafts/${firstDraft.body.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({ mission: "Mutated archived" })
      .expect(409);
  });

  it("blocks archived Organizations for normal DNA operations", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const publishedDraft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send(publishableDna("archived"))
      .expect(201);
    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${publishedDraft.body.id}/publish`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    const activeDraft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send({ mission: "Blocked by archive" })
      .expect(201);

    await request(app)
      .post(`/api/organizations/${organization.id}/archive`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .get(`/api/organizations/${organization.id}/dna`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);
    await request(app)
      .get(`/api/organizations/${organization.id}/dna/draft`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);
    await request(app)
      .get(`/api/organizations/${organization.id}/dna/versions`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);
    await request(app)
      .get(`/api/organizations/${organization.id}/dna/versions/${publishedDraft.body.id}`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send({})
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${organization.id}/dna/drafts/${activeDraft.body.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({ mission: "Still blocked" })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${activeDraft.body.id}/publish`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${activeDraft.body.id}/discard`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);
    await request(app)
      .post(`/api/platform/organizations/${organization.id}/dna/admin-read`)
      .set(platformHeaders)
      .send({ reason: "support archived organization" })
      .expect(200);
  });

  it("requires Platform Admin reason and audits administrative reads without DNA content", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const draft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send(publishableDna("sensitive"))
      .expect(201);

    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}/publish`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .post(`/api/platform/organizations/${organization.id}/dna/admin-read`)
      .set(platformHeaders)
      .send({})
      .expect(400);
    await request(app)
      .post(`/api/platform/organizations/${organization.id}/dna/admin-read`)
      .set(platformHeaders)
      .send({ reason: "support review" })
      .expect(200);

    const audit = await request(app).get("/api/audit-events").set(platformHeaders).expect(200);
    const adminRead = audit.body.find(
      (event: { action: string; organizationId: string }) =>
        event.action === "organization_dna.admin_read" && event.organizationId === organization.id
    );

    expect(adminRead).toEqual(expect.objectContaining({ organizationId: organization.id }));
    expect(JSON.stringify(adminRead)).not.toContain("Mission sensitive");
  });

  it("validates required publication fields, limits and competency importance", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const draft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send({})
      .expect(201);

    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}/publish`)
      .set({ "x-dev-user-id": owner.id })
      .expect(400);
    await request(app)
      .patch(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        ...publishableDna("invalid"),
        competencies: [{ name: "Bad", description: "Bad", importance: "urgent" }]
      })
      .expect(400);
    await request(app)
      .patch(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({ mission: "x".repeat(2001) })
      .expect(400);
  });

  it("keeps a single published version under simultaneous publish attempts", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const draft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send(publishableDna("concurrent"))
      .expect(201);

    const results = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}/publish`)
        .set({ "x-dev-user-id": owner.id }),
      request(app)
        .post(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}/publish`)
        .set({ "x-dev-user-id": owner.id })
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    await expect(
      countRows("organization_dna_versions", "organization_id = $1 AND status = 'published'", [
        organization.id
      ])
    ).resolves.toBe(1);
  });

  it("persists DNA after recreating the application", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const draft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send(publishableDna("persisted"))
      .expect(201);
    await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}/publish`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    const recreated = createServer(
      createCoreService(new PostgresCoreRepository(database.pool)),
      createPostgresDnaService(database.pool)
    );

    await request(recreated)
      .get(`/api/organizations/${organization.id}/dna`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200)
      .expect((response) => {
        expect(response.body.mission).toBe("Mission persisted");
      });
  });

  it("rolls back publish when audit persistence fails", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const draft = await request(app)
      .post(`/api/organizations/${organization.id}/dna/drafts`)
      .set({ "x-dev-user-id": owner.id })
      .send(publishableDna("rollback"))
      .expect(201);
    const failingApp = createServer(
      createCoreService(new PostgresCoreRepository(database.pool)),
      createFailingAuditDnaService(database.pool)
    );

    await request(failingApp)
      .post(`/api/organizations/${organization.id}/dna/drafts/${draft.body.id}/publish`)
      .set({ "x-dev-user-id": owner.id })
      .expect(500);

    await expect(
      countRows("organization_dna_versions", "id = $1 AND status = 'draft'", [draft.body.id])
    ).resolves.toBe(1);
  });

  async function countRows(table: string, where: string, values: unknown[]) {
    const result = await database.pool.query(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${where}`,
      values
    );
    return Number(result.rows[0]?.count ?? 0);
  }
});

function createFailingAuditDnaService(pool: pg.Pool) {
  const runTransaction = async <T>(
    callback: (transaction: { core: CoreRepository; dna: PostgresDnaRepository }) => Promise<T>
  ) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new FailingAuditCoreRepository(client, true),
        dna: new PostgresDnaRepository(client, true)
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

  return new DnaService(
    new PostgresCoreRepository(pool),
    new PostgresDnaRepository(pool),
    runTransaction
  );
}

class FailingAuditCoreRepository extends PostgresCoreRepository {
  override async addAuditEvent(event: AuditEvent) {
    void event;
    throw new Error("Injected audit failure.");
  }
}
