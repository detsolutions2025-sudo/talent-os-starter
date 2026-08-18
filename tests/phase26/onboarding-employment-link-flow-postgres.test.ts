import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  applicationPayload,
  createAdministrativeEmploymentForSamePerson,
  createHiredFixture,
  createOnboarding,
  createRecruitmentEmployment,
  employmentAction,
  getOnboarding,
  linkEmployment,
  platformHeaders,
  startOnboarding,
  submitApplication,
  userHeaders
} from "./helpers";

describe("Fase 26 - Onboarding -> Employment: vinculo, estados, provenance, RBAC", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("Onboarding historico sem vinculo permanece valido com employmentId nulo", async () => {
    const fixture = await createHiredFixture(database, "historico-null");
    const onboarding = await createOnboarding(fixture).expect(201);
    expect(onboarding.body.employmentId).toBeNull();

    const fetched = await getOnboarding(fixture, onboarding.body.id).expect(200);
    expect(fetched.body.employmentId).toBeNull();
  });

  it("vincula por caminho A (mesma CandidateApplication) com Employment pending", async () => {
    const fixture = await createHiredFixture(database, "path-a-pending");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);

    const linked = await linkEmployment(fixture, onboarding.body.id, employment.body.id).expect(
      200
    );
    expect(linked.body.employmentId).toBe(employment.body.id);
  });

  it("vincula por caminho A com Employment active", async () => {
    const fixture = await createHiredFixture(database, "path-a-active");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);
    await employmentAction(fixture, employment.body.id, "activate").expect(200);

    const linked = await linkEmployment(fixture, onboarding.body.id, employment.body.id).expect(
      200
    );
    expect(linked.body.employmentId).toBe(employment.body.id);
  });

  it("vincula por caminho B (mesma pessoa, Employment administrativo sem CandidateApplication propria)", async () => {
    const fixture = await createHiredFixture(database, "path-b-person");
    const onboarding = await createOnboarding(fixture).expect(201);

    const recruitmentEmployment = await createRecruitmentEmployment(fixture).expect(201);
    await employmentAction(fixture, recruitmentEmployment.body.id, "activate").expect(200);
    await employmentAction(fixture, recruitmentEmployment.body.id, "end", crypto.randomUUID(), {
      endDate: "2026-11-01",
      reason: "Fim do vinculo original."
    }).expect(200);

    const administrativeEmployment = await createAdministrativeEmploymentForSamePerson(
      fixture,
      recruitmentEmployment.body.organizationPersonId
    ).expect(201);
    expect(administrativeEmployment.body.originCandidateApplicationId).toBeNull();

    const linked = await linkEmployment(
      fixture,
      onboarding.body.id,
      administrativeEmployment.body.id
    ).expect(200);
    expect(linked.body.employmentId).toBe(administrativeEmployment.body.id);
  });

  it("bloqueia Employment incompativel: nenhum caminho de proveniencia satisfeito", async () => {
    const fixture = await createHiredFixture(database, "incompativel");
    const onboarding = await createOnboarding(fixture).expect(201);
    const unrelated = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        originType: "administrative",
        displayName: "Pessoa Sem Relacao",
        effectiveStartDate: "2026-09-01",
        originReason: "Pessoa administrativa nao relacionada."
      })
      .expect(201);

    await linkEmployment(fixture, onboarding.body.id, unrelated.body.id).expect(409);
    const fetched = await getOnboarding(fixture, onboarding.body.id).expect(200);
    expect(fetched.body.employmentId).toBeNull();
  });

  it("bloqueia Employment de outra Organization com resposta generica (nao vaza existencia)", async () => {
    const fixtureA = await createHiredFixture(database, "cross-tenant-a");
    const fixtureB = await createHiredFixture(database, "cross-tenant-b");
    const onboardingA = await createOnboarding(fixtureA).expect(201);
    const employmentB = await createRecruitmentEmployment(fixtureB).expect(201);

    const response = await linkEmployment(
      fixtureA,
      onboardingA.body.id,
      employmentB.body.id
    ).expect(404);
    expect(JSON.stringify(response.body)).not.toContain(fixtureB.organizationId);
  });

  it("bloqueia Employment ended e Employment cancelled", async () => {
    const fixture = await createHiredFixture(database, "estados-employment");
    const onboarding = await createOnboarding(fixture).expect(201);

    const ended = await createRecruitmentEmployment(fixture).expect(201);
    await employmentAction(fixture, ended.body.id, "activate").expect(200);
    await employmentAction(fixture, ended.body.id, "end", crypto.randomUUID(), {
      endDate: "2026-10-01",
      reason: "Encerrado antes do vinculo."
    }).expect(200);
    await linkEmployment(fixture, onboarding.body.id, ended.body.id).expect(409);

    const pendingForCancel = await createRecruitmentEmployment(fixture, crypto.randomUUID(), {
      effectiveStartDate: "2027-02-01"
    }).expect(201);
    await employmentAction(fixture, pendingForCancel.body.id, "cancel", crypto.randomUUID(), {
      reason: "Cancelado antes do vinculo."
    }).expect(200);
    await linkEmployment(fixture, onboarding.body.id, pendingForCancel.body.id).expect(409);

    const fetched = await getOnboarding(fixture, onboarding.body.id).expect(200);
    expect(fetched.body.employmentId).toBeNull();
  });

  it("bloqueia vinculo em Onboarding completed e em Onboarding cancelled", async () => {
    const fixtureCompleted = await createHiredFixture(database, "onboarding-completed");
    const onboardingCompleted = await createOnboarding(fixtureCompleted).expect(201);
    await startOnboarding(fixtureCompleted, onboardingCompleted.body.id).expect(200);
    await request(fixtureCompleted.app)
      .post(
        `/api/organizations/${fixtureCompleted.organizationId}/onboardings/${onboardingCompleted.body.id}/complete`
      )
      .set(userHeaders(fixtureCompleted.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(200);
    const employmentForCompleted = await createRecruitmentEmployment(fixtureCompleted).expect(201);
    await linkEmployment(
      fixtureCompleted,
      onboardingCompleted.body.id,
      employmentForCompleted.body.id
    ).expect(409);

    const fixtureCancelled = await createHiredFixture(database, "onboarding-cancelled");
    const onboardingCancelled = await createOnboarding(fixtureCancelled).expect(201);
    await request(fixtureCancelled.app)
      .post(
        `/api/organizations/${fixtureCancelled.organizationId}/onboardings/${onboardingCancelled.body.id}/cancel`
      )
      .set(userHeaders(fixtureCancelled.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ reason: "Cancelado antes do vinculo." })
      .expect(200);
    const employmentForCancelled = await createRecruitmentEmployment(fixtureCancelled).expect(201);
    await linkEmployment(
      fixtureCancelled,
      onboardingCancelled.body.id,
      employmentForCancelled.body.id
    ).expect(409);
  });

  it("permite vinculo em draft e em in_progress", async () => {
    const fixtureDraft = await createHiredFixture(database, "onboarding-draft");
    const onboardingDraft = await createOnboarding(fixtureDraft).expect(201);
    const employmentDraft = await createRecruitmentEmployment(fixtureDraft).expect(201);
    await linkEmployment(fixtureDraft, onboardingDraft.body.id, employmentDraft.body.id).expect(
      200
    );

    const fixtureProgress = await createHiredFixture(database, "onboarding-in-progress");
    const onboardingProgress = await createOnboarding(fixtureProgress).expect(201);
    await startOnboarding(fixtureProgress, onboardingProgress.body.id).expect(200);
    const employmentProgress = await createRecruitmentEmployment(fixtureProgress).expect(201);
    await linkEmployment(
      fixtureProgress,
      onboardingProgress.body.id,
      employmentProgress.body.id
    ).expect(200);
  });

  it("vinculo sobrevive a Employment ended e a Onboarding completed posteriores", async () => {
    const fixture = await createHiredFixture(database, "sobrevive-transicoes");
    const onboarding = await createOnboarding(fixture).expect(201);
    await startOnboarding(fixture, onboarding.body.id).expect(200);
    const employment = await createRecruitmentEmployment(fixture).expect(201);
    await employmentAction(fixture, employment.body.id, "activate").expect(200);
    await linkEmployment(fixture, onboarding.body.id, employment.body.id).expect(200);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/onboardings/${onboarding.body.id}/complete`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(200);
    await employmentAction(fixture, employment.body.id, "end", crypto.randomUUID(), {
      endDate: "2026-12-01",
      reason: "Fim do vinculo."
    }).expect(200);

    const fetched = await getOnboarding(fixture, onboarding.body.id).expect(200);
    expect(fetched.body.employmentId).toBe(employment.body.id);
    expect(fetched.body.status).toBe("completed");
  });

  it("RBAC: owner e admin permitidos; member e Platform Admin negados; Organization archived bloqueia", async () => {
    const fixture = await createHiredFixture(database, "rbac-link");
    const onboarding = await createOnboarding(fixture).expect(201);
    const employment = await createRecruitmentEmployment(fixture).expect(201);
    const member = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "rbac-link"
    );

    await linkEmployment(fixture, onboarding.body.id, employment.body.id, member.userId).expect(
      403
    );

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/onboardings/${onboarding.body.id}/employment-link`
      )
      .set(platformHeaders)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ employmentId: employment.body.id })
      .expect(403);

    const admin = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "admin",
      "rbac-link"
    );
    // Segunda candidatura hired na MESMA Organization (mesmo slug de vaga),
    // para testar admin sem reaproveitar o Onboarding/Employment ja
    // decididos pelo owner acima (cardinalidade 0..1 impede reuso direto).
    await submitApplication(fixture.app, fixture.slug, applicationPayload()).expect(201);
    const secondApplicationRow = await database.pool.query(
      "SELECT id FROM candidate_applications WHERE organization_id = $1 AND id <> $2 LIMIT 1",
      [fixture.organizationId, fixture.applicationId]
    );
    const secondApplicationId = String(secondApplicationRow.rows[0].id);
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${secondApplicationId}/hire`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Segunda contratacao para teste de admin." })
      .expect(200);
    const secondOnboarding = await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${secondApplicationId}/onboarding`
      )
      .set(userHeaders(admin.userId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ expectedPersonStartDate: "2026-09-01", initialTasks: [] })
      .expect(201);
    const secondEmployment = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(admin.userId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        originType: "recruitment",
        candidateApplicationId: secondApplicationId,
        effectiveStartDate: "2026-09-01",
        originReason: "Contratacao aprovada pela empresa."
      })
      .expect(201);
    await linkEmployment(
      fixture,
      secondOnboarding.body.id,
      secondEmployment.body.id,
      admin.userId
    ).expect(200);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/archive`)
      .set(platformHeaders)
      .send({})
      .expect(200);
    await linkEmployment(fixture, onboarding.body.id, employment.body.id).expect(403);
  });
});
