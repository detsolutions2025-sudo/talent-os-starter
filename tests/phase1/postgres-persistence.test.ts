import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/app";
import type { CoreRepository } from "../../src/server/core/repository";
import { createCoreService } from "../../src/server/core/service";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

const platformHeaders = { "x-dev-platform-admin": "true" };

async function createUser(app: ReturnType<typeof createServer>, email: string, name = "Test User") {
  const response = await request(app)
    .post("/api/dev/users")
    .set(platformHeaders)
    .send({ name, email })
    .expect(201);

  return response.body as { id: string; email: string; status: string };
}

async function createOrganization(
  app: ReturnType<typeof createServer>,
  initialOwnerUserId: string,
  slug = "acme"
) {
  const response = await request(app)
    .post("/api/organizations")
    .set(platformHeaders)
    .send({ name: `Organization ${slug}`, slug, initialOwnerUserId })
    .expect(201);

  return response.body as {
    organization: { id: string; status: string; slug: string };
    membership: { id: string; role: string; status: string };
  };
}

describe("phase 1.1 PostgreSQL persistence", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createServer>;

  beforeAll(async () => {
    process.env.APP_ENV = "test";
    database = await createPostgresTestDatabase();
  });

  beforeEach(() => {
    process.env.APP_ENV = "test";
    app = createServer(createCoreService(new PostgresCoreRepository(database.pool)));
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("persists User, Organization, Membership and audit after recreating the app", async () => {
    const owner = await createUser(app, "owner@example.com");
    const result = await createOrganization(app, owner.id);
    const recreatedApp = createServer(createCoreService(new PostgresCoreRepository(database.pool)));

    const organizations = await request(recreatedApp)
      .get("/api/organizations")
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    const memberships = await request(recreatedApp)
      .get(`/api/organizations/${result.organization.id}/memberships`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    const audit = await request(recreatedApp)
      .get("/api/audit-events")
      .set(platformHeaders)
      .expect(200);

    expect(organizations.body).toEqual([
      expect.objectContaining({ id: result.organization.id, slug: "acme" })
    ]);
    expect(memberships.body).toEqual([
      expect.objectContaining({ id: result.membership.id, userId: owner.id })
    ]);
    expect(audit.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "organization.created",
          organizationId: result.organization.id
        }),
        expect.objectContaining({ action: "membership.created_initial_owner" })
      ])
    );
  });

  it("keeps Organization and first owner atomic when Membership insertion fails", async () => {
    const owner = await createUser(app, "rollback-membership@example.com");
    const failingRepository = new FailingRepository(
      new PostgresCoreRepository(database.pool),
      "addMembership"
    );
    const failingApp = createServer(createCoreService(failingRepository));

    await request(failingApp)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({
        name: "Rollback Membership",
        slug: "rollback-membership",
        initialOwnerUserId: owner.id
      })
      .expect(500);

    await expect(countRows("organizations", "slug = $1", ["rollback-membership"])).resolves.toBe(0);
    await expect(countRows("memberships", "user_id = $1", [owner.id])).resolves.toBe(0);
  });

  it("rolls back critical creation when audit persistence fails", async () => {
    const owner = await createUser(app, "rollback-audit@example.com");
    const failingRepository = new FailingRepository(
      new PostgresCoreRepository(database.pool),
      "addAuditEvent"
    );
    const failingApp = createServer(createCoreService(failingRepository));

    await request(failingApp)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "Rollback Audit", slug: "rollback-audit", initialOwnerUserId: owner.id })
      .expect(500);

    await expect(countRows("organizations", "slug = $1", ["rollback-audit"])).resolves.toBe(0);
    await expect(countRows("memberships", "user_id = $1", [owner.id])).resolves.toBe(0);
  });

  it("enforces database uniqueness, status checks and foreign keys", async () => {
    const owner = await createUser(app, "constraints@example.com");
    const result = await createOrganization(app, owner.id, "constraints");

    await request(app)
      .post("/api/dev/users")
      .set(platformHeaders)
      .send({ name: "Duplicate", email: "constraints@example.com" })
      .expect(409);
    await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "Duplicate", slug: "constraints", initialOwnerUserId: owner.id })
      .expect(409);
    await request(app)
      .post(`/api/organizations/${result.organization.id}/memberships`)
      .set({ "x-dev-user-id": owner.id })
      .send({ userId: owner.id, role: "member" })
      .expect(409);

    await expect(
      database.pool.query("INSERT INTO users (id, name, email, status) VALUES ($1, $2, $3, $4)", [
        "invalid_status",
        "Invalid",
        "invalid-status@example.com",
        "pending"
      ])
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      database.pool.query(
        "INSERT INTO memberships (id, organization_id, user_id, role, status) VALUES ($1, $2, $3, $4, $5)",
        ["invalid_fk", "missing_org", owner.id, "member", "active"]
      )
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("keeps cross-Organization access denied and archived Organizations blocked", async () => {
    const ownerA = await createUser(app, "owner-a@example.com");
    const ownerB = await createUser(app, "owner-b@example.com");
    const orgA = await createOrganization(app, ownerA.id, "org-a");
    const orgB = await createOrganization(app, ownerB.id, "org-b");

    await request(app)
      .get(`/api/organizations/${orgB.organization.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/archive`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .get(`/api/organizations/${orgA.organization.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(403);
  });

  it("prevents concurrent attempts from leaving an Organization without owner", async () => {
    const owner = await createUser(app, "concurrent-owner@example.com");
    const result = await createOrganization(app, owner.id, "concurrent-owner");

    await Promise.all([
      request(app)
        .patch(`/api/memberships/${result.membership.id}`)
        .set({ "x-dev-user-id": owner.id })
        .send({ status: "inactive" })
        .expect(409),
      request(app)
        .patch(`/api/memberships/${result.membership.id}`)
        .set({ "x-dev-user-id": owner.id })
        .send({ role: "member" })
        .expect(409)
    ]);

    await expect(
      countRows("memberships", "organization_id = $1 AND role = 'owner' AND status = 'active'", [
        result.organization.id
      ])
    ).resolves.toBe(1);
  });

  it("keeps development routes and global audit blocked correctly", async () => {
    const owner = await createUser(app, "security@example.com");
    await createOrganization(app, owner.id, "security");

    await request(app).get("/api/audit-events").set({ "x-dev-user-id": owner.id }).expect(403);
    await request(app).get("/api/audit-events").set(platformHeaders).expect(200);

    process.env.APP_ENV = "production";

    await request(app).get("/api/dev/me").set({ "x-dev-user-id": owner.id }).expect(403);
  });

  async function countRows(table: string, where: string, values: unknown[]) {
    const result = await database.pool.query(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${where}`,
      values
    );
    return Number(result.rows[0]?.count ?? 0);
  }
});

class FailingRepository extends PostgresCoreRepository {
  constructor(
    private readonly wrapped: PostgresCoreRepository,
    private readonly operation: "addMembership" | "addAuditEvent"
  ) {
    super(wrapped["connection"]);
  }

  override async transaction<T>(callback: (repository: CoreRepository) => Promise<T>) {
    return this.wrapped.transaction((repository) =>
      callback(new FailingTransactionRepository(repository, this.operation))
    );
  }
}

class FailingTransactionRepository extends PostgresCoreRepository {
  constructor(
    private readonly wrapped: CoreRepository,
    private readonly operation: "addMembership" | "addAuditEvent"
  ) {
    super((wrapped as PostgresCoreRepository).connection, true);
  }

  override async addMembership(...args: Parameters<PostgresCoreRepository["addMembership"]>) {
    if (this.operation === "addMembership") {
      throw new Error("Injected Membership persistence failure.");
    }

    return this.wrapped.addMembership(...args);
  }

  override async addAuditEvent(...args: Parameters<PostgresCoreRepository["addAuditEvent"]>) {
    if (this.operation === "addAuditEvent") {
      throw new Error("Injected audit persistence failure.");
    }

    return this.wrapped.addAuditEvent(...args);
  }
}
