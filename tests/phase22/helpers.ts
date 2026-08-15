import request from "supertest";
import { createPostgresAIService } from "../../src/server/ai/service";
import { createServer } from "../../src/server/app";
import { createOrganizationBlueprintOnboardingHook } from "../../src/server/blueprints/organization-onboarding";
import { createPostgresBlueprintService } from "../../src/server/blueprints/service";
import { createPostgresCandidateApplicationService } from "../../src/server/candidate-applications/service";
import { createPostgresCandidateService } from "../../src/server/candidates/service";
import { createPostgresCompetencyService } from "../../src/server/competencies/service";
import { createCoreService } from "../../src/server/core/service";
import { createPostgresDnaService } from "../../src/server/dna/service";
import { createPostgresInterviewService } from "../../src/server/interviews/service";
import { createPostgresJobOpeningService } from "../../src/server/job-openings/service";
import { createPostgresJobProfileService } from "../../src/server/job-profiles/service";
import { createPostgresOrganizationalUnitService } from "../../src/server/organizational-units/service";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresProposalService } from "../../src/server/proposals/service";
import { createPostgresPublicApplicationService } from "../../src/server/public-applications/service";
import { createPostgresQuestionService } from "../../src/server/questions/service";
import type { PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  applicationPayload,
  createUser,
  createPublicJobOpeningFixture,
  submitApplication,
  userHeaders
} from "../phase17/helpers";

export { userHeaders };
export const platformHeaders = { "x-dev-platform-admin": "true" };
export { createUser };

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
    undefined,
    undefined,
    undefined,
    undefined,
    createPostgresProposalService(database.pool)
  );
}

export async function createProposalFixture(database: PostgresTestDatabase, suffix: string) {
  const app = createApp(database);
  const fixture = await createPublicJobOpeningFixture(app, suffix);
  const payload = applicationPayload();
  await submitApplication(app, fixture.slug, payload).expect(201);
  const application = await database.pool.query(
    "SELECT id FROM candidate_applications WHERE organization_id = $1 LIMIT 1",
    [fixture.organizationId]
  );
  return {
    app,
    ...fixture,
    applicationId: String(application.rows[0].id)
  };
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

export async function issuedProposal(database: PostgresTestDatabase, suffix: string) {
  const fixture = await createProposalFixture(database, suffix);
  const draft = await createDraft(
    fixture.app,
    fixture.organizationId,
    fixture.ownerId,
    fixture.applicationId
  );
  const issued = await issueDraft(
    fixture.app,
    fixture.organizationId,
    fixture.ownerId,
    fixture.applicationId,
    draft.currentVersion.id
  ).expect(201);
  return {
    ...fixture,
    proposalId: draft.id,
    proposalVersionId: draft.currentVersion.id,
    rawAccessToken: issued.body.rawAccessToken as string
  };
}

export async function createDraft(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  applicationId: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await request(app)
    .post(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId}/proposals/draft`
    )
    .set(userHeaders(ownerId))
    .send({
      contentSnapshot: { text: "Oferta operacional", startDate: "2026-09-01" },
      compensationSnapshot: { salary: 12345, currency: "BRL", periodicity: "monthly" },
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      ...overrides
    })
    .expect(201);
  return response.body as { id: string; currentVersion: { id: string } };
}

export function issueDraft(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  applicationId: string,
  proposalVersionId: string,
  idempotencyKey: string = crypto.randomUUID()
) {
  return request(app)
    .post(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId}/proposals/issue`
    )
    .set(userHeaders(ownerId))
    .set("Idempotency-Key", idempotencyKey)
    .send({ proposalVersionId, stageChangeReason: "Mover para etapa de proposta." });
}

export function proposalAuthHeaders(rawToken: string) {
  return { Authorization: `Proposal ${rawToken}` };
}
