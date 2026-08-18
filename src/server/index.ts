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
import { PostgresCoreRepository } from "./persistence/postgres-core-repository";
import { createPostgresPreInterviewService } from "./pre-interviews/service";
import { createPostgresPool, requirePostgresDatabaseUrl } from "./postgres";
import { createPostgresPublicApplicationService } from "./public-applications/service";
import { createPostgresQuestionService } from "./questions/service";
import { createPostgresBehavioralAssessmentService } from "./behavioral-assessments/service";
import { createPostgresPreAnalysisService } from "./pre-analyses/service";
import { createPostgresCandidateDossierService } from "./candidate-dossiers/service";
import { createPostgresProposalService } from "./proposals/service";

const port = Number(process.env.PORT ?? 3001);
const connectionString = requirePostgresDatabaseUrl();
const pool = createPostgresPool(connectionString);

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
const appEnv = process.env.APP_ENV ?? "development";
const aiService = createPostgresAIService(
  pool,
  appEnv === "production"
    ? {
        secretManager: new UnavailableSecretManager(),
        resolveAdapter: () => new UnavailableProviderAdapter()
      }
    : {}
);

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
  createPostgresDnaService(pool),
  createPostgresOrganizationalUnitService(pool),
  createPostgresCompetencyService(pool),
  createPostgresJobProfileService(pool),
  createPostgresQuestionService(pool),
  createPostgresJobOpeningService(pool),
  candidateService,
  candidateApplicationService,
  createPostgresInterviewService(pool),
  aiService,
  createPostgresBlueprintService(pool),
  createPostgresPublicApplicationService(pool, candidateService, candidateApplicationService),
  createPostgresPreInterviewService(pool),
  // Fase 19 (SPEC-022 v1.0). Sem DISC proprietario, sem IA, sem score global/ranking/matching.
  createPostgresBehavioralAssessmentService(pool),
  // Fase 20 (SPEC-023 v1.1). Sem score/ranking/matching/decisao automatica (ADR-0023 "Scores").
  // Reutiliza a mesma instancia de AIService do resto da plataforma -- toda execucao passa
  // exclusivamente por `aiService.gateway.execute()`, nunca um caminho alternativo.
  createPostgresPreAnalysisService(pool, aiService),
  // Fase 21 (SPEC-024 v1.1). Dossie materializado sem criar nova AI Execution.
  createPostgresCandidateDossierService(pool),
  createPostgresProposalService(pool),
  createPostgresOnboardingService(pool),
  createPostgresEmploymentService(pool),
  createPostgresDevelopmentRetentionService(pool)
);

app.listen(port, () => {
  console.log(`Talent OS API listening on http://127.0.0.1:${port}`);
});
