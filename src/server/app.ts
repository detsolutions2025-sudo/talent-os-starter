import express from "express";
import type { CandidateService } from "./candidates/service";
import { AppError } from "./core/errors";
import type { CompetencyService } from "./competencies/service";
import type { CoreService } from "./core/service";
import type { DnaService } from "./dna/service";
import { createApiRouter } from "./http/routes";
import type { JobOpeningService } from "./job-openings/service";
import type { JobProfileService } from "./job-profiles/service";
import type { OrganizationalUnitService } from "./organizational-units/service";
import type { QuestionService } from "./questions/service";

export function createServer(
  core: CoreService,
  dna?: DnaService,
  organizationalUnits?: OrganizationalUnitService,
  competencies?: CompetencyService,
  jobProfiles?: JobProfileService,
  questions?: QuestionService,
  jobOpenings?: JobOpeningService,
  candidates?: CandidateService
) {
  const app = express();

  app.use(express.json());

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
      candidates
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
