import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  applicationPayload,
  createApp,
  createPublicJobOpeningFixture,
  submitApplication
} from "./helpers";

describe("Fase 17 - Candidatura Publica - idempotencia (SPEC-020 v1.1, secao 15)", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  beforeEach(() => {
    app = createApp(database);
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("recusa submissao sem Idempotency-Key", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "idem-missing");
    const response = await submitApplication(app, fixture.slug, applicationPayload(), "");
    expect(response.status).toBe(400);
  });

  it("reenvio com a mesma Idempotency-Key retorna o mesmo submissionId, sem duplicar dados", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "idem-replay");
    const key = crypto.randomUUID();
    const payload = applicationPayload();

    const first = await submitApplication(app, fixture.slug, payload, key).expect(201);
    const second = await submitApplication(app, fixture.slug, payload, key).expect(201);

    expect(second.body.submissionId).toBe(first.body.submissionId);

    const candidates = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidates WHERE organization_id = $1 AND normalized_email = $2",
      [fixture.organizationId, String(payload.email).toLowerCase()]
    );
    expect(candidates.rows[0].count).toBe(1);

    const applications = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(applications.rows[0].count).toBe(1);
  });

  it("duas requisicoes concorrentes com a mesma Idempotency-Key nunca duplicam Candidate/CandidateApplication", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "idem-concurrent");
    const key = crypto.randomUUID();
    const payload = applicationPayload();

    const [first, second] = await Promise.all([
      submitApplication(app, fixture.slug, payload, key),
      submitApplication(app, fixture.slug, payload, key)
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses.every((status) => status === 201 || status === 409)).toBe(true);
    expect(statuses).toContain(201);

    const applications = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(applications.rows[0].count).toBe(1);
  });

  it("mesma Idempotency-Key com payload semanticamente diferente retorna conflito seguro, sem executar nova submissao", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "idem-fingerprint");
    const key = crypto.randomUUID();

    await submitApplication(
      app,
      fixture.slug,
      applicationPayload({ email: "primeira@example.com" }),
      key
    ).expect(201);

    const conflicting = await submitApplication(
      app,
      fixture.slug,
      applicationPayload({ email: "segunda@example.com" }),
      key
    );
    expect(conflicting.status).toBe(409);

    const applications = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(applications.rows[0].count).toBe(1);
  });

  it("duas Idempotency-Key diferentes para o mesmo Candidate + Vaga sao protegidas pela unicidade de CandidateApplication ativa, nao pela idempotencia", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "idem-different-keys");
    const email = `${crypto.randomUUID()}@example.com`;

    await submitApplication(
      app,
      fixture.slug,
      applicationPayload({ email }),
      crypto.randomUUID()
    ).expect(201);
    const second = await submitApplication(
      app,
      fixture.slug,
      applicationPayload({ email }),
      crypto.randomUUID()
    );
    expect(second.status).toBe(409);

    const applications = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(applications.rows[0].count).toBe(1);
  });
});
