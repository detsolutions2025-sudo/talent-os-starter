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
import {
  createPostgresPreInterviewService,
  type PreInterviewTestingHooks
} from "../../src/server/pre-interviews/service";
import { createPostgresPublicApplicationService } from "../../src/server/public-applications/service";
import { createPostgresQuestionService } from "../../src/server/questions/service";
import type { PostgresTestDatabase } from "../helpers/postgres-test-db";

export const platformHeaders = { "x-dev-platform-admin": "true" };

export function userHeaders(userId: string) {
  return { "x-dev-user-id": userId };
}

export function accessTokenHeaders(rawToken: string) {
  return { Authorization: `PreInterview ${rawToken}` };
}

export function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
}

// `preInterviewTestingHooks` (revisao destrutiva, itens 22/43): permite aos testes provocar
// falha deliberada dentro da transacao de criacao de tentativa / auditoria critica, para provar
// rollback real -- mesmo padrao ja usado por `testingHooks` em `tests/phase17/helpers.ts`.
export function createApp(
  database: PostgresTestDatabase,
  preInterviewTestingHooks: PreInterviewTestingHooks = {}
) {
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
    createPostgresPreInterviewService(database.pool, preInterviewTestingHooks)
  );
}

export async function createUser(app: ReturnType<typeof createApp>, prefix: string) {
  const response = await request(app)
    .post("/api/dev/users")
    .set(platformHeaders)
    .send({ name: prefix, email: `${unique(prefix)}@example.com` })
    .expect(201);
  return response.body as { id: string };
}

export async function createOrganization(app: ReturnType<typeof createApp>, ownerId: string) {
  const slug = unique("pint-org");
  const response = await request(app)
    .post("/api/organizations")
    .set(platformHeaders)
    .send({ name: `Organization ${slug}`, slug, initialOwnerUserId: ownerId })
    .expect(201);
  return response.body as { organization: { id: string } };
}

export async function addMembership(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  userId: string,
  role: "admin" | "member"
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/memberships`)
    .set(userHeaders(ownerId))
    .send({ userId, role })
    .expect(201);
  return response.body as { id: string };
}

export async function createCandidate(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/candidates`)
    .set(userHeaders(ownerId))
    .send({
      fullName: "Ana Candidate",
      preferredName: "Ana",
      email: `${unique("candidate")}@example.com`,
      source: "manual",
      consent: { status: "granted", source: "manual", termsVersion: "v1", purpose: "Recruiting" },
      ...overrides
    })
    .expect(201);
  return response.body as { id: string };
}

function levels() {
  return ["basic", "intermediate", "proficient", "advanced", "reference"].map((code, index) => ({
    number: index + 1,
    code,
    displayName: code,
    description: `${code} description`,
    observableEvidences: []
  }));
}

async function createPublishedJobProfileVersion(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  const competency = await request(app)
    .post(`/api/organizations/${organizationId}/competencies`)
    .set(userHeaders(ownerId))
    .send({
      code: `PINT-CMP-${suffix}`,
      name: `Pre-interview competency ${suffix}`,
      category: "technical",
      definition: "Definition",
      positiveEvidences: [{ text: "Yes", displayOrder: 0 }],
      negativeEvidences: [{ text: "No", displayOrder: 0 }],
      practicalExamples: [{ text: "Example", displayOrder: 0 }],
      proficiencyLevels: levels(),
      status: "active"
    })
    .expect(201);
  void competency;
  const catalog = await request(app)
    .get(`/api/organizations/${organizationId}/competencies/catalog`)
    .set(userHeaders(ownerId))
    .expect(200);
  const item = catalog.body[0] as { competencyCatalogItemId: string };
  const profile = await request(app)
    .post(`/api/organizations/${organizationId}/job-profiles`)
    .set(userHeaders(ownerId))
    .send({ code: `PINT-JOB-${suffix}`, name: `Job ${suffix}` })
    .expect(201);
  const draft = await request(app)
    .post(`/api/organizations/${organizationId}/job-profiles/${profile.body.id}/drafts`)
    .set(userHeaders(ownerId))
    .send({
      title: `Job ${suffix}`,
      mission: "Mission",
      summary: "Summary",
      responsibilities: [{ text: "Do work", displayOrder: 0 }],
      requirements: [],
      education: { level: "not_required", area: "", required: false, note: "" },
      certifications: [],
      languages: [],
      tools: [],
      workModel: "remote",
      workSchedule: { weeklyHours: 40, description: "Full", shift: "day" },
      travelRequirement: "none",
      salaryRange: { min: 1000, max: 2000, currency: "USD", periodicity: "monthly" },
      notes: "",
      competencies: [
        {
          competencyCatalogItemId: item.competencyCatalogItemId,
          expectedLevel: 3,
          required: true,
          displayOrder: 0
        }
      ]
    })
    .expect(201);
  const published = await request(app)
    .post(
      `/api/organizations/${organizationId}/job-profiles/${profile.body.id}/drafts/${draft.body.id}/publish`
    )
    .set(userHeaders(ownerId))
    .expect(200);
  return published.body as { id: string };
}

export async function createPublishedOpenJob(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  const profileVersion = await createPublishedJobProfileVersion(
    app,
    organizationId,
    ownerId,
    suffix
  );
  const opening = await request(app)
    .post(`/api/organizations/${organizationId}/job-openings`)
    .set(userHeaders(ownerId))
    .send({
      code: `PINT-${suffix}`,
      title: `Internal ${suffix}`,
      publicTitle: `Public ${suffix}`,
      positionsCount: 1,
      jobProfileVersionId: profileVersion.id
    })
    .expect(201);
  const draft = await request(app)
    .get(`/api/organizations/${organizationId}/job-openings/${opening.body.id}/draft`)
    .set(userHeaders(ownerId))
    .expect(200);
  const published = await request(app)
    .post(
      `/api/organizations/${organizationId}/job-openings/${opening.body.id}/drafts/${draft.body.id}/publish`
    )
    .set(userHeaders(ownerId))
    .expect(200);
  await request(app)
    .post(`/api/organizations/${organizationId}/job-openings/${opening.body.id}/open`)
    .set(userHeaders(ownerId))
    .expect(200);
  return { id: opening.body.id as string, versionId: published.body.id as string };
}

export async function publishJobOpeningPublicly(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  jobOpeningId: string,
  ownerId: string,
  suffix: string
) {
  const slug = unique(`vaga-${suffix}`).toLowerCase();
  await request(app)
    .patch(`/api/organizations/${organizationId}/job-openings/${jobOpeningId}/publication`)
    .set(userHeaders(ownerId))
    .send({ isPublic: true, publicSlug: slug, showSalary: false })
    .expect(200);
  return slug;
}

export async function createApplication(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  candidateId: string,
  jobOpeningId: string,
  jobOpeningVersionId: string
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/candidate-applications`)
    .set(userHeaders(ownerId))
    .send({ candidateId, jobOpeningId, jobOpeningVersionId, source: "manual" })
    .expect(201);
  return response.body as { id: string };
}

export async function createQuestionCatalogItem(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  await request(app)
    .post(`/api/organizations/${organizationId}/questions`)
    .set(userHeaders(ownerId))
    .send({
      code: `PINT-Q-${suffix}`,
      title: `Question ${suffix}`,
      questionText: `Question text ${suffix}`,
      type: "open_text",
      category: "general",
      description: "",
      instructions: "",
      options: [],
      settings: {},
      status: "active"
    })
    .expect(201);
  const catalog = await request(app)
    .get(`/api/organizations/${organizationId}/questions/catalog`)
    .set(userHeaders(ownerId))
    .expect(200);
  const items = catalog.body as Array<{ questionCatalogItemId: string; code: string }>;
  const created = items.find((item) => item.code === `PINT-Q-${suffix}`);
  if (!created) {
    throw new Error("Question catalog item not found after creation.");
  }
  return created;
}

export function enablePreInterviewSettings(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  jobOpeningId: string,
  ownerId: string,
  questionCatalogItemIds: string[]
) {
  return request(app)
    .put(`/api/organizations/${organizationId}/job-openings/${jobOpeningId}/pre-interview-settings`)
    .set(userHeaders(ownerId))
    .send({
      enabled: true,
      questions: questionCatalogItemIds.map((questionCatalogItemId, index) => ({
        questionCatalogItemId,
        displayOrder: index,
        required: index === 0
      }))
    });
}

// Fixture completa: Organization + owner + Candidate ativo com consentimento valido + Vaga
// publicada/aberta + CandidateApplication `active` + Configuracao de Pre-Entrevista habilitada
// com uma pergunta obrigatoria -- estado minimo necessario para a maioria dos testes desta
// fase.
export async function createConfiguredApplicationFixture(
  app: ReturnType<typeof createApp>,
  suffix: string
) {
  const owner = await createUser(app, `owner-pint-${suffix}`);
  const { organization } = await createOrganization(app, owner.id);
  const candidate = await createCandidate(app, organization.id, owner.id);
  const job = await createPublishedOpenJob(app, organization.id, owner.id, suffix);
  const application = await createApplication(
    app,
    organization.id,
    owner.id,
    candidate.id,
    job.id,
    job.versionId
  );
  const question = await createQuestionCatalogItem(app, organization.id, owner.id, suffix);
  await enablePreInterviewSettings(app, organization.id, job.id, owner.id, [
    question.questionCatalogItemId
  ]).expect(200);
  return { owner, organization, candidate, job, application, question };
}

export async function createPublicJobOpeningFixture(
  app: ReturnType<typeof createApp>,
  suffix: string
) {
  const owner = await createUser(app, `owner-pub-pint-${suffix}`);
  const { organization } = await createOrganization(app, owner.id);
  const job = await createPublishedOpenJob(app, organization.id, owner.id, suffix);
  const slug = await publishJobOpeningPublicly(app, organization.id, job.id, owner.id, suffix);
  const question = await createQuestionCatalogItem(app, organization.id, owner.id, suffix);
  await enablePreInterviewSettings(app, organization.id, job.id, owner.id, [
    question.questionCatalogItemId
  ]).expect(200);
  return {
    ownerId: owner.id,
    organizationId: organization.id,
    jobOpeningId: job.id,
    slug,
    question
  };
}

export function applicationPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Maria da Silva",
    email: `${unique("candidate")}@example.com`,
    preferredName: "Maria",
    phone: "+55 11 90000-0000",
    location: { city: "Sao Paulo", state: "SP" },
    consent: { granted: true, termsVersion: "1.0" },
    ...overrides
  };
}

export function submitApplication(
  app: ReturnType<typeof createApp>,
  slug: string,
  payload: Record<string, unknown>,
  idempotencyKey: string = crypto.randomUUID()
) {
  return request(app)
    .post(`/api/public/job-openings/${slug}/applications`)
    .set("Idempotency-Key", idempotencyKey)
    .send(payload);
}
