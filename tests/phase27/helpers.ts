import request from "supertest";
import { createPostgresAIService } from "../../src/server/ai/service";
import { createServer } from "../../src/server/app";
import { createOrganizationBlueprintOnboardingHook } from "../../src/server/blueprints/organization-onboarding";
import { createPostgresBlueprintService } from "../../src/server/blueprints/service";
import { createPostgresCandidateApplicationService } from "../../src/server/candidate-applications/service";
import { createPostgresCandidateService } from "../../src/server/candidates/service";
import { createPostgresCompetencyService } from "../../src/server/competencies/service";
import { createCoreService } from "../../src/server/core/service";
import { createPostgresDevelopmentRetentionService } from "../../src/server/development-retention/service";
import { createPostgresDnaService } from "../../src/server/dna/service";
import { createPostgresEmploymentService } from "../../src/server/employments/service";
import { createPostgresInterviewService } from "../../src/server/interviews/service";
import { createPostgresJobOpeningService } from "../../src/server/job-openings/service";
import { createPostgresJobProfileService } from "../../src/server/job-profiles/service";
import { createPostgresOffboardingService } from "../../src/server/offboardings/service";
import { createPostgresOnboardingService } from "../../src/server/onboardings/service";
import { createPostgresOrganizationalUnitService } from "../../src/server/organizational-units/service";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresPreInterviewService } from "../../src/server/pre-interviews/service";
import { createPostgresProposalService } from "../../src/server/proposals/service";
import { createPostgresPublicApplicationService } from "../../src/server/public-applications/service";
import { createPostgresQuestionService } from "../../src/server/questions/service";
import { createPostgresBehavioralAssessmentService } from "../../src/server/behavioral-assessments/service";
import { createPostgresPreAnalysisService } from "../../src/server/pre-analyses/service";
import { createPostgresCandidateDossierService } from "../../src/server/candidate-dossiers/service";
import type { PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  applicationPayload,
  createPublicJobOpeningFixture,
  createUser,
  submitApplication,
  userHeaders
} from "../phase17/helpers";

export { createUser, userHeaders };
export const platformHeaders = { "x-dev-platform-admin": "true" };

export function createApp(database: PostgresTestDatabase) {
  const aiService = createPostgresAIService(database.pool, {});
  const candidateService = createPostgresCandidateService(database.pool);
  const candidateApplicationService = createPostgresCandidateApplicationService(database.pool);
  return createServer(
    createCoreService(
      new PostgresCoreRepository(database.pool),
      createOrganizationBlueprintOnboardingHook()
    ),
    createPostgresDnaService(database.pool),
    createPostgresOrganizationalUnitService(database.pool),
    createPostgresCompetencyService(database.pool),
    createPostgresJobProfileService(database.pool),
    createPostgresQuestionService(database.pool),
    createPostgresJobOpeningService(database.pool),
    candidateService,
    candidateApplicationService,
    createPostgresInterviewService(database.pool),
    aiService,
    createPostgresBlueprintService(database.pool),
    createPostgresPublicApplicationService(
      database.pool,
      candidateService,
      candidateApplicationService
    ),
    createPostgresPreInterviewService(database.pool),
    createPostgresBehavioralAssessmentService(database.pool),
    createPostgresPreAnalysisService(database.pool, aiService),
    createPostgresCandidateDossierService(database.pool),
    createPostgresProposalService(database.pool),
    createPostgresOnboardingService(database.pool),
    createPostgresEmploymentService(database.pool),
    createPostgresDevelopmentRetentionService(database.pool),
    createPostgresOffboardingService(database.pool)
  );
}

// Employment `active`, pronto para Offboarding (SPEC-026 s8 permite active OU ended).
export async function createActiveEmploymentFixture(
  database: PostgresTestDatabase,
  suffix: string
) {
  const app = createApp(database);
  const fixture = await createPublicJobOpeningFixture(app, suffix);
  await submitApplication(app, fixture.slug, applicationPayload()).expect(201);
  const application = await database.pool.query(
    "SELECT id, candidate_id FROM candidate_applications WHERE organization_id = $1 LIMIT 1",
    [fixture.organizationId]
  );
  const applicationId = String(application.rows[0].id);
  await request(app)
    .post(
      `/api/organizations/${fixture.organizationId}/candidate-applications/${applicationId}/hire`
    )
    .set(userHeaders(fixture.ownerId))
    .send({ reason: "Contratacao administrativa." })
    .expect(200);
  const employment = await request(app)
    .post(`/api/organizations/${fixture.organizationId}/employments`)
    .set(userHeaders(fixture.ownerId))
    .set("Idempotency-Key", crypto.randomUUID())
    .send({
      originType: "recruitment",
      candidateApplicationId: applicationId,
      effectiveStartDate: "2026-01-01",
      originReason: "Contratacao aprovada pela empresa."
    })
    .expect(201);
  await request(app)
    .post(`/api/organizations/${fixture.organizationId}/employments/${employment.body.id}/activate`)
    .set(userHeaders(fixture.ownerId))
    .set("Idempotency-Key", crypto.randomUUID())
    .send({})
    .expect(200);
  return { app, ...fixture, employmentId: employment.body.id as string };
}

// SPEC-026 s8: Employment `ended` tambem e elegivel para criar Offboarding -- fixture dedicada
// para cobrir esse segundo caminho e o cenario de recontratacao (s17/s21).
export async function endEmployment(
  fixture: Awaited<ReturnType<typeof createActiveEmploymentFixture>>
) {
  await request(fixture.app)
    .post(`/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/end`)
    .set(userHeaders(fixture.ownerId))
    .set("Idempotency-Key", crypto.randomUUID())
    .send({ endDate: "2026-06-01", reason: "Fim de vinculo para teste." })
    .expect(200);
}

export async function addMembership(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  role: "admin" | "member",
  suffix: string
) {
  const user = await createUser(app, `${role}-${suffix}`);
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/memberships`)
    .set(userHeaders(ownerId))
    .send({ organizationId, userId: user.id, role })
    .expect(201);
  return { userId: user.id, membershipId: response.body.id as string };
}

export function createOffboarding(
  fixture: Awaited<ReturnType<typeof createActiveEmploymentFixture>>,
  key: string = crypto.randomUUID(),
  overrides: Record<string, unknown> = {},
  actorId: string = fixture.ownerId
) {
  return request(fixture.app)
    .post(
      `/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/offboardings`
    )
    .set(userHeaders(actorId))
    .set("Idempotency-Key", key)
    .send(overrides);
}

export function offboardingAction(
  fixture: Awaited<ReturnType<typeof createActiveEmploymentFixture>>,
  offboardingId: string,
  action: "start" | "complete" | "cancel",
  key: string = crypto.randomUUID(),
  body: Record<string, unknown> = {},
  actorId: string = fixture.ownerId
) {
  return request(fixture.app)
    .post(`/api/organizations/${fixture.organizationId}/offboardings/${offboardingId}/${action}`)
    .set(userHeaders(actorId))
    .set("Idempotency-Key", key)
    .send(body);
}

export function addTask(
  fixture: Awaited<ReturnType<typeof createActiveEmploymentFixture>>,
  offboardingId: string,
  key: string = crypto.randomUUID(),
  overrides: Record<string, unknown> = {},
  actorId: string = fixture.ownerId
) {
  return request(fixture.app)
    .post(`/api/organizations/${fixture.organizationId}/offboardings/${offboardingId}/tasks`)
    .set(userHeaders(actorId))
    .set("Idempotency-Key", key)
    .send({ title: "Devolver equipamento", isRequired: true, ...overrides });
}

export function taskAction(
  fixture: Awaited<ReturnType<typeof createActiveEmploymentFixture>>,
  taskId: string,
  action: "complete" | "cancel",
  key: string = crypto.randomUUID(),
  body: Record<string, unknown> = {},
  actorId: string = fixture.ownerId
) {
  return request(fixture.app)
    .post(`/api/organizations/${fixture.organizationId}/offboarding-tasks/${taskId}/${action}`)
    .set(userHeaders(actorId))
    .set("Idempotency-Key", key)
    .send(body);
}

export function assignTask(
  fixture: Awaited<ReturnType<typeof createActiveEmploymentFixture>>,
  taskId: string,
  assigneeMembershipId: string,
  key: string = crypto.randomUUID(),
  actorId: string = fixture.ownerId
) {
  return request(fixture.app)
    .post(`/api/organizations/${fixture.organizationId}/offboarding-tasks/${taskId}/assign`)
    .set(userHeaders(actorId))
    .set("Idempotency-Key", key)
    .send({ assigneeMembershipId });
}
