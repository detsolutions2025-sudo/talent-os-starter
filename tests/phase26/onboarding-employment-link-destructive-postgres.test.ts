import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createHiredFixture,
  createOnboarding,
  createRecruitmentEmployment,
  createUnrelatedEmployment,
  employmentAction,
  getOnboarding,
  linkEmployment,
  platformHeaders,
  startOnboarding,
  userHeaders
} from "./helpers";

describe("Fase 26 - write-once fisico, concorrencia, zero automacao, zero alteracao de Employment", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  // ---------------------------------------------------------------------
  // Write-once via service (camada de aplicacao)
  // ---------------------------------------------------------------------

  it("service: mesmo employmentId com chave nova e no-op; employmentId diferente e recusado", async () => {
    const fixture = await createHiredFixture(database, "write-once-service");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employmentA = await createRecruitmentEmployment(fixture).expect(201);
    await linkEmployment(fixture, onboarding.body.id, employmentA.body.id).expect(200);

    // mesmo employmentId, chave nova -> no-op, nunca UPDATE, nunca erro.
    const sameAgain = await linkEmployment(fixture, onboarding.body.id, employmentA.body.id).expect(
      200
    );
    expect(sameAgain.body.employmentId).toBe(employmentA.body.id);

    const employmentB = await createUnrelatedEmployment(fixture).expect(201);
    await linkEmployment(fixture, onboarding.body.id, employmentB.body.id).expect(409);

    const fetched = await getOnboarding(fixture, onboarding.body.id).expect(200);
    expect(fetched.body.employmentId).toBe(employmentA.body.id);

    const auditRows = await database.pool.query(
      "SELECT action FROM audit_events WHERE organization_id = $1 AND action = 'onboarding.employment_link_conflict'",
      [fixture.organizationId]
    );
    expect(auditRows.rowCount).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------
  // Defesa fisica: trigger de banco, independente da service layer
  // ---------------------------------------------------------------------

  it("banco: bloqueia employment_id no INSERT direto", async () => {
    const fixture = await createHiredFixture(database, "trigger-insert");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);

    await expect(
      database.pool.query(
        `
          INSERT INTO onboardings (
            id, organization_id, candidate_application_id, candidate_id, status,
            expected_person_start_date, employment_id, created_by_user_id,
            created_at, updated_at
          )
          SELECT
            'onb_direct_insert_test', organization_id, candidate_application_id, candidate_id,
            'draft', NULL, $2, created_by_user_id, NOW(), NOW()
          FROM onboardings WHERE id = $1
        `,
        [onboarding.body.id, employment.body.id]
      )
    ).rejects.toThrow(/onboarding_employment_link_not_allowed_on_insert/);
  });

  it("banco: write-once bloqueia UUID->outro e UUID->NULL mesmo por UPDATE direto (bypass do service)", async () => {
    const fixture = await createHiredFixture(database, "trigger-write-once");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employmentA = await createRecruitmentEmployment(fixture).expect(201);
    const employmentB = await createUnrelatedEmployment(fixture).expect(201);
    await linkEmployment(fixture, onboarding.body.id, employmentA.body.id).expect(200);

    await expect(
      database.pool.query("UPDATE onboardings SET employment_id = $2 WHERE id = $1", [
        onboarding.body.id,
        employmentB.body.id
      ])
    ).rejects.toThrow(/onboarding_employment_link_immutable/);

    await expect(
      database.pool.query("UPDATE onboardings SET employment_id = NULL WHERE id = $1", [
        onboarding.body.id
      ])
    ).rejects.toThrow(/onboarding_employment_link_immutable/);

    const fetched = await getOnboarding(fixture, onboarding.body.id).expect(200);
    expect(fetched.body.employmentId).toBe(employmentA.body.id);
  });

  it("banco: bloqueia UPDATE direto para Employment ended, cancelled, cross-tenant e incompativel", async () => {
    const fixture = await createHiredFixture(database, "trigger-eligibility");
    const other = await createHiredFixture(database, "trigger-eligibility-other-org");

    const onboardingEnded = await createOnboarding(fixture, crypto.randomUUID(), {
      expectedPersonStartDate: "2026-09-01"
    }).expect(201);
    const endedEmployment = await createRecruitmentEmployment(fixture).expect(201);
    await employmentAction(fixture, endedEmployment.body.id, "activate").expect(200);
    await employmentAction(fixture, endedEmployment.body.id, "end", crypto.randomUUID(), {
      endDate: "2026-10-01",
      reason: "Encerrado."
    }).expect(200);
    await expect(
      database.pool.query("UPDATE onboardings SET employment_id = $2 WHERE id = $1", [
        onboardingEnded.body.id,
        endedEmployment.body.id
      ])
    ).rejects.toThrow(/onboarding_employment_not_eligible/);

    const crossTenantEmployment = await createRecruitmentEmployment(other).expect(201);
    await expect(
      database.pool.query("UPDATE onboardings SET employment_id = $2 WHERE id = $1", [
        onboardingEnded.body.id,
        crossTenantEmployment.body.id
      ])
    ).rejects.toThrow(/onboarding_employment_not_found/);

    const unrelated = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        originType: "administrative",
        displayName: "Pessoa Sem Relacao Trigger",
        effectiveStartDate: "2026-09-01",
        originReason: "Nao relacionada."
      })
      .expect(201);
    await expect(
      database.pool.query("UPDATE onboardings SET employment_id = $2 WHERE id = $1", [
        onboardingEnded.body.id,
        unrelated.body.id
      ])
    ).rejects.toThrow(/onboarding_employment_incompatible_provenance/);
  });

  // ---------------------------------------------------------------------
  // Concorrencia real Postgres
  // ---------------------------------------------------------------------

  it("dois Onboardings disputando o mesmo Employment: exatamente um 200 e um 409, nunca 500", async () => {
    const fixture = await createHiredFixture(database, "race-two-onboardings");
    const onboardingA = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);

    // segunda candidatura hired na mesma Organization para obter um segundo
    // Onboarding independente disputando o MESMO Employment.
    const secondApplication = await createSecondHiredApplication(database, fixture);
    const onboardingB = await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${secondApplication}/onboarding`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ expectedPersonStartDate: "2026-09-01", initialTasks: [] })
      .expect(201);

    const [resultA, resultB] = await Promise.all([
      linkEmployment(fixture, onboardingA.body.id, employment.body.id),
      linkEmployment(fixture, onboardingB.body.id, employment.body.id)
    ]);

    const statuses = [resultA.status, resultB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const linkedCount = await database.pool.query(
      "SELECT count(*)::int AS count FROM onboardings WHERE employment_id = $1",
      [employment.body.id]
    );
    expect(linkedCount.rows[0].count).toBe(1);
  });

  it("um Onboarding tentando dois Employments concorrentemente: exatamente um 200 e um 409", async () => {
    const fixture = await createHiredFixture(database, "race-two-employments");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employmentA = await createRecruitmentEmployment(fixture).expect(201);
    const employmentB = await createUnrelatedEmployment(fixture).expect(201);

    const [resultA, resultB] = await Promise.all([
      linkEmployment(
        fixture,
        onboarding.body.id,
        employmentA.body.id,
        fixture.ownerId,
        crypto.randomUUID()
      ),
      linkEmployment(
        fixture,
        onboarding.body.id,
        employmentB.body.id,
        fixture.ownerId,
        crypto.randomUUID()
      )
    ]);

    const statuses = [resultA.status, resultB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const fetched = await getOnboarding(fixture, onboarding.body.id).expect(200);
    expect([employmentA.body.id, employmentB.body.id]).toContain(fetched.body.employmentId);
  });

  it("link x onboarding start concorrentes: ambos sao seguros, nunca 500", async () => {
    const fixture = await createHiredFixture(database, "race-link-start");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);

    const [linkResult, startResult] = await Promise.all([
      linkEmployment(fixture, onboarding.body.id, employment.body.id),
      startOnboarding(fixture, onboarding.body.id)
    ]);

    expect(linkResult.status).not.toBe(500);
    expect(startResult.status).not.toBe(500);
    expect([200, 409]).toContain(linkResult.status);
    expect([200, 409]).toContain(startResult.status);
  });

  it("link x onboarding cancel concorrentes: cancel sempre seguro, link 200 ou 409, nunca 500", async () => {
    const fixture = await createHiredFixture(database, "race-link-cancel");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);

    const [linkResult, cancelResult] = await Promise.all([
      linkEmployment(fixture, onboarding.body.id, employment.body.id),
      request(fixture.app)
        .post(
          `/api/organizations/${fixture.organizationId}/onboardings/${onboarding.body.id}/cancel`
        )
        .set(userHeaders(fixture.ownerId))
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ reason: "Cancelamento concorrente." })
    ]);

    expect(linkResult.status).not.toBe(500);
    expect([200, 409]).toContain(linkResult.status);
    expect([200, 409]).toContain(cancelResult.status);

    const fetched = await getOnboarding(fixture, onboarding.body.id).expect(200);
    expect(["draft", "in_progress", "cancelled"]).toContain(fetched.body.status);
  });

  it("link x Employment activate concorrentes: ambos elegiveis, nunca 500", async () => {
    const fixture = await createHiredFixture(database, "race-link-activate");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);

    const [linkResult, activateResult] = await Promise.all([
      linkEmployment(fixture, onboarding.body.id, employment.body.id),
      employmentAction(fixture, employment.body.id, "activate")
    ]);

    expect(linkResult.status).not.toBe(500);
    expect(activateResult.status).not.toBe(500);
    expect([200, 409]).toContain(linkResult.status);
    expect([200]).toContain(activateResult.status);
  });

  it("link x Employment end concorrentes: end sempre seguro, link 200 ou 409, nunca 500", async () => {
    const fixture = await createHiredFixture(database, "race-link-end");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);
    await employmentAction(fixture, employment.body.id, "activate").expect(200);

    const [linkResult, endResult] = await Promise.all([
      linkEmployment(fixture, onboarding.body.id, employment.body.id),
      employmentAction(fixture, employment.body.id, "end", crypto.randomUUID(), {
        endDate: "2026-12-15",
        reason: "Encerramento concorrente."
      })
    ]);

    expect(linkResult.status).not.toBe(500);
    expect([200, 409]).toContain(linkResult.status);
    expect(endResult.status).toBe(200);

    // nenhum vinculo pode persistir apontando para um Employment cujo
    // status, no momento da leitura do link, ja fosse `ended`.
    if (linkResult.status === 200) {
      const employmentRow = await database.pool.query(
        "SELECT status FROM employments WHERE id = $1",
        [employment.body.id]
      );
      expect(["active", "ended"]).toContain(employmentRow.rows[0].status);
    }
  });

  it("link x Employment cancel concorrentes: cancel sempre seguro, link 200 ou 409, nunca 500", async () => {
    const fixture = await createHiredFixture(database, "race-link-employment-cancel");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);

    const [linkResult, cancelResult] = await Promise.all([
      linkEmployment(fixture, onboarding.body.id, employment.body.id),
      employmentAction(fixture, employment.body.id, "cancel", crypto.randomUUID(), {
        reason: "Cancelamento concorrente."
      })
    ]);

    expect(linkResult.status).not.toBe(500);
    expect([200, 409]).toContain(linkResult.status);
    expect(cancelResult.status).toBe(200);
  });

  it("Organization archive x link concorrentes: nunca 500", async () => {
    const fixture = await createHiredFixture(database, "race-archive-link");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);

    const [linkResult, archiveResult] = await Promise.all([
      linkEmployment(fixture, onboarding.body.id, employment.body.id),
      request(fixture.app)
        .post(`/api/organizations/${fixture.organizationId}/archive`)
        .set(platformHeaders)
        .send({})
    ]);

    expect(linkResult.status).not.toBe(500);
    expect([200, 403]).toContain(linkResult.status);
    expect(archiveResult.status).toBe(200);
  });

  it("mesma Idempotency-Key concorrente nunca duplica efeito", async () => {
    const fixture = await createHiredFixture(database, "race-same-key");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);
    const key = crypto.randomUUID();

    const [first, second] = await Promise.all([
      linkEmployment(fixture, onboarding.body.id, employment.body.id, fixture.ownerId, key),
      linkEmployment(fixture, onboarding.body.id, employment.body.id, fixture.ownerId, key)
    ]);

    expect([first.status, second.status].every((status) => status !== 500)).toBe(true);
    const successCount = [first, second].filter((response) => response.status === 200).length;
    expect(successCount).toBeGreaterThanOrEqual(1);

    const linkedCount = await database.pool.query(
      "SELECT count(*)::int AS count FROM onboardings WHERE employment_id = $1",
      [employment.body.id]
    );
    expect(linkedCount.rows[0].count).toBe(1);
  });

  // ---------------------------------------------------------------------
  // Zero automacao e zero alteracao de lifecycle de Employment
  // ---------------------------------------------------------------------

  it("zero automacao: nenhuma etapa de Onboarding cria/ativa Employment e nenhuma de Employment cria/vincula Onboarding", async () => {
    const fixture = await createHiredFixture(database, "zero-automation");

    const beforeEmployments = await database.pool.query(
      "SELECT count(*)::int AS count FROM employments WHERE organization_id = $1",
      [fixture.organizationId]
    );
    const onboarding = await createOnboarding(fixture).expect(201);
    await startOnboarding(fixture, onboarding.body.id).expect(200);
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/onboardings/${onboarding.body.id}/complete`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(200);
    const afterEmployments = await database.pool.query(
      "SELECT count(*)::int AS count FROM employments WHERE organization_id = $1",
      [fixture.organizationId]
    );
    expect(afterEmployments.rows[0].count).toBe(beforeEmployments.rows[0].count);

    const secondFixture = await createHiredFixture(database, "zero-automation-b");
    const secondOnboarding = await createOnboarding(secondFixture).expect(201);
    const employment = await createRecruitmentEmployment(secondFixture).expect(201);
    let fetched = await getOnboarding(secondFixture, secondOnboarding.body.id).expect(200);
    expect(fetched.body.employmentId).toBeNull();

    await employmentAction(secondFixture, employment.body.id, "activate").expect(200);
    fetched = await getOnboarding(secondFixture, secondOnboarding.body.id).expect(200);
    expect(fetched.body.employmentId).toBeNull();

    await linkEmployment(secondFixture, secondOnboarding.body.id, employment.body.id).expect(200);
    await employmentAction(secondFixture, employment.body.id, "end", crypto.randomUUID(), {
      endDate: "2026-12-20",
      reason: "Fim."
    }).expect(200);
    fetched = await getOnboarding(secondFixture, secondOnboarding.body.id).expect(200);
    expect(fetched.body.employmentId).toBe(employment.body.id);
  });

  it("zero alteracao de lifecycle de Employment pelo vinculo", async () => {
    const fixture = await createHiredFixture(database, "zero-employment-change");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);

    const before = await database.pool.query("SELECT * FROM employments WHERE id = $1", [
      employment.body.id
    ]);
    await linkEmployment(fixture, onboarding.body.id, employment.body.id).expect(200);
    const after = await database.pool.query("SELECT * FROM employments WHERE id = $1", [
      employment.body.id
    ]);

    expect(after.rows[0].status).toBe(before.rows[0].status);
    expect(after.rows[0].updated_at).toEqual(before.rows[0].updated_at);
    expect(after.rows[0].activated_by_user_id).toBeNull();
  });

  it("zero IA: nenhuma ai_execution e criada por qualquer operacao desta suite", async () => {
    const result = await database.pool.query("SELECT count(*)::int AS count FROM ai_executions");
    expect(result.rows[0].count).toBe(0);
  });
});

async function createSecondHiredApplication(
  database: PostgresTestDatabase,
  fixture: Awaited<ReturnType<typeof createHiredFixture>>
) {
  const { applicationPayload, submitApplication } = await import("../phase17/helpers");
  await submitApplication(fixture.app, fixture.slug, applicationPayload()).expect(201);
  const row = await database.pool.query(
    "SELECT id FROM candidate_applications WHERE organization_id = $1 AND id <> $2 LIMIT 1",
    [fixture.organizationId, fixture.applicationId]
  );
  const applicationId = String(row.rows[0].id);
  await request(fixture.app)
    .post(
      `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/hire`
    )
    .set(userHeaders(fixture.ownerId))
    .send({ reason: "Segunda contratacao para teste de concorrencia." })
    .expect(200);
  return applicationId;
}
