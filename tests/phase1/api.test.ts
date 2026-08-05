import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/app";
import { createCoreService, type CoreService } from "../../src/server/core/service";

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
    .send({
      name: `Organization ${slug}`,
      slug,
      initialOwnerUserId
    })
    .expect(201);

  return response.body as {
    organization: { id: string; status: string; slug: string };
    membership: { id: string; role: string; status: string };
  };
}

describe("phase 1 multi-company API", () => {
  let service: CoreService;
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    process.env.APP_ENV = "test";
    service = createCoreService();
    app = createServer(service);
  });

  it("creates an Organization and first owner atomically", async () => {
    const owner = await createUser(app, "Owner@Example.com ");
    const result = await createOrganization(app, owner.id);

    expect(result.organization.status).toBe("active");
    expect(result.membership.role).toBe("owner");
    expect(result.membership.status).toBe("active");
    expect(service.getStore().snapshot().memberships).toHaveLength(1);
  });

  it("rolls back when Organization creation fails", async () => {
    const owner = await createUser(app, "owner@example.com");
    await createOrganization(app, owner.id, "duplicate");

    await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "Duplicate", slug: "duplicate", initialOwnerUserId: owner.id })
      .expect(409);

    expect(service.getStore().snapshot().organizations).toHaveLength(1);
    expect(service.getStore().snapshot().memberships).toHaveLength(1);
  });

  it("rejects a missing initial owner without creating Organization", async () => {
    await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "No Owner", slug: "no-owner", initialOwnerUserId: "usr_missing" })
      .expect(400);

    expect(service.getStore().snapshot().organizations).toHaveLength(0);
  });

  it("rejects an inactive initial owner without creating Organization", async () => {
    const owner = await createUser(app, "inactive@example.com");
    service.getStore().snapshot().users[0].status = "inactive";

    await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "Inactive Owner", slug: "inactive-owner", initialOwnerUserId: owner.id })
      .expect(400);

    expect(service.getStore().snapshot().organizations).toHaveLength(0);
  });

  it("creates exactly one first active owner", async () => {
    const owner = await createUser(app, "owner@example.com");
    const result = await createOrganization(app, owner.id);
    const owners = service
      .getStore()
      .snapshot()
      .memberships.filter(
        (membership) =>
          membership.organizationId === result.organization.id &&
          membership.role === "owner" &&
          membership.status === "active"
      );

    expect(owners).toHaveLength(1);
  });

  it("normalizes email and rejects duplicates", async () => {
    const user = await createUser(app, " User@Example.COM ");

    expect(user.email).toBe("user@example.com");

    await request(app)
      .post("/api/dev/users")
      .set(platformHeaders)
      .send({ name: "Duplicate", email: "user@example.com" })
      .expect(409);
  });

  it("blocks inactive User", async () => {
    const owner = await createUser(app, "owner@example.com");
    const result = await createOrganization(app, owner.id);
    service.getStore().snapshot().users[0].status = "inactive";

    await request(app)
      .get(`/api/organizations/${result.organization.id}`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);
  });

  it("blocks inactive Membership", async () => {
    const owner = await createUser(app, "owner@example.com");
    const result = await createOrganization(app, owner.id);
    service.getStore().snapshot().memberships[0].status = "inactive";

    await request(app)
      .get(`/api/organizations/${result.organization.id}`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);
  });

  it("allows access to own Organization and denies another Organization", async () => {
    const ownerA = await createUser(app, "a@example.com", "Owner A");
    const ownerB = await createUser(app, "b@example.com", "Owner B");
    const orgA = await createOrganization(app, ownerA.id, "org-a");
    const orgB = await createOrganization(app, ownerB.id, "org-b");

    await request(app)
      .get(`/api/organizations/${orgA.organization.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(200);

    await request(app)
      .get(`/api/organizations/${orgB.organization.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(403);
  });

  it("does not allow manual Organization ID changes to reveal data", async () => {
    const ownerA = await createUser(app, "a@example.com", "Owner A");
    const ownerB = await createUser(app, "b@example.com", "Owner B");
    await createOrganization(app, ownerA.id, "org-a");
    const orgB = await createOrganization(app, ownerB.id, "org-b");

    await request(app)
      .get(`/api/organizations/${orgB.organization.id}/memberships`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(403);
  });

  it("blocks archived Organization as current context and normal operations", async () => {
    const owner = await createUser(app, "owner@example.com");
    const result = await createOrganization(app, owner.id);

    await request(app)
      .post(`/api/organizations/${result.organization.id}/archive`)
      .set(platformHeaders)
      .expect(200);

    await request(app)
      .get(`/api/organizations/${result.organization.id}`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);

    await request(app)
      .get(`/api/organizations/${result.organization.id}/memberships`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);
  });

  it("allows only Platform Admin to archive and reactivate Organization", async () => {
    const owner = await createUser(app, "owner@example.com");
    const admin = await createUser(app, "admin@example.com");
    const member = await createUser(app, "member@example.com");
    const result = await createOrganization(app, owner.id);

    await request(app)
      .post(`/api/organizations/${result.organization.id}/memberships`)
      .set({ "x-dev-user-id": owner.id })
      .send({ userId: admin.id, role: "admin" })
      .expect(201);
    await request(app)
      .post(`/api/organizations/${result.organization.id}/memberships`)
      .set({ "x-dev-user-id": owner.id })
      .send({ userId: member.id, role: "member" })
      .expect(201);

    await request(app)
      .post(`/api/organizations/${result.organization.id}/archive`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${result.organization.id}/archive`)
      .set({ "x-dev-user-id": admin.id })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${result.organization.id}/archive`)
      .set({ "x-dev-user-id": member.id })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${result.organization.id}/archive`)
      .set(platformHeaders)
      .expect(200);
    await request(app)
      .post(`/api/organizations/${result.organization.id}/reactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${result.organization.id}/reactivate`)
      .set(platformHeaders)
      .expect(200);
  });

  it("rejects duplicate Membership", async () => {
    const owner = await createUser(app, "owner@example.com");
    const user = await createUser(app, "member@example.com");
    const result = await createOrganization(app, owner.id);

    await request(app)
      .post(`/api/organizations/${result.organization.id}/memberships`)
      .set({ "x-dev-user-id": owner.id })
      .send({ userId: user.id, role: "member" })
      .expect(201);
    await request(app)
      .post(`/api/organizations/${result.organization.id}/memberships`)
      .set({ "x-dev-user-id": owner.id })
      .send({ userId: user.id, role: "member" })
      .expect(409);
  });

  it("blocks member from managing Memberships and admin from managing owner", async () => {
    const owner = await createUser(app, "owner@example.com");
    const admin = await createUser(app, "admin@example.com");
    const member = await createUser(app, "member@example.com");
    const target = await createUser(app, "target@example.com");
    const result = await createOrganization(app, owner.id);

    const adminMembership = await request(app)
      .post(`/api/organizations/${result.organization.id}/memberships`)
      .set({ "x-dev-user-id": owner.id })
      .send({ userId: admin.id, role: "admin" })
      .expect(201);
    await request(app)
      .post(`/api/organizations/${result.organization.id}/memberships`)
      .set({ "x-dev-user-id": owner.id })
      .send({ userId: member.id, role: "member" })
      .expect(201);

    await request(app)
      .post(`/api/organizations/${result.organization.id}/memberships`)
      .set({ "x-dev-user-id": member.id })
      .send({ userId: target.id, role: "member" })
      .expect(403);

    await request(app)
      .patch(`/api/memberships/${result.membership.id}`)
      .set({ "x-dev-user-id": admin.id })
      .send({ role: "member" })
      .expect(403);

    await request(app)
      .patch(`/api/memberships/${adminMembership.body.id}`)
      .set({ "x-dev-user-id": admin.id })
      .send({ role: "owner" })
      .expect(403);
  });

  it("prevents deactivating or demoting the last active owner", async () => {
    const owner = await createUser(app, "owner@example.com");
    const result = await createOrganization(app, owner.id);

    await request(app)
      .patch(`/api/memberships/${result.membership.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({ status: "inactive" })
      .expect(409);

    await request(app)
      .patch(`/api/memberships/${result.membership.id}`)
      .set({ "x-dev-user-id": owner.id })
      .send({ role: "admin" })
      .expect(409);
  });

  it("records audit for relevant denials", async () => {
    const ownerA = await createUser(app, "a@example.com", "Owner A");
    const ownerB = await createUser(app, "b@example.com", "Owner B");
    const orgB = await createOrganization(app, ownerB.id, "org-b");
    await createOrganization(app, ownerA.id, "org-a");

    await request(app)
      .get(`/api/organizations/${orgB.organization.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(403);

    expect(service.auditEvents().some((event) => event.result === "denied")).toBe(true);
  });

  it("does not mix data from different Organizations in responses", async () => {
    const ownerA = await createUser(app, "a@example.com", "Owner A");
    const ownerB = await createUser(app, "b@example.com", "Owner B");
    const orgA = await createOrganization(app, ownerA.id, "org-a");
    await createOrganization(app, ownerB.id, "org-b");

    const response = await request(app)
      .get("/api/organizations")
      .set({ "x-dev-user-id": ownerA.id })
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(orgA.organization.id);
  });
});
