import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fingerprint } from "../../src/server/core/canonical-hash";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { createActiveEmploymentFixture, createPlan, platformHeaders, userHeaders } from "./helpers";

describe("Fase 25 - idempotencia, tenant e privacidade", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("replay idempotente retorna o mesmo plano; payload diferente conflita", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-replay");
    const key = crypto.randomUUID();
    const first = await createPlan(fixture, key).expect(201);
    const replay = await createPlan(fixture, key).expect(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.idempotentReplay).toBe(true);
    await createPlan(fixture, key, { title: "Titulo diferente" }).expect(409);
  });

  it("idempotencia pending e failed retornam conflitos seguros", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-states");
    const pendingKey = `pending-${crypto.randomUUID()}`;
    const failedKey = `failed-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const payload = {
      operation: "create_plan",
      employmentId: fixture.employmentId,
      titleHash: sha256Hex("Plano de desenvolvimento"),
      purposeHash: sha256Hex("Evoluir na funcao."),
      assigneeMembershipId: null
    };
    await database.pool.query(
      `
        INSERT INTO development_retention_idempotency_keys (
          id, organization_id, operation, scope_id, key_hash, request_fingerprint, status,
          result_resource_id, error_category, created_at, completed_at, failed_at
        )
        VALUES
          ($1, $2, 'create_plan', $3, $4, $5, 'pending', NULL, NULL, $8, NULL, NULL),
          ($6, $2, 'create_plan', $3, $7, $5, 'failed', NULL, 'simulated', $8, NULL, $8)
      `,
      [
        `idem-${crypto.randomUUID()}`,
        fixture.organizationId,
        fixture.employmentId,
        sha256Hex(pendingKey),
        fingerprint(payload),
        `idem-${crypto.randomUUID()}`,
        sha256Hex(failedKey),
        now
      ]
    );

    await createPlan(fixture, pendingKey).expect(409);
    await createPlan(fixture, failedKey).expect(409);
  });

  it("admin-read exige Platform Admin, motivo, e retorna DTO minimizado sem PII", async () => {
    const fixture = await createActiveEmploymentFixture(database, "admin-read");
    await createPlan(fixture).expect(201);

    await request(fixture.app)
      .post(
        `/api/platform/organizations/${fixture.organizationId}/development-retention/admin-read`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "x" })
      .expect(403);

    const adminRead = await request(fixture.app)
      .post(
        `/api/platform/organizations/${fixture.organizationId}/development-retention/admin-read`
      )
      .set(platformHeaders)
      .send({ reason: "Auditoria operacional." })
      .expect(200);
    expect(JSON.stringify(adminRead.body)).not.toContain("Plano de desenvolvimento");
    expect(JSON.stringify(adminRead.body)).not.toContain("title");
    expect(JSON.stringify(adminRead.body)).not.toContain("purpose");
  });

  it("Idempotency-Key ausente e recusada", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-missing-header");
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/development-plans`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ title: "Sem header" })
      .expect(400);
  });

  it("nenhuma PII proibida aparece nas colunas fisicas do modulo", async () => {
    const planColumns = await database.pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'development_plans' ORDER BY column_name`
    );
    const concernColumns = await database.pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'retention_concerns' ORDER BY column_name`
    );
    const forbiddenTerms = [
      "salary",
      "compensation",
      "bank",
      "document",
      "health",
      "medical",
      "score",
      "rating",
      "risk_level",
      "probability"
    ];
    const allColumns = [
      ...planColumns.rows.map((r) => String(r.column_name)),
      ...concernColumns.rows.map((r) => String(r.column_name))
    ];
    for (const forbidden of forbiddenTerms) {
      expect(allColumns.some((column) => column.includes(forbidden))).toBe(false);
    }
  });
});

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
