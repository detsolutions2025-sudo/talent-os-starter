import express from "express";
import type { AIService } from "./ai/service";
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
import type { PublicApplicationService } from "./public-applications/service";
import type { QuestionService } from "./questions/service";

export function createServer(
  core: CoreService,
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
  publicApplications?: PublicApplicationService
) {
  const app = express();

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
      publicApplications
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
