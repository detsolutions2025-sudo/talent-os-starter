import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fingerprint } from "../../src/server/core/canonical-hash";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createHiredFixture,
  createRecruitmentEmployment,
  employmentAction,
  userHeaders
} from "./helpers";

describe("Fase 24 - idempotencia, tenant e zero automacao", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("replay idempotente retorna mesmo Employment e payload diferente conflita", async () => {
    const fixture = await createHiredFixture(database, "idem-replay");
    const key = crypto.randomUUID();
    const first = await createRecruitmentEmployment(fixture, key).expect(201);
    const replay = await createRecruitmentEmployment(fixture, key).expect(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.idempotentReplay).toBe(true);
    await createRecruitmentEmployment(fixture, key, { effectiveStartDate: "2026-10-01" }).expect(
      409
    );
  });

  it("idempotencia pending e failed retornam conflitos seguros", async () => {
    const fixture = await createHiredFixture(database, "idem-states");
    const pendingKey = `pending-${crypto.randomUUID()}`;
    const failedKey = `failed-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const payload = {
      operation: "create_employment",
      organizationPersonId: null,
      originType: "recruitment",
      originReasonHash: sha256Hex("Contratacao aprovada pela empresa."),
      originCandidateId: null,
      candidateApplicationId: fixture.applicationId,
      proposalVersionId: null,
      decisionAt: null,
      effectiveStartDate: "2026-09-01",
      displayNameHash: null,
      preferredNameHash: null,
      primaryEmailHash: null
    };
    await database.pool.query(
      `
        INSERT INTO employment_idempotency_keys (
          id, organization_id, operation, scope_id, key_hash, request_fingerprint,
          status, result_resource_id, error_category, created_at, completed_at, failed_at
        )
        VALUES
          ($1, $2, 'create_person_and_employment', $3, $4, $5, 'pending', NULL, NULL, $8, NULL, NULL),
          ($6, $2, 'create_person_and_employment', $3, $7, $5, 'failed', NULL, 'simulated', $8, NULL, $8)
      `,
      [
        `idem-${crypto.randomUUID()}`,
        fixture.organizationId,
        fixture.applicationId,
        sha256Hex(pendingKey),
        fingerprint({ ...payload, operation: "create_person_and_employment" }),
        `idem-${crypto.randomUUID()}`,
        sha256Hex(failedKey),
        now
      ]
    );

    await createRecruitmentEmployment(fixture, pendingKey).expect(409);
    await createRecruitmentEmployment(fixture, failedKey).expect(409);
  });

  it("bloqueia cross-tenant por candidateApplicationId e employmentId", async () => {
    const fixture = await createHiredFixture(database, "tenant-a");
    const other = await createHiredFixture(database, "tenant-b");
    const created = await createRecruitmentEmployment(other).expect(201);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        originType: "recruitment",
        candidateApplicationId: other.applicationId,
        effectiveStartDate: "2026-09-01",
        originReason: "IDOR."
      })
      .expect(404);

    await employmentAction(fixture, created.body.id, "activate").expect(404);
  });

  it("hired, proposal aceita e onboarding completo nao criam Employment automaticamente", async () => {
    const fixture = await createHiredFixture(database, "zero-auto");
    const afterHire = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM employments WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(afterHire.rows[0].count).toBe(0);

    const onboarding = await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/onboarding`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ expectedPersonStartDate: "2026-09-01", initialTasks: [] })
      .expect(201);
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/onboardings/${onboarding.body.id}/start`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(200);
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/onboardings/${onboarding.body.id}/complete`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(200);

    const afterOnboarding = await database.pool.query(
      `
        SELECT
          (SELECT COUNT(*)::int FROM employments WHERE organization_id = $1) AS employments,
          (SELECT COUNT(*)::int FROM users) AS users,
          (SELECT COUNT(*)::int FROM memberships) AS memberships
      `,
      [fixture.organizationId]
    );
    expect(afterOnboarding.rows[0].employments).toBe(0);
    expect(afterOnboarding.rows[0].users).toBeGreaterThanOrEqual(1);
    expect(afterOnboarding.rows[0].memberships).toBeGreaterThanOrEqual(1);
  });
});

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
