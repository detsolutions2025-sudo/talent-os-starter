// Fase 33 (Production Hardening -- E2E + Estabilizacao minima). Helpers compartilhados pela
// bateria E2E (tests/e2e/**). Reaproveita, sem duplicar, os mesmos padroes ja usados por toda a
// suite de integracao HTTP existente (tests/phase17..31): `createServer()` real, Postgres real
// via schema descartavel (tests/helpers/postgres-test-db.ts), e os dois "test doubles" de
// autenticacao ja estabelecidos:
//
// - `DevActorProvider` (`http/actor-provider.ts`): usado pela maioria dos cenarios. Resolve o
//   Actor a partir de headers `x-dev-*`, mas SO existe fora de producao (fail-closed em
//   qualquer outro APP_ENV, `http/dev-auth.ts`) -- a partir do header, User/Membership/RBAC/
//   tenant sao 100% reais (mesma cadeia que uma requisicao de producao percorre).
// - `SupabaseActorProvider` real + `FakeSupabaseAdminPort` (`tests/phase29/helpers.ts`): usado
//   pelo cenario de auth (`auth-tenant-rbac.test.ts`) que precisa provar a cadeia HTTP completa
//   -- login no provider -> POST /auth/session -> cookie HttpOnly -> requisicao autenticada.
//   Apenas a fronteira EXTERNA (o provider Supabase em si) e substituida; verificacao de
//   assinatura JWT, resolucao de AuthIdentity/User/Membership e RBAC continuam reais.
//
// Nenhum backdoor novo foi criado -- ambos os mecanismos ja existem e sao usados por toda a
// suite desde as Fases 1/29.
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createServer } from "../../src/server/app";
import { createCoreService } from "../../src/server/core/service";
import { createOrganizationBlueprintOnboardingHook } from "../../src/server/blueprints/organization-onboarding";
import { createPostgresBlueprintService } from "../../src/server/blueprints/service";
import { createPostgresCandidateApplicationService } from "../../src/server/candidate-applications/service";
import { createPostgresCandidateService } from "../../src/server/candidates/service";
import { createPostgresCompetencyService } from "../../src/server/competencies/service";
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
import { createPostgresAccessGrantService } from "../../src/server/access-grants/service";
import { createPostgresAIService } from "../../src/server/ai/service";
import type { RateLimitStore } from "../../src/server/core/rate-limit-store";
import { DevActorProvider, SupabaseActorProvider } from "../../src/server/http/actor-provider";
import { createPostgresAuthService } from "../../src/server/auth/service";
import type { AuthService } from "../../src/server/auth/service";
import type { SupabaseAdminPort, SupabaseSession } from "../../src/server/auth/supabase-admin-port";
import type { PostgresTestDatabase } from "../helpers/postgres-test-db";
import { createTestJwks, TEST_AUDIENCE, TEST_ISSUER, type TestJwks } from "../phase29/jwt-fixtures";

export const platformHeaders = { "x-dev-platform-admin": "true" };

export function userHeaders(userId: string) {
  return { "x-dev-user-id": userId };
}

export function unique(value: string) {
  return `${value}-${randomUUID()}`;
}

type ServerParams = Parameters<typeof createServer>;

// Monta a MESMA composicao completa de servicos de dominio para as duas variantes de app
// (dev-auth e auth real) -- unica diferenca entre elas e o `actorProvider`/`auth` passados,
// nunca a superficie de dominio disponivel.
function buildFullApp(
  database: PostgresTestDatabase,
  actorProvider: ServerParams[1],
  auth?: AuthService,
  checkDatabaseReady?: ServerParams[30],
  // Fase 33. Ausente (default) = cada RateLimiter usa seu proprio in-memory (preserva
  // isolamento entre `it()` do mesmo arquivo -- mesma decisao de `index.ts` vs. factories
  // tomada na Fase 32). `rate-limiting-http.test.ts` passa explicitamente
  // `new PostgresRateLimitStore(database.pool)` para provar, via HTTP real, que a app tambem
  // usa o store distribuido corretamente -- exatamente como `index.ts` faz em producao.
  rateLimitStore?: RateLimitStore
) {
  const aiService = createPostgresAIService(database.pool, { rateLimitStore });
  const candidateService = createPostgresCandidateService(database.pool);
  const candidateApplicationService = createPostgresCandidateApplicationService(database.pool);
  return createServer(
    createCoreService(
      new PostgresCoreRepository(database.pool),
      createOrganizationBlueprintOnboardingHook()
    ),
    actorProvider,
    createPostgresDnaService(database.pool),
    createPostgresOrganizationalUnitService(database.pool),
    createPostgresCompetencyService(database.pool),
    createPostgresJobProfileService(database.pool),
    createPostgresQuestionService(database.pool),
    createPostgresJobOpeningService(database.pool, rateLimitStore),
    candidateService,
    candidateApplicationService,
    createPostgresInterviewService(database.pool),
    aiService,
    createPostgresBlueprintService(database.pool),
    createPostgresPublicApplicationService(
      database.pool,
      candidateService,
      candidateApplicationService,
      {},
      rateLimitStore
    ),
    createPostgresPreInterviewService(database.pool, {}, rateLimitStore),
    createPostgresBehavioralAssessmentService(database.pool, {}, rateLimitStore),
    createPostgresPreAnalysisService(database.pool, aiService),
    createPostgresCandidateDossierService(database.pool),
    createPostgresProposalService(database.pool, rateLimitStore),
    createPostgresOnboardingService(database.pool),
    createPostgresEmploymentService(database.pool),
    createPostgresDevelopmentRetentionService(database.pool),
    createPostgresOffboardingService(database.pool),
    createPostgresAccessGrantService(database.pool),
    auth,
    undefined, // isProductionEnv
    undefined, // trustedFrontendOrigins
    undefined, // trustProxyConfig
    undefined, // supabaseAuthOrigin
    undefined, // isProductionOrStagingEnv
    checkDatabaseReady
  );
}

// App padrao da bateria E2E: DevActorProvider (mesmo mecanismo de toda a suite existente) com
// TODOS os servicos de dominio ligados -- usado por todo cenario que nao precisa provar a
// cadeia HTTP completa de autenticacao em si (recrutamento, publico, lifecycle, offboarding/
// access, rate limiting, health/readiness).
//
// `checkDatabaseReady` (opcional): ausente = default otimista de `createServer` (preserva o
// comportamento de todo outro helper de fase que nao conhece este parametro). O cenario de
// health/readiness (`health-readiness.test.ts`) passa uma checagem REAL contra o Postgres de
// teste, exatamente como `index.ts` faz em producao.
export function createFullApp(
  database: PostgresTestDatabase,
  checkDatabaseReady?: ServerParams[30],
  rateLimitStore?: RateLimitStore
) {
  return buildFullApp(
    database,
    new DevActorProvider(),
    undefined,
    checkDatabaseReady,
    rateLimitStore
  );
}

// Fronteira externa substituida (SPEC-028/mesmo padrao de tests/phase29/helpers.ts): nunca fala
// com a rede real, apenas simula o comportamento do Supabase Auth (emitir/renovar/revogar
// sessao) o suficiente para exercitar a cadeia REAL de verificacao de assinatura JWT +
// resolucao de AuthIdentity/User/Membership do lado da aplicacao.
export class FakeSupabaseAdminPortE2E implements SupabaseAdminPort {
  private readonly emailToExternalId = new Map<string, string>();
  constructor(private readonly jwks: TestJwks) {}

  async inviteUserByEmail(email: string) {
    const externalId = this.emailToExternalId.get(email) ?? randomUUID();
    this.emailToExternalId.set(email, externalId);
    return { externalId };
  }

  async issueSessionForEmail(email: string) {
    const externalId = this.emailToExternalId.get(email) ?? randomUUID();
    this.emailToExternalId.set(email, externalId);
    const accessToken = await this.jwks.signToken({ sub: externalId, email, emailVerified: true });
    return { accessToken, refreshToken: `fake-refresh-${externalId}`, externalId };
  }

  async refreshSession(refreshToken: string): Promise<SupabaseSession> {
    const externalId = refreshToken.replace("fake-refresh-", "");
    const accessToken = await this.jwks.signToken({
      sub: externalId,
      email: null as unknown as string
    });
    return { accessToken, refreshToken, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  }

  async revokeRefreshToken(): Promise<void> {}
  async signOutAllSessions(): Promise<void> {}
}

export async function createAuthTestContext(database: PostgresTestDatabase) {
  const jwks = await createTestJwks();
  const provider = new FakeSupabaseAdminPortE2E(jwks);
  const authService = createPostgresAuthService(database.pool, {
    provider,
    getKey: jwks.getKey,
    jwtOptions: { issuer: TEST_ISSUER, audience: TEST_AUDIENCE }
  });
  return { jwks, provider, authService };
}

// App com a cadeia de autenticacao REAL completa (SupabaseActorProvider), mesma superficie de
// dominio de `createFullApp` -- usado exclusivamente por `auth-tenant-rbac.test.ts` para a
// parte que precisa provar a cadeia HTTP completa (login -> cookie -> requisicao autenticada).
export function createFullAuthApp(
  database: PostgresTestDatabase,
  ctx: Awaited<ReturnType<typeof createAuthTestContext>>
) {
  return buildFullApp(database, new SupabaseActorProvider(ctx.authService), ctx.authService);
}

// App de SETUP para o cenario de auth real: DevActorProvider (mesmo mecanismo de toda a suite
// -- cria Users/Organizations/Memberships via headers `x-dev-*`) MAS com `auth` (AuthService)
// tambem ligado, exatamente como `tests/phase29/helpers.ts` (`createDevAuthApp`) -- necessario
// porque `/api/platform/organizations/bootstrap` (e as demais rotas de `auth`) so sao
// registradas quando `auth` e passado a `createServer()`. Nunca usado para a requisicao final
// que o teste quer provar (essa usa `createFullAuthApp` com o cookie real).
export function createFullDevAppWithAuth(
  database: PostgresTestDatabase,
  ctx: Awaited<ReturnType<typeof createAuthTestContext>>
) {
  return buildFullApp(database, new DevActorProvider(), ctx.authService);
}

// Bootstrap "Caminho A" (SPEC-028 s16: e-mail do owner ja confirmado) -- mesmo padrao ja
// provado por tests/phase29/bootstrap-postgres.test.ts: cria o User via dev-auth (setup, nunca
// exposto ao cenario real de auth), vincula um AuthIdentity real via INSERT direto (simula uma
// confirmacao de e-mail ja concluida pelo provider -- nunca uma tabela de dominio, apenas a
// ponte tecnica entre User e o `external_id` do provider), e usa
// `POST /api/platform/organizations/bootstrap` para criar Organization + primeiro Membership
// (owner) atomicamente. Devolve tudo que o cenario de auth real precisa para "logar" essa
// pessoa de verdade a partir daqui.
export async function bootstrapOwnerWithRealSession(
  devApp: ReturnType<typeof createFullApp>,
  ctx: Awaited<ReturnType<typeof createAuthTestContext>>,
  database: PostgresTestDatabase,
  suffix: string
) {
  const owner = await createUser(devApp, `owner-real-${suffix}`);
  const emailResult = await database.pool.query(`SELECT email FROM users WHERE id = $1`, [
    owner.id
  ]);
  const email = emailResult.rows[0].email as string;

  // `issueSessionForEmail` e a UNICA fonte do `externalId` real (gerado e memorizado por ela
  // mesma, no mapa interno de `FakeSupabaseAdminPortE2E`) -- chamado ANTES do INSERT abaixo
  // para nunca inventar um externalId proprio que divirja do que o token realmente carrega.
  const { accessToken, refreshToken, externalId } = await ctx.provider.issueSessionForEmail(email);
  await database.pool.query(
    `INSERT INTO auth_identities (id, user_id, provider, external_id) VALUES ($1, $2, 'supabase', $3)`,
    [`ai_${owner.id}`, owner.id, externalId]
  );

  const slug = unique(`e2e-real-org-${suffix}`);
  const bootstrap = await request(devApp)
    .post("/api/platform/organizations/bootstrap")
    .set(platformHeaders)
    .send({ organizationName: `Org ${suffix}`, organizationSlug: slug, ownerEmail: email })
    .expect(201);

  return {
    userId: owner.id as string,
    email,
    organizationId: bootstrap.body.organization.id as string,
    accessToken,
    refreshToken
  };
}

export function extractCookieHeader(setCookieHeaders: string | string[] | undefined) {
  if (!setCookieHeaders) return "";
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return list.map((entry) => entry.split(";")[0]).join("; ");
}

export async function createUser(app: ReturnType<typeof createFullApp>, prefix: string) {
  const response = await request(app)
    .post("/api/dev/users")
    .set(platformHeaders)
    .send({ name: prefix, email: `${unique(prefix)}@example.com` })
    .expect(201);
  return response.body as { id: string };
}

export async function createOrganization(app: ReturnType<typeof createFullApp>, ownerId: string) {
  const slug = unique("e2e-org");
  const response = await request(app)
    .post("/api/organizations")
    .set(platformHeaders)
    .send({ name: `Organization ${slug}`, slug, initialOwnerUserId: ownerId })
    .expect(201);
  return response.body as { organization: { id: string } };
}

export async function addMembership(
  app: ReturnType<typeof createFullApp>,
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
  app: ReturnType<typeof createFullApp>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  const competency = await request(app)
    .post(`/api/organizations/${organizationId}/competencies`)
    .set(userHeaders(ownerId))
    .send({
      code: `E2E-CMP-${suffix}`,
      name: `E2E competency ${suffix}`,
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
  app: ReturnType<typeof createFullApp>,
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
    .send({ code: `E2E-JOB-${suffix}`, name: `Job ${suffix}` })
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

// Cria uma Vaga interna publicada e aberta (nao necessariamente publica) -- usada pelo cenario
// de recrutamento (candidatura administrativa, sem passar pelo portal publico).
export async function createOpenJobOpening(
  app: ReturnType<typeof createFullApp>,
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
    .send({
      code: `E2E-${suffix}`,
      title: `Internal ${suffix}`,
      publicTitle: `Public ${suffix}`,
      positionsCount: 1,
      jobProfileVersionId: jobProfileVersion.id
    })
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
  return opening.body.id as string;
}

// Divulga publicamente uma Vaga ja aberta com um slug unico -- usado pelo cenario de fluxo
// publico.
export async function publishJobOpeningPublicly(
  app: ReturnType<typeof createFullApp>,
  organizationId: string,
  ownerId: string,
  jobOpeningId: string,
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

// Fixture completa: Organization + owner + Vaga aberta e publicada publicamente -- estado
// minimo comum aos cenarios de recrutamento e fluxo publico.
export async function createOrganizationWithPublicJobOpeningFixture(
  app: ReturnType<typeof createFullApp>,
  suffix: string
) {
  const owner = await createUser(app, `owner-${suffix}`);
  const { organization } = await createOrganization(app, owner.id);
  const jobOpeningId = await createOpenJobOpening(app, organization.id, owner.id, suffix);
  const slug = await publishJobOpeningPublicly(
    app,
    organization.id,
    owner.id,
    jobOpeningId,
    suffix
  );
  return { ownerId: owner.id, organizationId: organization.id, jobOpeningId, slug };
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

export function submitPublicApplication(
  app: ReturnType<typeof createFullApp>,
  slug: string,
  payload: Record<string, unknown>,
  idempotencyKey: string = randomUUID()
) {
  return request(app)
    .post(`/api/public/job-openings/${slug}/applications`)
    .set("Idempotency-Key", idempotencyKey)
    .send(payload);
}

// Cria uma candidatura ADMINISTRATIVA (via portal interno, nunca o publico) diretamente pronta
// para avancar de estagio -- usada pelo cenario de recrutamento (B), que quer provar o
// processo seletivo interno, nao o formulario publico (ja coberto pelo cenario C).
export async function createAdministrativeApplication(
  app: ReturnType<typeof createFullApp>,
  fixture: { organizationId: string; jobOpeningId: string; ownerId: string; slug: string }
) {
  const submitted = await submitPublicApplication(app, fixture.slug, applicationPayload()).expect(
    201
  );
  const applicationId = submitted.body.submissionId
    ? await resolveApplicationIdBySubmission(app, fixture.organizationId, fixture.ownerId)
    : undefined;
  return applicationId as string;
}

async function resolveApplicationIdBySubmission(
  app: ReturnType<typeof createFullApp>,
  organizationId: string,
  ownerId: string
) {
  const list = await request(app)
    .get(`/api/organizations/${organizationId}/candidate-applications`)
    .set(userHeaders(ownerId))
    .expect(200);
  const applications = list.body as Array<{ id: string; createdAt: string }>;
  applications.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return applications[0].id;
}

// Employment `active` a partir de uma candidatura contratada -- reaproveita o mesmo padrao ja
// validado por tests/phase27-28/helpers.ts, adaptado a superficie de fixtures deste diretorio.
export async function hireAndActivateEmployment(
  app: ReturnType<typeof createFullApp>,
  organizationId: string,
  ownerId: string,
  applicationId: string
) {
  await request(app)
    .post(`/api/organizations/${organizationId}/candidate-applications/${applicationId}/hire`)
    .set(userHeaders(ownerId))
    .send({ reason: "Contratacao para cenario E2E." })
    .expect(200);
  const employment = await request(app)
    .post(`/api/organizations/${organizationId}/employments`)
    .set(userHeaders(ownerId))
    .set("Idempotency-Key", randomUUID())
    .send({
      originType: "recruitment",
      candidateApplicationId: applicationId,
      effectiveStartDate: "2026-01-01",
      originReason: "Contratacao aprovada para cenario E2E."
    })
    .expect(201);
  await request(app)
    .post(`/api/organizations/${organizationId}/employments/${employment.body.id}/activate`)
    .set(userHeaders(ownerId))
    .set("Idempotency-Key", randomUUID())
    .send({})
    .expect(200);
  return {
    employmentId: employment.body.id as string,
    organizationPersonId: employment.body.organizationPersonId as string
  };
}
