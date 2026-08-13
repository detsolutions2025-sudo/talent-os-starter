import request from "supertest";
import type { CreateAIServiceOptions } from "../../src/server/ai/service";
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
import { createPostgresPreInterviewService } from "../../src/server/pre-interviews/service";
import { createPostgresPublicApplicationService } from "../../src/server/public-applications/service";
import { createPostgresQuestionService } from "../../src/server/questions/service";
import { createPostgresBehavioralAssessmentService } from "../../src/server/behavioral-assessments/service";
import {
  createPostgresPreAnalysisService,
  type PreAnalysisTestingHooks
} from "../../src/server/pre-analyses/service";
import {
  preAnalysisFeatureKey,
  preAnalysisConsentPurpose
} from "../../src/server/pre-analyses/types";
import type { PostgresTestDatabase } from "../helpers/postgres-test-db";

export const platformHeaders = { "x-dev-platform-admin": "true" };
export { preAnalysisFeatureKey, preAnalysisConsentPurpose };

export function userHeaders(userId: string) {
  return { "x-dev-user-id": userId };
}

export function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
}

export function createAppWithServices(
  database: PostgresTestDatabase,
  options: {
    aiOptions?: CreateAIServiceOptions;
    preAnalysisTestingHooks?: PreAnalysisTestingHooks;
    reconciliationThresholdsMs?: { requested: number; running: number };
  } = {}
) {
  const aiService = createPostgresAIService(database.pool, options.aiOptions ?? {});
  const candidateService = createPostgresCandidateService(database.pool);
  const candidateApplicationService = createPostgresCandidateApplicationService(database.pool);
  const preAnalysisService = createPostgresPreAnalysisService(
    database.pool,
    aiService,
    options.preAnalysisTestingHooks ?? {},
    options.reconciliationThresholdsMs
  );
  const app = createServer(
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
    preAnalysisService
  );
  return { app, aiService, preAnalysisService };
}

export async function createUser(app: ReturnType<typeof createServer>, prefix: string) {
  const response = await request(app)
    .post("/api/dev/users")
    .set(platformHeaders)
    .send({ name: prefix, email: `${unique(prefix)}@example.com` })
    .expect(201);
  return response.body as { id: string };
}

export async function createOrganization(app: ReturnType<typeof createServer>, ownerId: string) {
  const slug = unique("pa-org");
  const response = await request(app)
    .post("/api/organizations")
    .set(platformHeaders)
    .send({ name: `Organization ${slug}`, slug, initialOwnerUserId: ownerId })
    .expect(201);
  return response.body as { organization: { id: string } };
}

export async function addMembership(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  userId: string,
  role: "admin" | "member"
) {
  await request(app)
    .post(`/api/organizations/${organizationId}/memberships`)
    .set(userHeaders(ownerId))
    .send({ userId, role })
    .expect(201);
}

export type OrgFixture = {
  organizationId: string;
  ownerId: string;
  adminId: string;
  memberId: string;
};

export async function createOrgWithMembers(
  app: ReturnType<typeof createServer>
): Promise<OrgFixture> {
  const owner = await createUser(app, "owner");
  const admin = await createUser(app, "admin");
  const member = await createUser(app, "member");
  const org = await createOrganization(app, owner.id);
  await addMembership(app, org.organization.id, owner.id, admin.id, "admin");
  await addMembership(app, org.organization.id, owner.id, member.id, "member");
  return {
    organizationId: org.organization.id,
    ownerId: owner.id,
    adminId: admin.id,
    memberId: member.id
  };
}

// Candidate ativo + consentimento com o proposito CANONICO desta Fase (`ai_pre_analysis`) --
// nunca o consentimento operacional generico, mesma prova por construcao ja usada pela Fase 19.
export async function createCandidateWithConsent(
  app: ReturnType<typeof createServer>,
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
      professionalSummary: "Resumo profissional de teste com experiencia relevante.",
      consent: { status: "granted", source: "manual", termsVersion: "v1", purpose: "Recruiting" },
      ...overrides
    })
    .expect(201);
  const candidate = response.body as { id: string };
  await request(app)
    .post(`/api/organizations/${organizationId}/candidates/${candidate.id}/consents`)
    .set(userHeaders(ownerId))
    .send({
      status: "granted",
      source: "manual",
      termsVersion: "v1",
      purpose: preAnalysisConsentPurpose
    })
    .expect(201);
  return candidate;
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
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  await request(app)
    .post(`/api/organizations/${organizationId}/competencies`)
    .set(userHeaders(ownerId))
    .send({
      code: `PA-CMP-${suffix}`,
      name: `Pre-analysis competency ${suffix}`,
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
  const item = catalog.body[0] as { competencyCatalogItemId: string };
  const profile = await request(app)
    .post(`/api/organizations/${organizationId}/job-profiles`)
    .set(userHeaders(ownerId))
    .send({ code: `PA-JOB-${suffix}`, name: `Job ${suffix}` })
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
  app: ReturnType<typeof createServer>,
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
      code: `PA-${suffix}`,
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

export async function createApplication(
  app: ReturnType<typeof createServer>,
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

// ------------------------------------------------------------------------------------------
// Infraestrutura de IA -- mesmo padrao ja usado por tests/phase11/helpers.ts
// (setupExecutableFeature), fixado no feature_key definitivo desta Fase
// (`candidate_pre_analysis`) e no outputSchema fechado exigido por esta SPEC.
// ------------------------------------------------------------------------------------------

// Achado da revisao destrutiva final: `MinimalJsonSchema` (Fase 11, `prompt-renderer.ts`) usa
// `inputSchema.properties` tambem para MINIMIZAR o payload real enviado ao provider
// (`minimizeInput`) -- um `inputSchema` sem `properties.evidences` declarado faz o Gateway
// reduzir o `input` inteiro a `{}` VAZIO, silenciosamente, sem nenhum erro. Confirmado
// empiricamente (nao presumido): `minimizeInput({evidences:[...]}, {type:"object"})` retorna
// `{}`. Este schema declara exatamente a unica chave que a Fase 20 envia (`evidences`),
// espelhando `PreAnalysisGatewayInput` -- nunca omitir esta declaracao ao configurar o Prompt
// Registry real (ver runbook, `docs/06-engenharia/runbook-bootstrap-pre-analise-ia.md`).
export const PRE_ANALYSIS_INPUT_SCHEMA = {
  type: "object",
  properties: {
    evidences: { type: "array" }
  }
};

export const PRE_ANALYSIS_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "limitations", "findings"],
  properties: {
    summary: { type: "string" },
    limitations: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "text", "evidenceRefs"],
        properties: {
          category: { type: "string" },
          text: { type: "string" },
          evidenceRefs: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
};

export async function allowPlatformAi(
  app: ReturnType<typeof createServer>,
  organizationId: string
) {
  await request(app)
    .put(`/api/platform/organizations/${organizationId}/ai/settings/platform-allowed`)
    .set(platformHeaders)
    .send({ platformAiAllowed: true })
    .expect(200);
}

export async function enableOrganizationAi(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string
) {
  await request(app)
    .put(`/api/organizations/${organizationId}/ai/settings`)
    .set(userHeaders(ownerId))
    .send({ organizationAiEnabled: true })
    .expect(200);
}

export async function ensureFeatureRegistered(app: ReturnType<typeof createServer>) {
  const response = await request(app)
    .post("/api/platform/ai/features")
    .set(platformHeaders)
    .send({ featureKey: preAnalysisFeatureKey, name: "Pre-Analise Assistida por IA" });
  if (response.status !== 201 && response.status !== 409) {
    throw new Error(`Failed to register feature: ${JSON.stringify(response.body)}`);
  }
  await request(app)
    .patch(`/api/platform/ai/features/${preAnalysisFeatureKey}/availability`)
    .set(platformHeaders)
    .send({ featureAvailableOnPlatform: true })
    .expect(200);
}

export async function enableOrganizationFeature(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string
) {
  await request(app)
    .patch(`/api/organizations/${organizationId}/ai/features/${preAnalysisFeatureKey}/enabled`)
    .set(userHeaders(ownerId))
    .send({ organizationFeatureEnabled: true })
    .expect(200);
}

export async function registerProvider(app: ReturnType<typeof createServer>, providerKey = "fake") {
  const response = await request(app)
    .post("/api/platform/ai/providers")
    .set(platformHeaders)
    .send({ providerKey, name: "Fake Provider" });
  if (response.status !== 201 && response.status !== 409) {
    throw new Error(`Failed to register provider: ${JSON.stringify(response.body)}`);
  }
}

export async function registerModel(
  app: ReturnType<typeof createServer>,
  provider: string,
  modelKey: string
) {
  const response = await request(app)
    .post("/api/platform/ai/models")
    .set(platformHeaders)
    .send({ provider, modelKey, providerModelIdentifier: `${provider}-${modelKey}-v1` });
  if (response.status !== 201 && response.status !== 409) {
    throw new Error(`Failed to register model: ${JSON.stringify(response.body)}`);
  }
}

export async function configureByok(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  provider: string
) {
  await request(app)
    .post(`/api/organizations/${organizationId}/ai/provider-configs`)
    .set(userHeaders(ownerId))
    .send({ provider, credentialMode: "customer_managed", secret: "super-secret-value" })
    .expect(201);
}

export async function createRoute(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  provider: string,
  modelKey: string
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/ai/routing`)
    .set(userHeaders(ownerId))
    .send({ featureKey: preAnalysisFeatureKey, provider, modelKey, priority: 1 });
  if (response.status !== 201) {
    throw new Error(`Failed to create route: ${JSON.stringify(response.body)}`);
  }
}

export async function createAndPublishPrompt(app: ReturnType<typeof createServer>) {
  const promptKey = unique("pre_analysis_prompt").replaceAll("-", "_");
  const draft = await request(app)
    .post("/api/platform/ai/prompts")
    .set(platformHeaders)
    .send({
      promptKey,
      featureKey: preAnalysisFeatureKey,
      template: "Sintetize as evidencias fornecidas em summary/limitations/findings.",
      inputSchema: PRE_ANALYSIS_INPUT_SCHEMA,
      outputSchema: PRE_ANALYSIS_OUTPUT_SCHEMA
    })
    .expect(201);
  await request(app)
    .post(`/api/platform/ai/prompts/${promptKey}/versions/${draft.body.version}/publish`)
    .set(platformHeaders)
    .expect(200);
  await request(app)
    .patch(`/api/platform/ai/features/${preAnalysisFeatureKey}/default-prompt`)
    .set(platformHeaders)
    .send({ promptKey })
    .expect(200);
  return { promptKey, version: draft.body.version as number };
}

// Setup ponta a ponta: catalogo + availability + prompt + provider + model + BYOK + routing,
// para que `candidate_pre_analysis` seja efetivamente executavel nesta Organization -- prova,
// por construcao, o procedimento de bootstrap operacional descrito no Plano Tecnico
// Consolidado (item 13).
export async function setupExecutablePreAnalysisFeature(
  app: ReturnType<typeof createServer>,
  fixture: OrgFixture,
  provider = "fake",
  modelKey = "fake-model"
) {
  await allowPlatformAi(app, fixture.organizationId);
  await enableOrganizationAi(app, fixture.organizationId, fixture.ownerId);
  await ensureFeatureRegistered(app);
  await enableOrganizationFeature(app, fixture.organizationId, fixture.ownerId);
  await registerProvider(app, provider);
  await registerModel(app, provider, modelKey);
  await configureByok(app, fixture.organizationId, fixture.ownerId, provider);
  await createRoute(app, fixture.organizationId, fixture.ownerId, provider, modelKey);
  const prompt = await createAndPublishPrompt(app);
  return { provider, modelKey, promptKey: prompt.promptKey };
}
