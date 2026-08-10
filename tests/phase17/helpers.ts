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
  createPostgresPublicApplicationService,
  type PublicApplicationTestingHooks
} from "../../src/server/public-applications/service";
import { createPostgresQuestionService } from "../../src/server/questions/service";
import type { PostgresTestDatabase } from "../helpers/postgres-test-db";

export const platformHeaders = { "x-dev-platform-admin": "true" };

export function userHeaders(userId: string) {
  return { "x-dev-user-id": userId };
}

export function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
}

// `testingHooks` (revisao destrutiva, itens 13/14/32): permite provocar falha deliberada
// dentro da transacao da submissao publica, DEPOIS de Candidate/Consent ja terem sido
// escritos, para provar rollback real -- mesmo padrao ja usado por `OnOrganizationCreatedHook`
// (Fase 15). Em producao (`src/server/index.ts`) nunca e passado, entao o hook e sempre um
// no-op real.
export function createApp(
  database: PostgresTestDatabase,
  testingHooks: PublicApplicationTestingHooks = {}
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
      candidateApplicationService,
      testingHooks
    )
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
  const slug = unique("pub-org");
  const response = await request(app)
    .post("/api/organizations")
    .set(platformHeaders)
    .send({ name: `Organization ${slug}`, slug, initialOwnerUserId: ownerId })
    .expect(201);
  return response.body as { organization: { id: string } };
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

async function createCompetencyCatalogItem(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  const competency = await request(app)
    .post(`/api/organizations/${organizationId}/competencies`)
    .set(userHeaders(ownerId))
    .send({
      code: `PUB-CMP-${suffix}`,
      name: `Public competency ${suffix}`,
      category: "technical",
      definition: "Definition",
      positiveEvidences: [{ text: "Yes", displayOrder: 0 }],
      negativeEvidences: [{ text: "No", displayOrder: 0 }],
      practicalExamples: [{ text: "Example", displayOrder: 0 }],
      proficiencyLevels: levels(),
      status: "active"
    })
    .expect(201);
  const catalog = await request(app)
    .get(`/api/organizations/${organizationId}/competencies/catalog`)
    .set(userHeaders(ownerId))
    .expect(200);
  const catalogItem = catalog.body[0] as { competencyCatalogItemId: string };
  return { ...catalogItem, organizationCompetencyId: competency.body.id as string };
}

async function createPublishedJobProfileVersion(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  const competency = await createCompetencyCatalogItem(
    app,
    organizationId,
    ownerId,
    `JOB-${suffix}`
  );
  const profile = await request(app)
    .post(`/api/organizations/${organizationId}/job-profiles`)
    .set(userHeaders(ownerId))
    .send({ code: `PUB-JOB-${suffix}`, name: `Job ${suffix}` })
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
          competencyCatalogItemId: competency.competencyCatalogItemId,
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

function openingInput(jobProfileVersionId: string, suffix: string) {
  return {
    code: `PUB-${suffix}`,
    title: `Internal ${suffix}`,
    publicTitle: `Public ${suffix}`,
    positionsCount: 2,
    jobProfileVersionId
  };
}

// Publica uma Vaga aberta em uma Organization JA EXISTENTE e a divulga publicamente com um
// slug unico. Usado tanto por `createPublicJobOpeningFixture` (Organization nova) quanto por
// testes que precisam de uma SEGUNDA Vaga na MESMA Organization (por exemplo, para verificar
// reutilizacao de Candidate entre Vagas do mesmo cliente).
export async function addPublicJobOpeningToOrganization(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  const jobProfileVersion = await createPublishedJobProfileVersion(
    app,
    organizationId,
    ownerId,
    suffix
  );

  const opening = await request(app)
    .post(`/api/organizations/${organizationId}/job-openings`)
    .set(userHeaders(ownerId))
    .send(openingInput(jobProfileVersion.id, suffix))
    .expect(201);
  const draft = await request(app)
    .get(`/api/organizations/${organizationId}/job-openings/${opening.body.id}/draft`)
    .set(userHeaders(ownerId))
    .expect(200);
  await request(app)
    .post(
      `/api/organizations/${organizationId}/job-openings/${opening.body.id}/drafts/${draft.body.id}/publish`
    )
    .set(userHeaders(ownerId))
    .expect(200);
  await request(app)
    .post(`/api/organizations/${organizationId}/job-openings/${opening.body.id}/open`)
    .set(userHeaders(ownerId))
    .expect(200);

  const slug = unique(`vaga-${suffix}`).toLowerCase();
  await request(app)
    .patch(`/api/organizations/${organizationId}/job-openings/${opening.body.id}/publication`)
    .set(userHeaders(ownerId))
    .send({ isPublic: true, publicSlug: slug, showSalary: false })
    .expect(200);

  return { jobOpeningId: opening.body.id as string, slug };
}

// Cria uma Organization com Owner, publica uma Vaga aberta e a divulga publicamente com um
// slug unico -- estado minimo necessario para qualquer teste da Fase 17 (candidatura
// publica). Retorna tudo que os testes tipicamente precisam.
export async function createPublicJobOpeningFixture(
  app: ReturnType<typeof createApp>,
  suffix: string
) {
  const owner = await createUser(app, `owner-${suffix}`);
  const { organization } = await createOrganization(app, owner.id);
  const { jobOpeningId, slug } = await addPublicJobOpeningToOrganization(
    app,
    organization.id,
    owner.id,
    suffix
  );

  return {
    ownerId: owner.id,
    organizationId: organization.id,
    jobOpeningId,
    slug
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
