import express from "express";
import type { AIService } from "./ai/service";
import { createCorsMiddleware } from "./http/cors";
import { createCsrfMiddleware } from "./http/csrf";
import { createSecurityHeadersMiddleware } from "./http/security-headers";
import type { BlueprintService } from "./blueprints/service";
import type { CandidateApplicationService } from "./candidate-applications/service";
import type { CandidateService } from "./candidates/service";
import { AppError } from "./core/errors";
import type { CompetencyService } from "./competencies/service";
import type { CoreService } from "./core/service";
import type { DnaService } from "./dna/service";
import { createApiRouter } from "./http/routes";
import type { InterviewService } from "./interviews/service";
import type { JobOpeningService } from "./job-openings/service";
import type { JobProfileService } from "./job-profiles/service";
import type { OrganizationalUnitService } from "./organizational-units/service";
import type { OnboardingService } from "./onboardings/service";
import type { EmploymentService } from "./employments/service";
import type { DevelopmentRetentionService } from "./development-retention/service";
import type { OffboardingService } from "./offboardings/service";
import type { AccessGrantService } from "./access-grants/service";
import type { PreInterviewService } from "./pre-interviews/service";
import type { PublicApplicationService } from "./public-applications/service";
import type { QuestionService } from "./questions/service";
import type { BehavioralAssessmentService } from "./behavioral-assessments/service";
import type { PreAnalysisService } from "./pre-analyses/service";
import type { ProposalService } from "./proposals/service";
import type { CandidateDossierService } from "./candidate-dossiers/service";
import { DevActorProvider, type ActorProvider } from "./http/actor-provider";
import type { AuthService } from "./auth/service";

export function createServer(
  core: CoreService,
  // Fase 29 (ADR-0026; SPEC-028 v1.0). Ver `http/routes.ts` para a justificativa do default
  // `DevActorProvider` -- preserva compatibilidade com todo ponto de chamada de teste existente
  // sem exigir edicao mecanica; producao (index.ts) sempre passa o provider real.
  actorProvider: ActorProvider = new DevActorProvider(),
  dna?: DnaService,
  organizationalUnits?: OrganizationalUnitService,
  competencies?: CompetencyService,
  jobProfiles?: JobProfileService,
  questions?: QuestionService,
  jobOpenings?: JobOpeningService,
  candidates?: CandidateService,
  candidateApplications?: CandidateApplicationService,
  interviews?: InterviewService,
  ai?: AIService,
  blueprints?: BlueprintService,
  publicApplications?: PublicApplicationService,
  preInterviews?: PreInterviewService,
  behavioralAssessments?: BehavioralAssessmentService,
  preAnalyses?: PreAnalysisService,
  candidateDossiers?: CandidateDossierService,
  proposals?: ProposalService,
  onboardings?: OnboardingService,
  employments?: EmploymentService,
  developmentRetention?: DevelopmentRetentionService,
  // Fase 27 (SPEC-026 v1.0). Mantido no fim da assinatura posicional.
  offboardings?: OffboardingService,
  // Fase 28 (ADR-0025; SPEC-027 v1.0). Mantido no fim da assinatura posicional.
  accessGrants?: AccessGrantService,
  // Fase 29 (ADR-0026; SPEC-028 v1.0). Mantido no fim da assinatura posicional.
  auth?: AuthService,
  isProductionEnv = false,
  // Fase 31 (ADR-0027; SPEC-030 v1.0). Mantidos no fim da assinatura posicional, mesma
  // convencao ja usada por toda Fase anterior. Default vazio/ausente preserva, sem nenhuma
  // mudanca de comportamento, todo ponto de chamada existente (CORS nunca aprova nenhuma
  // origem, CSRF fica no-op, `trust proxy` permanece desabilitado -- ver `http/cors.ts`,
  // `http/csrf.ts`, RN-025). Producao (`index.ts`) sempre passa os tres explicitamente.
  trustedFrontendOrigins: ReadonlySet<string> = new Set(),
  trustProxyConfig?: string,
  supabaseAuthOrigin?: string,
  // Correcao pre-commit (gate 8). Deliberadamente SEPARADO de `isProductionEnv` acima --
  // `isProductionEnv` e o contrato da Fase 29 (`Secure` do cookie de sessao, `cookies.ts`), que
  // hoje reflete literalmente `APP_ENV === "production"` e NUNCA `staging`; alterar esse
  // significado esta fora do escopo desta Fase (SPEC-030 "Fora do Escopo": nao altera nenhum
  // contrato de autenticacao/cookie ja fechado pela Fase 29). Mas SPEC-030 secao 8 exige que
  // staging aplique "exatamente a mesma politica de producao -- mesmos headers, mesma CSP" --
  // este flag, exclusivo dos headers desta Fase (nunca usado por cookies), cobre isso: default
  // `= isProductionEnv` preserva byte a byte o comportamento de todo ponto de chamada existente
  // que ainda nao conhece este parametro; producao (`index.ts`) passa explicitamente
  // `appEnv === "production" || appEnv === "staging"`.
  isProductionOrStagingEnv: boolean = isProductionEnv
) {
  const app = express();

  // RN-024/RN-025 (INV-05): nunca `true` generico -- somente quando a topologia real de
  // hosting define uma fronteira de proxy explicita (numero de hops ou faixa de IPs). Ausente
  // (default): `trust proxy` permanece desabilitado, comportamento identico ao anterior a esta
  // Fase (`request.ip` reflete o socket remoto real).
  if (trustProxyConfig !== undefined) {
    const hops = Number(trustProxyConfig);
    app.set("trust proxy", Number.isInteger(hops) && hops > 0 ? hops : trustProxyConfig);
  }

  // Fase 31: montados ANTES de `express.json()` -- uma requisicao rejeitada por CORS/CSRF nunca
  // paga o custo de parsear um body, e os headers de seguranca abaixo se aplicam a toda
  // resposta de `/api`, incluindo respostas de erro (413, 403, 500). Gate 8: usa
  // `isProductionOrStagingEnv` (staging inclusa), nunca o `isProductionEnv` de cookies.
  app.use(
    "/api",
    createSecurityHeadersMiddleware({
      isProductionEnv: isProductionOrStagingEnv,
      supabaseAuthOrigin
    })
  );
  app.use("/api", createCorsMiddleware(trustedFrontendOrigins));
  app.use("/api", createCsrfMiddleware(trustedFrontendOrigins));

  // Limite de tamanho de body explicito (revisao destrutiva da Fase 17, item 24) -- antes
  // desta revisao, `express.json()` sem opcoes ja aplicava o limite implicito padrao do
  // Express (100kb), mas de forma nao documentada/nao intencional. Tornado explicito para
  // toda a API (nao apenas a rota publica): 256kb cobre confortavelmente os payloads internos
  // legitimos existentes (drafts de Job Profile/Job Opening com listas de competencias,
  // perguntas etc.) e ainda impede um body arbitrariamente grande como vetor trivial de DoS
  // na rota publica, que nunca precisa de mais do que poucos KB.
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "talent-os",
      phase: "1"
    });
  });

  app.use(
    "/api",
    createApiRouter(
      core,
      actorProvider,
      dna,
      organizationalUnits,
      competencies,
      jobProfiles,
      questions,
      jobOpenings,
      candidates,
      candidateApplications,
      interviews,
      ai,
      blueprints,
      publicApplications,
      preInterviews,
      behavioralAssessments,
      preAnalyses,
      candidateDossiers,
      proposals,
      onboardings,
      employments,
      developmentRetention,
      offboardings,
      accessGrants,
      auth,
      isProductionEnv
    )
  );

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction
    ) => {
      void _next;
      if (error instanceof AppError) {
        response.status(error.statusCode).json({
          error: {
            code: error.code,
            message: error.message
          }
        });
        return;
      }

      // Revisao destrutiva da Fase 18, item 40: um body maior que o limite explicito de
      // `express.json({ limit: "256kb" })` (linha acima) e rejeitado pelo `body-parser` ANTES
      // de qualquer rota rodar, com um erro que nunca e uma `AppError` -- sem este ramo, ele
      // caia no 500 "internal_error" generico abaixo, escondendo que a causa real e um payload
      // grande demais do proprio cliente (um 413 explicito, nao uma falha interna do servidor).
      // Afeta toda a API (nao so as rotas da Fase 18), mas nunca foi verificado ponta a ponta
      // ate esta revisao.
      if (
        error &&
        typeof error === "object" &&
        "type" in error &&
        (error as { type?: unknown }).type === "entity.too.large"
      ) {
        response.status(413).json({
          error: {
            code: "payload_too_large",
            message: "Request body is too large."
          }
        });
        return;
      }

      response.status(500).json({
        error: {
          code: "internal_error",
          message: "Internal error."
        }
      });
    }
  );

  return app;
}
