import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/app";
import { MemoryCoreRepository } from "../../src/server/core/memory-repository";
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

describe("phase 1 security review coverage", () => {
  let service: CoreService;
  let repository: MemoryCoreRepository;
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    process.env.APP_ENV = "test";
    repository = new MemoryCoreRepository();
    service = createCoreService(repository);
    app = createServer(service);
  });

  it("rejects temporary development headers in production", async () => {
    process.env.APP_ENV = "production";

    await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "Prod Org", slug: "prod-org", initialOwnerUserId: "usr_000001" })
      .expect(403)
      .expect((response) => {
        expect(response.body.error.code).toBe("temporary_auth_disabled");
      });
  });

  it("rejects /api/dev routes in production", async () => {
    process.env.APP_ENV = "production";

    await request(app)
      .get("/api/dev/me")
      .set({ "x-dev-user-id": "usr_000001" })
      .expect(403)
      .expect((response) => {
        expect(response.body.error.code).toBe("temporary_auth_disabled");
      });
  });

  it("does not grant Platform Admin when x-dev-platform-admin is manipulated", async () => {
    const user = await createUser(app, "regular@example.com");

    await request(app)
      .post("/api/dev/users")
      .set({ "x-dev-platform-admin": "yes", "x-dev-user-id": user.id })
      .send({ name: "Blocked", email: "blocked@example.com" })
      .expect(403)
      .expect((response) => {
        expect(response.body.error.code).toBe("organization_context_required");
      });
  });

  it("allows only Platform Admin to read audit events", async () => {
    const owner = await createUser(app, "owner@example.com");
    await createOrganization(app, owner.id);

    await request(app).get("/api/audit-events").set({ "x-dev-user-id": owner.id }).expect(403);

    await request(app).get("/api/audit-events").set(platformHeaders).expect(200);
  });

  it("does not store sensitive request values in denied audit metadata", async () => {
    const owner = await createUser(app, "owner@example.com");
    const member = await createUser(app, "member@example.com");
    const result = await createOrganization(app, owner.id);

    await request(app)
      .post(`/api/organizations/${result.organization.id}/memberships`)
      .set({ "x-dev-user-id": owner.id })
      .send({ userId: member.id, role: "member" })
      .expect(201);

    await request(app)
      .patch(`/api/organizations/${result.organization.id}`)
      .set({ "x-dev-user-id": member.id })
      .send({ description: "token=super-secret-value password=also-secret" })
      .expect(403);

    const serializedAudit = JSON.stringify(await service.auditEvents());

    expect(serializedAudit).not.toContain("super-secret-value");
    expect(serializedAudit).not.toContain("also-secret");
  });

  it("keeps Membership responses scoped to the validated Organization", async () => {
    const ownerA = await createUser(app, "owner-a@example.com");
    const ownerB = await createUser(app, "owner-b@example.com");
    const orgA = await createOrganization(app, ownerA.id, "org-a");
    await createOrganization(app, ownerB.id, "org-b");

    const response = await request(app)
      .get(`/api/organizations/${orgA.organization.id}/memberships`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].organizationId).toBe(orgA.organization.id);
    expect(JSON.stringify(response.body)).not.toContain(ownerB.email);
  });

  it("keeps an active owner when simultaneous last-owner changes are attempted", async () => {
    const owner = await createUser(app, "owner@example.com");
    const result = await createOrganization(app, owner.id);
    const headers = { "x-dev-user-id": owner.id };

    await Promise.all([
      request(app)
        .patch(`/api/memberships/${result.membership.id}`)
        .set(headers)
        .send({ status: "inactive" })
        .expect(409),
      request(app)
        .patch(`/api/memberships/${result.membership.id}`)
        .set(headers)
        .send({ role: "member" })
        .expect(409)
    ]);

    const activeOwners = repository
      .snapshot()
      .memberships.filter(
        (membership) =>
          membership.organizationId === result.organization.id &&
          membership.role === "owner" &&
          membership.status === "active"
      );

    expect(activeOwners).toHaveLength(1);
  });
});
