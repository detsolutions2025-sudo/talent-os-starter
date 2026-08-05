import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/app";
import { createCoreService } from "../../src/server/core/service";
import { createPostgresDnaService } from "../../src/server/dna/service";
import { createPostgresOrganizationalUnitService } from "../../src/server/organizational-units/service";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

const platformHeaders = { "x-dev-platform-admin": "true" };

function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
}

function unitInput(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    code: `OU-${suffix}`,
    name: `Unit ${suffix}`,
    type: "department",
    displayOrder: 0,
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
  const slug = unique("ou-org");
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

async function createUnit(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  userId: string,
  suffix: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/organizational-units`)
    .set({ "x-dev-user-id": userId })
    .send(unitInput(suffix, overrides))
    .expect(201);

  return response.body as {
    id: string;
    code: string;
    name: string;
    status: "active" | "inactive";
    parentId: string | null;
  };
}

function createApp(database: PostgresTestDatabase) {
  return createServer(
    createCoreService(new PostgresCoreRepository(database.pool)),
    createPostgresDnaService(database.pool),
    createPostgresOrganizationalUnitService(database.pool)
  );
}

describe("phase 3 organizational units API", () => {
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

  it("creates roots, children, repeated names and active tree", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const rootA = await createUnit(app, organization.id, owner.id, "ROOT-A", {
      name: "Repeated"
    });
    const rootB = await createUnit(app, organization.id, owner.id, "ROOT-B", {
      name: "Repeated"
    });
    const child = await createUnit(app, organization.id, owner.id, "CHILD", {
      parentId: rootA.id
    });

    expect(rootB.name).toBe("Repeated");
    expect(child.parentId).toBe(rootA.id);

    const tree = await request(app)
      .get(`/api/organizations/${organization.id}/organizational-units/tree`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    expect(tree.body).toHaveLength(2);
    expect(
      tree.body.find((unit: { id: string; children: unknown[] }) => unit.id === rootA.id).children
    ).toEqual([expect.objectContaining({ id: child.id })]);
  });

  it("orders siblings by display order and name when there is a tie", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    await createUnit(app, organization.id, owner.id, "ORDER-C", {
      name: "Charlie",
      displayOrder: 1
    });
    await createUnit(app, organization.id, owner.id, "ORDER-A", {
      name: "Alpha",
      displayOrder: 1
    });
    await createUnit(app, organization.id, owner.id, "ORDER-B", {
      name: "Bravo",
      displayOrder: 0
    });

    const tree = await request(app)
      .get(`/api/organizations/${organization.id}/organizational-units/tree`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    expect(tree.body.map((unit: { name: string }) => unit.name)).toEqual([
      "Bravo",
      "Alpha",
      "Charlie"
    ]);
  });

  it("enforces code rules and canonical fields", async () => {
    const ownerA = await createUser(app, "owner-a");
    const ownerB = await createUser(app, "owner-b");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);

    await createUnit(app, orgA.organization.id, ownerA.id, "DUP", { code: "dep-rh" });
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/organizational-units`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(unitInput("DUP2", { code: "DEP-RH" }))
      .expect(409);
    await createUnit(app, orgB.organization.id, ownerB.id, "DUP", { code: "DEP-RH" });

    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/organizational-units`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(unitInput("BADCODE", { code: "bad code" }))
      .expect(400);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/organizational-units`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(unitInput("BADTYPE", { type: "custom" }))
      .expect(400);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/organizational-units`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(unitInput("BADSTATUS", { status: "pending" }))
      .expect(400);
  });

  it("validates parent ownership, active parent, self reference and cycles", async () => {
    const ownerA = await createUser(app, "owner-a");
    const ownerB = await createUser(app, "owner-b");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    const root = await createUnit(app, orgA.organization.id, ownerA.id, "ROOT");
    const child = await createUnit(app, orgA.organization.id, ownerA.id, "CHILD", {
      parentId: root.id
    });
    const otherRoot = await createUnit(app, orgB.organization.id, ownerB.id, "OTHER");

    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/organizational-units`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(unitInput("MISSING", { parentId: "ou_missing" }))
      .expect(404);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/organizational-units`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(unitInput("CROSS", { parentId: otherRoot.id }))
      .expect(404);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/organizational-units/${root.id}/move`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ parentId: root.id })
      .expect(409);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/organizational-units/${root.id}/move`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ parentId: child.id })
      .expect(409);

    await request(app)
      .post(
        `/api/organizations/${orgA.organization.id}/organizational-units/${child.id}/inactivate`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/organizational-units`)
      .set({ "x-dev-user-id": ownerA.id })
      .send(unitInput("INACTIVE-PARENT", { parentId: child.id }))
      .expect(409);
  });

  it("limits hierarchy depth and validates subtree moves", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    let parent = await createUnit(app, organization.id, owner.id, "LEVEL-1");

    for (let level = 2; level <= 10; level += 1) {
      parent = await createUnit(app, organization.id, owner.id, `LEVEL-${level}`, {
        parentId: parent.id
      });
    }

    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units`)
      .set({ "x-dev-user-id": owner.id })
      .send(unitInput("LEVEL-11", { parentId: parent.id }))
      .expect(409);

    const moveRoot = await createUnit(app, organization.id, owner.id, "MOVE-ROOT");
    const moveChild = await createUnit(app, organization.id, owner.id, "MOVE-CHILD", {
      parentId: moveRoot.id
    });

    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${moveRoot.id}/move`)
      .set({ "x-dev-user-id": owner.id })
      .send({ parentId: parent.id })
      .expect(409);
    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${moveChild.id}/move`)
      .set({ "x-dev-user-id": owner.id })
      .send({ parentId: null })
      .expect(200)
      .expect((response) => {
        expect(response.body.parentId).toBeNull();
      });
  });

  it("allows owner code changes, blocks admin code changes and audits operations", async () => {
    const owner = await createUser(app, "owner");
    const admin = await createUser(app, "admin");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, admin.id, "admin");
    const unit = await createUnit(app, organization.id, owner.id, "CODE");

    await request(app)
      .patch(`/api/organizations/${organization.id}/organizational-units/${unit.id}`)
      .set({ "x-dev-user-id": admin.id })
      .send({ code: "ADMIN-CODE" })
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${organization.id}/organizational-units/${unit.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({ code: "OWNER-CODE", name: "Renamed" })
      .expect(200)
      .expect((response) => {
        expect(response.body.code).toBe("OWNER-CODE");
      });

    const history = await request(app)
      .get(`/api/organizations/${organization.id}/organizational-units/history`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    expect(history.body.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining([
        "organizational_unit.created",
        "organizational_unit.updated",
        "organizational_unit.code_changed"
      ])
    );
  });

  it("enforces member, admin, owner and Platform Admin permissions", async () => {
    const owner = await createUser(app, "owner");
    const admin = await createUser(app, "admin");
    const member = await createUser(app, "member");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, admin.id, "admin");
    await addMembership(app, organization.id, owner.id, member.id, "member");
    const root = await createUnit(app, organization.id, admin.id, "PERM");

    await request(app)
      .patch(`/api/organizations/${organization.id}/organizational-units/${root.id}`)
      .set({ "x-dev-user-id": member.id })
      .send({ name: "Member edit" })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units`)
      .set(platformHeaders)
      .send(unitInput("PLATFORM"))
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${organization.id}/organizational-units/${root.id}`)
      .set(platformHeaders)
      .send({ name: "Platform edit" })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${root.id}/move`)
      .set(platformHeaders)
      .send({ parentId: null })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${root.id}/inactivate`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${root.id}/reactivate`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .post(`/api/platform/organizations/${organization.id}/organizational-units/admin-read`)
      .set(platformHeaders)
      .send({})
      .expect(400);
    await request(app)
      .post(`/api/platform/organizations/${organization.id}/organizational-units/admin-read`)
      .set(platformHeaders)
      .send({ reason: "support review" })
      .expect(200);
  });

  it("inactivates, blocks active children, reactivates and excludes inactive units from active views", async () => {
    const owner = await createUser(app, "owner");
    const member = await createUser(app, "member");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, member.id, "member");
    const root = await createUnit(app, organization.id, owner.id, "INACT");
    const child = await createUnit(app, organization.id, owner.id, "INACT-CHILD", {
      parentId: root.id,
      managerName: "Historic Manager",
      managerEmail: "manager@example.com"
    });

    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${root.id}/inactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(409);
    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${child.id}/inactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .get(`/api/organizations/${organization.id}/organizational-units/${child.id}`)
      .set({ "x-dev-user-id": member.id })
      .expect(404);
    await request(app)
      .get(`/api/organizations/${organization.id}/organizational-units/history`)
      .set({ "x-dev-user-id": member.id })
      .expect(403);

    const activeForMember = await request(app)
      .get(`/api/organizations/${organization.id}/organizational-units`)
      .set({ "x-dev-user-id": member.id })
      .expect(200);

    expect(activeForMember.body).not.toEqual([expect.objectContaining({ id: child.id })]);

    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${root.id}/inactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${child.id}/reactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(409);
    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${root.id}/reactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${child.id}/reactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
  });

  it("blocks cross-organization organizationId, unitId, parentId and Organization changes", async () => {
    const ownerA = await createUser(app, "owner-a");
    const ownerB = await createUser(app, "owner-b");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    const unitA = await createUnit(app, orgA.organization.id, ownerA.id, "A");
    const unitB = await createUnit(app, orgB.organization.id, ownerB.id, "B");

    await request(app)
      .get(`/api/organizations/${orgB.organization.id}/organizational-units`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(403);
    await request(app)
      .get(`/api/organizations/${orgA.organization.id}/organizational-units/${unitB.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(404);
    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/organizational-units/${unitA.id}/move`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ parentId: unitB.id })
      .expect(404);
    await request(app)
      .patch(`/api/organizations/${orgA.organization.id}/organizational-units/${unitA.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({ organizationId: orgB.organization.id })
      .expect(400);

    await expect(
      database.pool.query("UPDATE organizational_units SET organization_id = $1 WHERE id = $2", [
        orgB.organization.id,
        unitA.id
      ])
    ).rejects.toThrow();
  });

  it("blocks normal operations for archived Organizations but allows administrative reads", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const unit = await createUnit(app, organization.id, owner.id, "ARCHIVED");

    await request(app)
      .post(`/api/organizations/${organization.id}/archive`)
      .set(platformHeaders)
      .expect(200);

    await request(app)
      .get(`/api/organizations/${organization.id}/organizational-units`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units`)
      .set({ "x-dev-user-id": owner.id })
      .send(unitInput("ARCHIVED-NEW"))
      .expect(403);
    await request(app)
      .patch(`/api/organizations/${organization.id}/organizational-units/${unit.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({ name: "Blocked" })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${unit.id}/move`)
      .set({ "x-dev-user-id": owner.id })
      .send({ parentId: null })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${unit.id}/inactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);
    await request(app)
      .post(`/api/platform/organizations/${organization.id}/organizational-units/admin-read`)
      .set(platformHeaders)
      .send({ reason: "support archived organization" })
      .expect(200);
  });

  it("serializes concurrent child creation and parent inactivation", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const parent = await createUnit(app, organization.id, owner.id, "CONCURRENT-PARENT");

    const results = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/organizational-units`)
        .set({ "x-dev-user-id": owner.id })
        .send(unitInput("CONCURRENT-CHILD", { parentId: parent.id })),
      request(app)
        .post(`/api/organizations/${organization.id}/organizational-units/${parent.id}/inactivate`)
        .set({ "x-dev-user-id": owner.id })
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    await expect(
      countRows(
        "organizational_units parent JOIN organizational_units child ON child.parent_id = parent.id",
        "parent.id = $1 AND parent.status = 'inactive' AND child.status = 'active'",
        [parent.id]
      )
    ).resolves.toBe(0);
  });

  it("serializes concurrent moves that could create cycles", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const unitA = await createUnit(app, organization.id, owner.id, "CYCLE-A");
    const unitB = await createUnit(app, organization.id, owner.id, "CYCLE-B");

    const results = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/organizational-units/${unitA.id}/move`)
        .set({ "x-dev-user-id": owner.id })
        .send({ parentId: unitB.id }),
      request(app)
        .post(`/api/organizations/${organization.id}/organizational-units/${unitB.id}/move`)
        .set({ "x-dev-user-id": owner.id })
        .send({ parentId: unitA.id })
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  });

  it("blocks simultaneous moves that would exceed maximum depth", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    let parent = await createUnit(app, organization.id, owner.id, "DEPTH-MOVE-1");

    for (let level = 2; level <= 9; level += 1) {
      parent = await createUnit(app, organization.id, owner.id, `DEPTH-MOVE-${level}`, {
        parentId: parent.id
      });
    }

    const moveRoot = await createUnit(app, organization.id, owner.id, "DEPTH-SUBTREE");
    const moveChild = await createUnit(app, organization.id, owner.id, "DEPTH-SUBTREE-CHILD", {
      parentId: moveRoot.id
    });

    const results = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/organizational-units/${moveRoot.id}/move`)
        .set({ "x-dev-user-id": owner.id })
        .send({ parentId: parent.id }),
      request(app)
        .post(`/api/organizations/${organization.id}/organizational-units/${moveRoot.id}/move`)
        .set({ "x-dev-user-id": owner.id })
        .send({ parentId: parent.id })
    ]);

    expect(results.map((result) => result.status)).toEqual([409, 409]);
    await request(app)
      .get(`/api/organizations/${organization.id}/organizational-units/${moveChild.id}`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200)
      .expect((response) => {
        expect(response.body.parentId).toBe(moveRoot.id);
      });
  });

  it("keeps manager details out of audit metadata", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const unit = await createUnit(app, organization.id, owner.id, "AUDIT-MANAGER", {
      managerName: "Confidential Manager",
      managerEmail: "confidential.manager@example.com"
    });

    await request(app)
      .patch(`/api/organizations/${organization.id}/organizational-units/${unit.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        managerName: "Changed Confidential Manager",
        managerEmail: "changed.confidential.manager@example.com"
      })
      .expect(200);

    const history = await request(app)
      .get(`/api/organizations/${organization.id}/organizational-units/history`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    expect(JSON.stringify(history.body)).not.toContain("confidential.manager@example.com");
    expect(JSON.stringify(history.body)).not.toContain("Confidential Manager");
  });

  it("persists units after recreating the application and never physically deletes inactive units", async () => {
    const owner = await createUser(app, "owner");
    const { organization } = await createOrganization(app, owner.id);
    const unit = await createUnit(app, organization.id, owner.id, "PERSIST");
    await request(app)
      .post(`/api/organizations/${organization.id}/organizational-units/${unit.id}/inactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);

    await expect(countRows("organizational_units", "id = $1", [unit.id])).resolves.toBe(1);

    const recreated = createApp(database);
    await request(recreated)
      .get(`/api/organizations/${organization.id}/organizational-units/tree`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([expect.objectContaining({ id: unit.id })]);
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
