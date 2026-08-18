import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fingerprint } from "../../src/server/core/canonical-hash";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createHiredFixture,
  createOnboarding,
  createRecruitmentEmployment,
  createUnrelatedEmployment,
  getOnboarding,
  linkEmployment,
  userHeaders
} from "./helpers";

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("Fase 26 - idempotencia, IDOR, mass assignment e privacidade do vinculo", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("exige Idempotency-Key", async () => {
    const fixture = await createHiredFixture(database, "idem-missing-key");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/onboardings/${onboarding.body.id}/employment-link`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ employmentId: employment.body.id })
      .expect(400);
  });

  it("replay idempotente retorna mesmo resultado e payload diferente conflita", async () => {
    const fixture = await createHiredFixture(database, "idem-replay");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employmentA = await createRecruitmentEmployment(fixture).expect(201);
    const key = crypto.randomUUID();

    const first = await linkEmployment(
      fixture,
      onboarding.body.id,
      employmentA.body.id,
      fixture.ownerId,
      key
    ).expect(200);
    expect(first.body.employmentId).toBe(employmentA.body.id);

    const replay = await linkEmployment(
      fixture,
      onboarding.body.id,
      employmentA.body.id,
      fixture.ownerId,
      key
    ).expect(200);
    expect(replay.body.idempotentReplay).toBe(true);
    expect(replay.body.employmentId).toBe(employmentA.body.id);

    // mesma chave, employmentId diferente -> fingerprint diverge -> conflito
    const employmentB = await createUnrelatedEmployment(fixture).expect(201);
    await linkEmployment(
      fixture,
      onboarding.body.id,
      employmentB.body.id,
      fixture.ownerId,
      key
    ).expect(409);
  });

  it("idempotencia pending e failed retornam conflitos seguros", async () => {
    const fixture = await createHiredFixture(database, "idem-states");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);
    const pendingKey = `pending-${crypto.randomUUID()}`;
    const failedKey = `failed-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const payload = { onboardingId: onboarding.body.id, employmentId: employment.body.id };
    const requestFingerprint = fingerprint(payload);

    await database.pool.query(
      `
        INSERT INTO onboarding_idempotency_keys (
          id, organization_id, operation, scope_id, key_hash, request_fingerprint,
          status, result_resource_id, failure_category, created_at, completed_at, failed_at
        )
        VALUES
          ($1, $2, 'link_employment', $3, $4, $6, 'pending', NULL, NULL, $7, NULL, NULL),
          ($5, $2, 'link_employment', $3, $8, $6, 'failed', NULL, 'simulated', $7, NULL, $7)
      `,
      [
        `onbidem-${crypto.randomUUID()}`,
        fixture.organizationId,
        onboarding.body.id,
        sha256Hex(pendingKey),
        `onbidem-${crypto.randomUUID()}`,
        requestFingerprint,
        now,
        sha256Hex(failedKey)
      ]
    );

    await linkEmployment(
      fixture,
      onboarding.body.id,
      employment.body.id,
      fixture.ownerId,
      pendingKey
    ).expect(409);
    await linkEmployment(
      fixture,
      onboarding.body.id,
      employment.body.id,
      fixture.ownerId,
      failedKey
    ).expect(409);

    // uma chave nova ainda funciona normalmente apos os estados simulados acima.
    const fresh = await linkEmployment(fixture, onboarding.body.id, employment.body.id).expect(200);
    expect(fresh.body.employmentId).toBe(employment.body.id);
  });

  it("bloqueia IDOR: onboardingId inexistente e employmentId inexistente", async () => {
    const fixture = await createHiredFixture(database, "idor");
    const onboarding = await createOnboarding(fixture).expect(201);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/onboardings/onb_does_not_exist/employment-link`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ employmentId: "emp_does_not_exist" })
      .expect(404);

    await linkEmployment(fixture, onboarding.body.id, "emp_does_not_exist").expect(404);
  });

  it("bloqueia mass assignment: nenhum campo alem de employmentId e aceito", async () => {
    const fixture = await createHiredFixture(database, "mass-assignment");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);

    for (const extra of [
      { organizationId: "org_outro" },
      { status: "completed" },
      { candidateApplicationId: "app_outro" },
      { candidateId: "cand_outro" },
      { createdByUserId: "user_outro" }
    ]) {
      await request(fixture.app)
        .post(
          `/api/organizations/${fixture.organizationId}/onboardings/${onboarding.body.id}/employment-link`
        )
        .set(userHeaders(fixture.ownerId))
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ employmentId: employment.body.id, ...extra })
        .expect(400);
    }

    const fetched = await getOnboarding(fixture, onboarding.body.id).expect(200);
    expect(fetched.body.employmentId).toBeNull();
  });

  it("resposta e auditoria do vinculo nao contem PII", async () => {
    const fixture = await createHiredFixture(database, "pii");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);
    const linked = await linkEmployment(fixture, onboarding.body.id, employment.body.id).expect(
      200
    );
    expect(JSON.stringify(linked.body)).not.toContain("@example.com");

    const auditRows = await database.pool.query(
      "SELECT metadata, reason FROM audit_events WHERE action LIKE 'onboarding.employment_link%'"
    );
    const serialized = JSON.stringify(auditRows.rows);
    expect(serialized).not.toContain("@example.com");
    expect(serialized).not.toContain("Maria da Silva");
  });
});
