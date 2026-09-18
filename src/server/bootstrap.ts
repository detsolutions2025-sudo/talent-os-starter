import { createServer } from "./app";
import { createPostgresAIService } from "./ai/service";
import { UnavailableProviderAdapter } from "./ai/providers/unavailable-adapter";
import { UnavailableSecretManager } from "./ai/secrets/secret-manager";
import { createOrganizationBlueprintOnboardingHook } from "./blueprints/organization-onboarding";
import { createPostgresBlueprintService } from "./blueprints/service";
import { createPostgresCandidateApplicationService } from "./candidate-applications/service";
import { createPostgresCandidateService } from "./candidates/service";
import { createPostgresCompetencyService } from "./competencies/service";
import { createCoreService } from "./core/service";
import { createPostgresDnaService } from "./dna/service";
import { createPostgresInterviewService } from "./interviews/service";
import { createPostgresJobOpeningService } from "./job-openings/service";
import { createPostgresJobProfileService } from "./job-profiles/service";
import { createPostgresOrganizationalUnitService } from "./organizational-units/service";
import { createPostgresOnboardingService } from "./onboardings/service";
import { createPostgresEmploymentService } from "./employments/service";
import { createPostgresDevelopmentRetentionService } from "./development-retention/service";
import { createPostgresOffboardingService } from "./offboardings/service";
import { createPostgresAccessGrantService } from "./access-grants/service";
import { PostgresCoreRepository } from "./persistence/postgres-core-repository";
import { createPostgresPreInterviewService } from "./pre-interviews/service";
import { assertProductionConfig } from "./config-validation";
import { createPostgresPool, requirePostgresDatabaseUrl } from "./postgres";
import { PostgresRateLimitStore } from "./core/rate-limit-store";
import { createPostgresPublicApplicationService } from "./public-applications/service";
import { createPostgresQuestionService } from "./questions/service";
import { createPostgresBehavioralAssessmentService } from "./behavioral-assessments/service";
import { createPostgresPreAnalysisService } from "./pre-analyses/service";
import { createPostgresCandidateDossierService } from "./candidate-dossiers/service";
import { createPostgresProposalService } from "./proposals/service";
import {
  assertSupabaseAuthConfiguredForProduction,
  requireSupabaseAuthConfig
} from "./auth/config";
import { createRemoteProviderJwks } from "./auth/jwt";
import { createSupabaseAdminAdapter } from "./auth/supabase-admin-adapter";
import { createPostgresAuthService, type AuthService } from "./auth/service";
import { createActorProvider } from "./http/actor-provider";
import { parseTrustedOrigins, TRUSTED_FRONTEND_ORIGINS_ENV_VAR } from "./http/trusted-origins";
import { registerProcessResilienceHandlers } from "./observability/process-resilience";

// Extraido de `index.ts` (Wave de Hospedagem/Vercel) para que a MESMA sequencia de boot sirva
// dois entrypoints diferentes: o processo tradicional de longa duracao (`index.ts`, que chama
// `app.listen()` e `registerGracefulShutdown()` sobre o resultado desta funcao) e a Serverless
// Function do Vercel (`api/index.ts`, que nunca chama `listen()`/graceful shutdown -- a
// plataforma gerencia o ciclo de vida do processo, e o `app` exportado e reutilizado entre
// invocacoes "warm" do mesmo container).
//
// GARANTIA CRITICA preservada byte a byte desta extracao (provada por
// `tests/phase30/bootstrap-smoke.test.ts`, que faz spawn real de `src/server/index.ts`):
// `registerProcessResilienceHandlers()` roda ANTES de `assertProductionConfig()`, que por sua
// vez roda ANTES de qualquer criacao de pool/servico -- config invalida em producao/staging
// nunca chega a abrir uma conexao real com o Postgres, e falha de forma sempre visivel em
// stderr (via os handlers globais registrados na linha anterior). Qualquer mudanca na ORDEM das
// chamadas abaixo e uma mudanca de contrato coberta por aquele teste.
export type BuildAppOptions = {
  // Serverless (Vercel): cada instancia de function mantem seu proprio pool, e a concorrencia
  // real e alcancada por escalar HORIZONTALMENTE o numero de instancias, nunca por um pool
  // grande dentro de uma unica instancia -- ver docs/operacao/deploy-vercel.md. Default
  // (`undefined`) preserva exatamente o comportamento anterior a esta Wave (processo tradicional
  // de longa duracao, `createPostgresPool` sem overrides).
  poolOptions?: { max?: number; idleTimeoutMillis?: number; connectionTimeoutMillis?: number };
};

export function buildApp(options: BuildAppOptions = {}) {
  // FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 19). Registrado o mais cedo possivel no
  // boot -- antes de qualquer inicializacao que possa falhar de forma assincrona -- para que
  // nenhuma janela do processo fique sem os handlers globais de `uncaughtException`/
  // `unhandledRejection`.
  registerProcessResilienceHandlers();

  const appEnv = process.env.APP_ENV ?? "development";

  // Fase 30 (ADR-0027; SPEC-029 v1.0 -- veja config-validation.ts). Ponto UNICO de validacao de
  // PRESENCA de configuracao obrigatoria em producao/staging, chamado antes de qualquer outra
  // inicializacao significativa (pool do Postgres, authService, app.listen()). Nomeia TODAS as
  // variaveis ausentes de uma vez, nunca so a primeira. Fora de producao/staging, e no-op --
  // preserva o boot de development/test exatamente como antes desta fase.
  //
  // Fase 31 (ADR-0027 secao 17: "generalizar esse mesmo padrao [...] em um UNICO ponto de
  // validacao no boot"; SPEC-030 RN-045). `TRUSTED_FRONTEND_ORIGINS` (a origem confiavel do
  // frontend, usada por CORS E por CSRF -- ver `http/trusted-origins.ts`) e adicionada a ESTA
  // MESMA chamada central, nunca a um segundo gate de startup independente.
  assertProductionConfig(process.env, [TRUSTED_FRONTEND_ORIGINS_ENV_VAR]);

  const connectionString = requirePostgresDatabaseUrl();
  const pool = createPostgresPool(connectionString, options.poolOptions);

  // Fase 32 (ADR-0027 s9 "Rate Limiting Distribuido"). Store autoritativo, compartilhado entre
  // TODAS as instancias do processo Node via o MESMO pool Postgres acima -- nenhum servico/vendor
  // novo (ver `core/rate-limit-store.ts`).
  const rateLimitStore = new PostgresRateLimitStore(pool);

  // Fase 29 (ADR-0026; SPEC-028 v1.0). Fail-fast: producao NUNCA sobe sem configuracao real do
  // Supabase Auth -- nunca um fallback silencioso para dev-auth (SPEC-028 s22/CA-030).
  assertSupabaseAuthConfiguredForProduction();

  let authService: AuthService | undefined;
  if (
    process.env.VITE_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.VITE_SUPABASE_ANON_KEY
  ) {
    const supabaseConfig = requireSupabaseAuthConfig();
    authService = createPostgresAuthService(pool, {
      provider: createSupabaseAdminAdapter(supabaseConfig, process.env.VITE_SUPABASE_ANON_KEY),
      getKey: createRemoteProviderJwks(supabaseConfig.jwksUrl),
      jwtOptions: { issuer: supabaseConfig.issuer, audience: supabaseConfig.audience },
      rateLimitStore
    });
  }

  const actorProvider = createActorProvider(appEnv, { authService });
  const isProductionEnv = appEnv === "production";

  // Fase 31 (ADR-0027; SPEC-030 v1.0, secao 8). DELIBERADAMENTE diferente de `isProductionEnv`
  // acima -- ver `index.ts`/`app.ts` para o contrato completo.
  const isProductionOrStagingEnv = appEnv === "production" || appEnv === "staging";

  const trustedFrontendOrigins = parseTrustedOrigins(process.env.TRUSTED_FRONTEND_ORIGINS);

  // RN-024/RN-025 (INV-05): ausente por default -- `trust proxy` permanece desabilitado ate que a
  // topologia real de hosting defina uma fronteira de proxy explicita.
  const trustProxyConfig = process.env.TRUST_PROXY_CONFIG;

  const supabaseAuthOrigin = process.env.VITE_SUPABASE_URL
    ? new URL(process.env.VITE_SUPABASE_URL).origin
    : undefined;

  const checkDatabaseReady = async () => {
    try {
      await pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  };

  const aiService = createPostgresAIService(pool, {
    ...(appEnv === "production"
      ? {
          secretManager: new UnavailableSecretManager(),
          resolveAdapter: () => new UnavailableProviderAdapter()
        }
      : {}),
    rateLimitStore
  });

  const candidateService = createPostgresCandidateService(pool);
  const candidateApplicationService = createPostgresCandidateApplicationService(pool);

  const app = createServer(
    createCoreService(
      new PostgresCoreRepository(pool),
      createOrganizationBlueprintOnboardingHook()
    ),
    actorProvider,
    createPostgresDnaService(pool),
    createPostgresOrganizationalUnitService(pool),
    createPostgresCompetencyService(pool),
    createPostgresJobProfileService(pool),
    createPostgresQuestionService(pool),
    createPostgresJobOpeningService(pool, rateLimitStore),
    candidateService,
    candidateApplicationService,
    createPostgresInterviewService(pool),
    aiService,
    createPostgresBlueprintService(pool),
    createPostgresPublicApplicationService(
      pool,
      candidateService,
      candidateApplicationService,
      {},
      rateLimitStore
    ),
    createPostgresPreInterviewService(pool, {}, rateLimitStore),
    createPostgresBehavioralAssessmentService(pool, {}, rateLimitStore),
    createPostgresPreAnalysisService(pool, aiService),
    createPostgresCandidateDossierService(pool),
    createPostgresProposalService(pool, rateLimitStore),
    createPostgresOnboardingService(pool),
    createPostgresEmploymentService(pool),
    createPostgresDevelopmentRetentionService(pool),
    createPostgresOffboardingService(pool),
    createPostgresAccessGrantService(pool),
    authService,
    isProductionEnv,
    trustedFrontendOrigins,
    trustProxyConfig,
    supabaseAuthOrigin,
    isProductionOrStagingEnv,
    checkDatabaseReady
  );

  return { app, pool };
}
