import request from "supertest";
import {
  addMembership,
  createApp,
  createHiredFixture,
  createRecruitmentEmployment,
  employmentAction,
  platformHeaders,
  userHeaders
} from "../phase24/helpers";
import { applicationPayload, submitApplication } from "../phase17/helpers";

export {
  addMembership,
  applicationPayload,
  createApp,
  createHiredFixture,
  createRecruitmentEmployment,
  employmentAction,
  platformHeaders,
  submitApplication,
  userHeaders
};

// Fase 26 (SPEC-016 v1.1 s47.1): mesmo endpoint de criacao da Fase 23,
// employment_id nunca aceito no payload de create.
export function createOnboarding(
  fixture: Awaited<ReturnType<typeof createHiredFixture>>,
  key: string = crypto.randomUUID(),
  overrides: Record<string, unknown> = {}
) {
  return request(fixture.app)
    .post(
      `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/onboarding`
    )
    .set(userHeaders(fixture.ownerId))
    .set("Idempotency-Key", key)
    .send({ expectedPersonStartDate: "2026-09-01", initialTasks: [], ...overrides });
}

export function startOnboarding(
  fixture: Awaited<ReturnType<typeof createHiredFixture>>,
  onboardingId: string,
  key: string = crypto.randomUUID()
) {
  return request(fixture.app)
    .post(`/api/organizations/${fixture.organizationId}/onboardings/${onboardingId}/start`)
    .set(userHeaders(fixture.ownerId))
    .set("Idempotency-Key", key)
    .send({});
}

export function completeOnboarding(
  fixture: Awaited<ReturnType<typeof createHiredFixture>>,
  onboardingId: string,
  key: string = crypto.randomUUID()
) {
  return request(fixture.app)
    .post(`/api/organizations/${fixture.organizationId}/onboardings/${onboardingId}/complete`)
    .set(userHeaders(fixture.ownerId))
    .set("Idempotency-Key", key)
    .send({});
}

export function cancelOnboarding(
  fixture: Awaited<ReturnType<typeof createHiredFixture>>,
  onboardingId: string,
  key: string = crypto.randomUUID(),
  reason = "Cancelamento de teste."
) {
  return request(fixture.app)
    .post(`/api/organizations/${fixture.organizationId}/onboardings/${onboardingId}/cancel`)
    .set(userHeaders(fixture.ownerId))
    .set("Idempotency-Key", key)
    .send({ reason });
}

// Fase 26: operacao central desta suite. `actorUserId` permite testar RBAC
// (owner/admin permitido, member negado) sem duplicar a chamada inteira.
export function linkEmployment(
  fixture: Awaited<ReturnType<typeof createHiredFixture>>,
  onboardingId: string,
  employmentId: string,
  actorUserId: string = fixture.ownerId,
  key: string = crypto.randomUUID()
) {
  return request(fixture.app)
    .post(
      `/api/organizations/${fixture.organizationId}/onboardings/${onboardingId}/employment-link`
    )
    .set(userHeaders(actorUserId))
    .set("Idempotency-Key", key)
    .send({ employmentId });
}

export function getOnboarding(
  fixture: Awaited<ReturnType<typeof createHiredFixture>>,
  onboardingId: string,
  actorUserId: string = fixture.ownerId
) {
  return request(fixture.app)
    .get(`/api/organizations/${fixture.organizationId}/onboardings/${onboardingId}`)
    .set(userHeaders(actorUserId));
}

// Employment administrativo para uma pessoa NAO relacionada ao fixture --
// util quando o teste so precisa de um segundo employmentId valido e
// existente (ex.: write-once, conflito de idempotencia), sem esbarrar na
// cardinalidade "no maximo um Employment nao-final por OrganizationPerson"
// (SPEC-025 s11) que bloquearia um segundo Employment de recrutamento
// enquanto o primeiro, da mesma pessoa, ainda estiver pending/active.
export function createUnrelatedEmployment(
  fixture: Awaited<ReturnType<typeof createHiredFixture>>,
  overrides: Record<string, unknown> = {}
) {
  return request(fixture.app)
    .post(`/api/organizations/${fixture.organizationId}/employments`)
    .set(userHeaders(fixture.ownerId))
    .set("Idempotency-Key", crypto.randomUUID())
    .send({
      originType: "administrative",
      displayName: `Pessoa Nao Relacionada ${crypto.randomUUID()}`,
      effectiveStartDate: "2027-01-01",
      originReason: "Employment auxiliar para teste, sem relacao de proveniencia.",
      ...overrides
    });
}

// Cria um Employment administrativo reutilizando a OrganizationPerson de um
// Employment de recrutamento ja finalizado (ended/cancelled) da mesma
// pessoa -- unico jeito de obter, nesta v1, um Employment SEM
// origin_candidate_application_id mas cuja OrganizationPerson possui
// origin_candidate_id (caminho B da regra de coerencia, SPEC-016 v1.1 s44.1).
export function createAdministrativeEmploymentForSamePerson(
  fixture: Awaited<ReturnType<typeof createHiredFixture>>,
  organizationPersonId: string,
  overrides: Record<string, unknown> = {}
) {
  return request(fixture.app)
    .post(`/api/organizations/${fixture.organizationId}/employments`)
    .set(userHeaders(fixture.ownerId))
    .set("Idempotency-Key", crypto.randomUUID())
    .send({
      originType: "administrative",
      organizationPersonId,
      effectiveStartDate: "2027-01-01",
      originReason: "Readmissao administrativa reutilizando pessoa existente.",
      ...overrides
    });
}
