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
import { logger } from "./observability/logger";
import { registerProcessResilienceHandlers } from "./observability/process-resilience";
import { registerGracefulShutdown } from "./observability/graceful-shutdown";

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
// frontend, usada por CORS E por CSRF -- ver `http/trusted-origins.ts`) e adicionada a ESTA MESMA
// chamada central, nunca a um segundo gate de startup independente. `assertProductionConfig`
// (config-validation.ts) continua sem importar nada de nenhum modulo de dominio -- e este
// `index.ts`, o unico lugar que ja conhece toda a configuracao do boot, quem monta a lista
// completa de variaveis obrigatorias desta execucao.
assertProductionConfig(process.env, [TRUSTED_FRONTEND_ORIGINS_ENV_VAR]);

const port = Number(process.env.PORT ?? 3001);
const connectionString = requirePostgresDatabaseUrl();
const pool = createPostgresPool(connectionString);

// Fase 32 (ADR-0027 s9 "Rate Limiting Distribuido"). Store autoritativo, compartilhado entre
// TODAS as instancias do processo Node via o MESMO pool Postgres acima -- nenhum servico/vendor
// novo (ver `core/rate-limit-store.ts`). Uma unica instancia, injetada explicitamente em cada
// `createPostgresXService(pool, ...)` abaixo que expõe um namespace de rate limit; nenhuma
// dessas factories usa o default in-memory quando chamadas a partir daqui -- o default
// in-memory so e alcancado por testes que constroem o service diretamente sem passar este
// argumento (preserva o isolamento entre `it()` de um mesmo arquivo de teste).
const rateLimitStore = new PostgresRateLimitStore(pool);

// Phase 11 ships no real Secret Manager / provider adapter yet (SPEC-014 "Fora do escopo":
// "implementacao fisica do Secret Manager", "adapters de provider concretos"). InMemorySecretManager
// refuses to even construct when APP_ENV=production (see ai/secrets/secret-manager.ts), and
// FakeProviderAdapter must never be reachable in production either -- both would otherwise be a
// silent fake standing in for real infrastructure. At the same time, AI is an optional capability
// (ADR-0016): the rest of the platform (Candidate, Job Opening, CandidateApplication, Interview,
// ...) must keep booting and working normally even though no production-grade AI infrastructure is
// wired up yet. So in production the AI service is still created and mounted -- every endpoint that
// does not need a real secret or a real provider call (Feature Catalog, Provider Catalog, Model
// Registry, Prompt Registry, routing, policy toggles) keeps working -- but any operation that would
// need to actually store/resolve a secret or call a provider fails immediately and safely with a
// normalized configuration_error, instead of crashing the whole process at boot or silently
// pretending a fake credential/response is real.

// Fase 29 (ADR-0026; SPEC-028 v1.0). Fail-fast: producao NUNCA sobe sem configuracao real do
// Supabase Auth -- nunca um fallback silencioso para dev-auth (SPEC-028 s22/CA-030). Continua
// rodando aqui, na mesma posicao de sempre, como defesa em profundidade apos o gate central da
// Fase 30 acima (assertProductionConfig ja garante presenca; este validator especializado
// preserva seu proprio contrato e mensagens, sem nenhuma mudanca de comportamento).
assertSupabaseAuthConfiguredForProduction();

// `auth`/`SupabaseActorProvider` so sao construidos quando a configuracao esta presente -- em
// producao isso e GARANTIDO pelo fail-fast acima; fora de producao (nenhum projeto Supabase
// configurado ainda neste ambiente), o servidor de desenvolvimento continua subindo normalmente
// com `auth` ausente (rotas registradas condicionalmente, mesmo padrao ja usado por todo servico
// opcional deste roteador) e `DevActorProvider` cuidando da resolucao de Actor, exatamente como
// antes desta Fase -- ativar basta configurar as variaveis, sem nenhuma mudanca de codigo.
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

// Fase 31 (ADR-0027; SPEC-030 v1.0, secao 8: "staging... aplica exatamente a mesma politica de
// producao -- mesmos headers, mesma CSP"). Correcao pre-commit (gate 8): DELIBERADAMENTE
// diferente de `isProductionEnv` acima -- aquele e o contrato de cookie da Fase 29 (`Secure`,
// hoje so `production`, fora do escopo desta Fase alterar). Este flag e exclusivo dos headers de
// seguranca desta Fase (`app.ts`/`security-headers.ts`), nunca usado para cookies.
const isProductionOrStagingEnv = appEnv === "production" || appEnv === "staging";

// Fase 31 (ADR-0027; SPEC-030 v1.0). `assertProductionConfig` acima (com
// `TRUSTED_FRONTEND_ORIGINS_ENV_VAR`) ja GARANTE, em producao/staging, que esta variavel esta
// presente e nao-vazia -- o boot nunca alcanca esta linha caso contrario. Por isso um unico
// caminho de leitura serve os dois casos: em producao/staging o parse abaixo sempre produz um
// Set nao-vazio (CORS habilitado e CSRF ativo, fail-closed); fora de producao/staging a variavel
// e opcional -- ausente, `parseTrustedOrigins` devolve um Set vazio e `createServer()` cai no
// default seguro (CORS nunca aprova nenhuma origem, CSRF vira no-op, ver `http/csrf.ts`),
// exatamente como `dev-auth.ts` continua funcionando sem nenhuma variavel de Supabase Auth.
const trustedFrontendOrigins = parseTrustedOrigins(process.env.TRUSTED_FRONTEND_ORIGINS);

// RN-024/RN-025 (INV-05): ausente por default -- `trust proxy` permanece desabilitado ate que a
// topologia real de hosting defina uma fronteira de proxy explicita (numero de hops ou faixa de
// IPs). Nunca um valor obrigatorio (RN-046): nenhuma topologia conhecida hoje exige proxy
// (SPEC-030 secao 3).
const trustProxyConfig = process.env.TRUST_PROXY_CONFIG;

// RN-012: origem real do projeto Supabase configurado, derivada de `VITE_SUPABASE_URL` (nunca um
// `project-ref` fixo/ficticio). Ausente fora de producao/staging (nenhum projeto configurado
// ainda) -- `createSecurityHeadersMiddleware` e no-op nesses ambientes de qualquer forma
// (RN-005/RN-010), entao a ausencia nunca importa ali.
const supabaseAuthOrigin = process.env.VITE_SUPABASE_URL
  ? new URL(process.env.VITE_SUPABASE_URL).origin
  : undefined;

// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 12). Unica dependencia critica de toda
// requisicao de negocio verificada pela readiness -- Auth provider e AI provider ficam de fora
// por design (ja opcionais/isolados por requisicao, ver ADR-0027 secao 12), nunca tornando um
// provider opcional causa de downtime global. Nunca propaga o erro real ao chamador (so
// verdadeiro/falso) -- detalhe de conexao nunca vaza pela rota HTTP.
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

// Fase 17 (SPEC-020 v1.1): o orquestrador da candidatura publica reutiliza as mesmas
// instancias de CandidateService/CandidateApplicationService do resto da plataforma -- seus
// metodos publicos dedicados (`createCandidateFromPublicApplication`, `addPublicConsent`,
// `createApplicationFromPublicSubmission`) recebem a transacao ja aberta pelo orquestrador,
// em vez de abrir a sua propria, entao nao ha necessidade de nenhuma instancia separada.
const candidateService = createPostgresCandidateService(pool);
const candidateApplicationService = createPostgresCandidateApplicationService(pool);

const app = createServer(
  // Fase 15 (SPEC-018, RN-001/RN-002): toda Organization criada nasce com um Blueprint
  // Version `draft`, na mesma transacao fisica da propria criacao (ver
  // blueprints/organization-onboarding.ts).
  createCoreService(new PostgresCoreRepository(pool), createOrganizationBlueprintOnboardingHook()),
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
  // Fase 19 (SPEC-022 v1.0). Sem DISC proprietario, sem IA, sem score global/ranking/matching.
  createPostgresBehavioralAssessmentService(pool, {}, rateLimitStore),
  // Fase 20 (SPEC-023 v1.1). Sem score/ranking/matching/decisao automatica (ADR-0023 "Scores").
  // Reutiliza a mesma instancia de AIService do resto da plataforma -- toda execucao passa
  // exclusivamente por `aiService.gateway.execute()`, nunca um caminho alternativo.
  createPostgresPreAnalysisService(pool, aiService),
  // Fase 21 (SPEC-024 v1.1). Dossie materializado sem criar nova AI Execution.
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

const server = app.listen(port, () => {
  logger.info({ port }, "Talent OS API listening");
});

// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 19). Pre-requisito para rolling restart
// seguro: para de aceitar novas conexoes, aguarda requisicoes em voo, fecha o pool do Postgres
// explicitamente, e so entao encerra.
registerGracefulShutdown(server, pool);
