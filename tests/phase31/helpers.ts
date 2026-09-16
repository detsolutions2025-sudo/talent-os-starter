// Fase 31 (ADR-0027; SPEC-030 v1.0). Helper compartilhado por toda a suite desta Fase: monta
// `createServer()` com o `CoreService` em memoria (mesma base de `tests/health.test.ts`) --
// Seguranca de Borda e uma preocupacao de transporte HTTP, nunca de persistencia, entao nenhuma
// dependencia de Postgres e necessaria para exercita-la. Centralizado num unico lugar para
// nunca depender de contar manualmente os parametros posicionais de `createServer()` em cada
// arquivo de teste.
import { createServer } from "../../src/server/app";
import { MemoryCoreRepository } from "../../src/server/core/memory-repository";
import { createCoreService, createMemoryCoreService } from "../../src/server/core/service";

type TestAppOptions = {
  isProductionEnv?: boolean;
  trustedFrontendOrigins?: ReadonlySet<string>;
  trustProxyConfig?: string;
  supabaseAuthOrigin?: string;
  // Correcao pre-commit (gate 8): flag SEPARADO de `isProductionEnv` (cookies, Fase 29) -- gate
  // dos headers de seguranca desta Fase (SPEC-030 s8: staging espelha producao). Default `=
  // isProductionEnv` (via `createServer()`) quando omitido -- simula o caso comum de teste onde
  // ambos coincidem; passar explicitamente para testar staging (`isProductionEnv:false`,
  // `isProductionOrStagingEnv:true`) separadamente da Secure de cookie.
  isProductionOrStagingEnv?: boolean;
};

// Variante que expoe o `MemoryCoreRepository` subjacente -- usada pelos testes de CSRF para
// provar "sem nenhum efeito colateral" (RN-018/CA-021) inspecionando `repository.snapshot()`
// diretamente, mesmo padrao ja usado por `tests/phase1/api.test.ts`.
export function createTestAppWithRepository(options: TestAppOptions = {}) {
  const repository = new MemoryCoreRepository();
  const app = createServer(
    createCoreService(repository),
    undefined, // actorProvider (default DevActorProvider)
    undefined, // dna
    undefined, // organizationalUnits
    undefined, // competencies
    undefined, // jobProfiles
    undefined, // questions
    undefined, // jobOpenings
    undefined, // candidates
    undefined, // candidateApplications
    undefined, // interviews
    undefined, // ai
    undefined, // blueprints
    undefined, // publicApplications
    undefined, // preInterviews
    undefined, // behavioralAssessments
    undefined, // preAnalyses
    undefined, // candidateDossiers
    undefined, // proposals
    undefined, // onboardings
    undefined, // employments
    undefined, // developmentRetention
    undefined, // offboardings
    undefined, // accessGrants
    undefined, // auth
    options.isProductionEnv ?? false,
    options.trustedFrontendOrigins ?? new Set<string>(),
    options.trustProxyConfig,
    options.supabaseAuthOrigin,
    options.isProductionOrStagingEnv
  );
  return { app, repository };
}

export function createTestApp(options: TestAppOptions = {}) {
  return createServer(
    createMemoryCoreService(),
    undefined, // actorProvider (default DevActorProvider)
    undefined, // dna
    undefined, // organizationalUnits
    undefined, // competencies
    undefined, // jobProfiles
    undefined, // questions
    undefined, // jobOpenings
    undefined, // candidates
    undefined, // candidateApplications
    undefined, // interviews
    undefined, // ai
    undefined, // blueprints
    undefined, // publicApplications
    undefined, // preInterviews
    undefined, // behavioralAssessments
    undefined, // preAnalyses
    undefined, // candidateDossiers
    undefined, // proposals
    undefined, // onboardings
    undefined, // employments
    undefined, // developmentRetention
    undefined, // offboardings
    undefined, // accessGrants
    undefined, // auth
    options.isProductionEnv ?? false,
    options.trustedFrontendOrigins ?? new Set<string>(),
    options.trustProxyConfig,
    options.supabaseAuthOrigin,
    options.isProductionOrStagingEnv
  );
}

export const platformHeaders = { "x-dev-platform-admin": "true" };
