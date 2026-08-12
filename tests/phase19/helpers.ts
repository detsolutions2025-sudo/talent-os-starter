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
import { createPostgresPreInterviewService } from "../../src/server/pre-interviews/service";
import { createPostgresPublicApplicationService } from "../../src/server/public-applications/service";
import { createPostgresQuestionService } from "../../src/server/questions/service";
import {
  createPostgresBehavioralAssessmentService,
  BEHAVIORAL_ASSESSMENT_CONSENT_PURPOSE,
  type BehavioralAssessmentTestingHooks
} from "../../src/server/behavioral-assessments/service";
import {
  registerCalculator,
  type BehavioralAssessmentCalculator
} from "../../src/server/behavioral-assessments/calculations";
import type { PostgresTestDatabase } from "../helpers/postgres-test-db";

export const platformHeaders = { "x-dev-platform-admin": "true" };
export { BEHAVIORAL_ASSESSMENT_CONSENT_PURPOSE };

export function userHeaders(userId: string) {
  return { "x-dev-user-id": userId };
}

export function accessTokenHeaders(rawToken: string) {
  return { Authorization: `BehavioralAssessment ${rawToken}` };
}

export function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
}

// Mesmo padrao de seam de teste ja usado por `tests/phase18/helpers.ts::createApp` --
// `behavioralAssessmentTestingHooks` permite provocar falha deliberada dentro da transacao
// critica para provar rollback real.
export function createApp(
  database: PostgresTestDatabase,
  behavioralAssessmentTestingHooks: BehavioralAssessmentTestingHooks = {}
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
    createPostgresPreInterviewService(database.pool),
    createPostgresBehavioralAssessmentService(database.pool, behavioralAssessmentTestingHooks)
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
  const slug = unique("ba-org");
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

// Cria um Candidate ativo com um consentimento GENERICO (proposito "Recruiting", igual ao
// resto da plataforma) mais um segundo consentimento com o proposito CANONICO exigido por esta
// Fase (`purpose="behavioral_assessment"`) -- prova, por construcao, que o modulo nunca aceita
// o consentimento generico como se fosse o consentimento desta finalidade especifica.
export async function createCandidateWithConsent(
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
  const candidate = response.body as { id: string };
  await request(app)
    .post(`/api/organizations/${organizationId}/candidates/${candidate.id}/consents`)
    .set(userHeaders(ownerId))
    .send({
      status: "granted",
      source: "manual",
      termsVersion: "v1",
      purpose: BEHAVIORAL_ASSESSMENT_CONSENT_PURPOSE
    })
    .expect(201);
  return candidate;
}

export async function createCandidateWithoutBehavioralConsent(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/candidates`)
    .set(userHeaders(ownerId))
    .send({
      fullName: "Bruno SemConsentimento",
      preferredName: "Bruno",
      email: `${unique("candidate")}@example.com`,
      source: "manual",
      consent: { status: "granted", source: "manual", termsVersion: "v1", purpose: "Recruiting" }
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
  await request(app)
    .post(`/api/organizations/${organizationId}/competencies`)
    .set(userHeaders(ownerId))
    .send({
      code: `BA-CMP-${suffix}`,
      name: `Behavioral competency ${suffix}`,
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
    .send({ code: `BA-JOB-${suffix}`, name: `Job ${suffix}` })
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
      code: `BA-${suffix}`,
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

// ------------------------------------------------------------------------------------------
// Instrumento / versao
// ------------------------------------------------------------------------------------------

export const TEST_METHODOLOGY_KEY = "test-methodology";
export const TEST_CALCULATION_VERSION = "v1";

// Calculador de TESTE -- nunca instrumento/metodologia real, nunca DISC. Soma o valor numerico
// das respostas mapeadas a cada dimensao do manifesto; existe apenas para provar, ponta a
// ponta, que a arquitetura de calculador plugavel (identidade composta + validacao obrigatoria
// de manifesto) funciona de fato. Registrado uma unica vez pelo modulo -- `methodologyKey` e
// sempre gerado unico por teste (via `unique()`) para nunca colidir entre arquivos de teste
// executados no mesmo processo Vitest.
export function registerTestCalculator(methodologyKey: string, calculationMethodVersion: string) {
  const calculator: BehavioralAssessmentCalculator = {
    identity: { methodologyKey, calculationMethodVersion },
    validateVersionManifest(version, items) {
      for (const dimension of version.dimensions) {
        const hasMappedItem = items.some((item) => item.dimensionMapping.includes(dimension.code));
        if (!hasMappedItem) {
          throw new Error(`Dimension ${dimension.code} has no mapped item.`);
        }
      }
    },
    calculate(responses, itemsById, version) {
      const dimensions = version.dimensions.map((dimension) => {
        const values = responses
          .map((response) => ({
            response,
            item: itemsById.get(response.behavioralInstrumentItemId)
          }))
          .filter(({ item }) => item?.dimensionMapping.includes(dimension.code))
          .map(({ response }) =>
            typeof response.responseValue === "number" ? response.responseValue : 0
          );
        const total = values.reduce((sum, value) => sum + value, 0);
        return {
          code: dimension.code,
          value: total,
          label: dimension.name,
          interpretationText: total >= 0 ? "dentro do esperado" : "fora do esperado"
        };
      });
      return { dimensions, summaryText: `Resumo de teste com ${dimensions.length} dimensao(oes).` };
    }
  };
  registerCalculator(calculator);
  return calculator;
}

export function scaleItem(
  itemKey: string,
  dimensionCode: string,
  displayOrder: number,
  required = true
) {
  return {
    itemKey,
    itemType: "scale",
    promptText: `Item ${itemKey}`,
    required,
    displayOrder,
    dimensionMapping: [dimensionCode]
  };
}

export async function createPrivateInstrument(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/behavioral-instruments`)
    .set(userHeaders(ownerId))
    .send({ name: `Instrument ${suffix}`, description: `Description ${suffix}` })
    .expect(201);
  return response.body as { id: string };
}

export async function createGlobalInstrument(app: ReturnType<typeof createApp>, suffix: string) {
  const response = await request(app)
    .post("/api/platform/behavioral-instruments")
    .set(platformHeaders)
    .send({ name: `Global ${suffix}`, description: `Description ${suffix}` })
    .expect(201);
  return response.body as { id: string };
}

// Fixture completa e pronta para uso: instrumento proprio + versao ativa (com calculador de
// teste registrado e manifesto validado) + Configuracao da vaga apontando para ela +
// Candidate/CandidateApplication com consentimento da finalidade certa.
export async function createConfiguredAssessmentFixture(
  app: ReturnType<typeof createApp>,
  suffix: string
) {
  const owner = await createUser(app, `owner-ba-${suffix}`);
  const { organization } = await createOrganization(app, owner.id);
  const candidate = await createCandidateWithConsent(app, organization.id, owner.id);
  const job = await createPublishedOpenJob(app, organization.id, owner.id, suffix);
  const application = await createApplication(
    app,
    organization.id,
    owner.id,
    candidate.id,
    job.id,
    job.versionId
  );

  const methodologyKey = unique(TEST_METHODOLOGY_KEY);
  registerTestCalculator(methodologyKey, TEST_CALCULATION_VERSION);

  const instrument = await createPrivateInstrument(app, organization.id, owner.id, suffix);
  const draft = await request(app)
    .post(`/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions`)
    .set(userHeaders(owner.id))
    .send({
      methodologyKey,
      calculationMethodVersion: TEST_CALCULATION_VERSION,
      candidateResultVisibility: "summary",
      rawResponseOwnerVisibility: "visible",
      dimensions: [{ code: "energy", name: "Energia", required: true }],
      items: [scaleItem("energy-1", "energy", 0)]
    })
    .expect(201);
  const version = draft.body.version as { id: string };
  await request(app)
    .post(
      `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions/${version.id}/activate`
    )
    .set(userHeaders(owner.id))
    .expect(200);

  await request(app)
    .put(
      `/api/organizations/${organization.id}/job-openings/${job.id}/behavioral-assessment-settings`
    )
    .set(userHeaders(owner.id))
    .send({
      enabled: true,
      behavioralInstrumentId: instrument.id,
      behavioralInstrumentVersionId: version.id
    })
    .expect(200);

  return { owner, organization, candidate, job, application, instrument, version, methodologyKey };
}
