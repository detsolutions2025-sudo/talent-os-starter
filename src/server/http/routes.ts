import type { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { Router as createRouter } from "express";
import type { AIService } from "../ai/service";
import { validateOrganizationAiEnabledInput, validatePlatformAllowedInput } from "../ai/validation";
import type { BlueprintService } from "../blueprints/service";
import type { CandidateApplicationService } from "../candidate-applications/service";
import type { CandidateService } from "../candidates/service";
import type { CompetencyService } from "../competencies/service";
import { getActor } from "./dev-auth";
import { forbidden } from "../core/errors";
import type { CoreService } from "../core/service";
import type { DnaService } from "../dna/service";
import type { JobOpeningService } from "../job-openings/service";
import type { JobProfileService } from "../job-profiles/service";
import type { InterviewService } from "../interviews/service";
import type { OrganizationalUnitService } from "../organizational-units/service";
import type { PreInterviewService } from "../pre-interviews/service";
import type { PublicApplicationService } from "../public-applications/service";
import type { QuestionService } from "../questions/service";
import type { BehavioralAssessmentService } from "../behavioral-assessments/service";
import type { PreAnalysisService } from "../pre-analyses/service";
import type { ProposalService } from "../proposals/service";
import type { CandidateDossierService } from "../candidate-dossiers/service";

export function createApiRouter(
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
  publicApplications?: PublicApplicationService,
  preInterviews?: PreInterviewService,
  behavioralAssessments?: BehavioralAssessmentService,
  // Fase 20 (SPEC-023 v1.1). Ultimo parametro posicional -- mesma convencao ja usada por todo
  // o roteador (cada Fase acrescenta seu servico opcional ao final da assinatura, nunca no
  // meio, para nao quebrar nenhuma chamada posicional ja existente de fases anteriores).
  preAnalyses?: PreAnalysisService,
  // Fase 21 (SPEC-024 v1.1). Mantido no fim da assinatura posicional.
  candidateDossiers?: CandidateDossierService,
  proposals?: ProposalService
): Router {
  const router = createRouter();

  router.get(
    "/dev/me",
    asyncHandler(async (request, response) => {
      response.json(await core.getCurrentUser(getActor(request)));
    })
  );

  router.post(
    "/dev/users",
    asyncHandler(async (request, response) => {
      const user = await core.createUser(getActor(request), request.body);
      response.status(201).json(user);
    })
  );

  router.get(
    "/dev/users",
    asyncHandler(async (request, response) => {
      response.json(await core.listUsers(getActor(request)));
    })
  );

  router.get(
    "/audit-events",
    asyncHandler(async (request, response) => {
      const actor = getActor(request);

      if (actor.kind !== "platform") {
        throw forbidden("permission_denied", "Permission denied.");
      }

      response.json(await core.auditEvents());
    })
  );

  router.post(
    "/organizations",
    asyncHandler(async (request, response) => {
      const result = await core.createOrganization(getActor(request), request.body);
      response.status(201).json(result);
    })
  );

  router.get(
    "/organizations",
    asyncHandler(async (request, response) => {
      response.json(await core.listOrganizations(getActor(request)));
    })
  );

  router.get(
    "/organizations/:organizationId",
    asyncHandler(async (request, response) => {
      response.json(
        await core.getOrganization(getActor(request), routeParam(request.params.organizationId))
      );
    })
  );

  router.patch(
    "/organizations/:organizationId",
    asyncHandler(async (request, response) => {
      response.json(
        await core.updateOrganization(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        )
      );
    })
  );

  router.post(
    "/organizations/:organizationId/archive",
    asyncHandler(async (request, response) => {
      response.json(
        await core.archiveOrganization(getActor(request), routeParam(request.params.organizationId))
      );
    })
  );

  router.post(
    "/organizations/:organizationId/reactivate",
    asyncHandler(async (request, response) => {
      response.json(
        await core.reactivateOrganization(
          getActor(request),
          routeParam(request.params.organizationId)
        )
      );
    })
  );

  router.get(
    "/organizations/:organizationId/memberships",
    asyncHandler(async (request, response) => {
      response.json(
        await core.listMemberships(getActor(request), routeParam(request.params.organizationId))
      );
    })
  );

  router.post(
    "/organizations/:organizationId/memberships",
    asyncHandler(async (request, response) => {
      const membership = await core.createMembership(getActor(request), {
        ...request.body,
        organizationId: routeParam(request.params.organizationId)
      });
      response.status(201).json(membership);
    })
  );

  router.patch(
    "/memberships/:membershipId",
    asyncHandler(async (request, response) => {
      const membership = await core.updateMembership(
        getActor(request),
        routeParam(request.params.membershipId),
        request.body
      );
      response.json(membership);
    })
  );

  if (dna) {
    router.get(
      "/organizations/:organizationId/dna",
      asyncHandler(async (request, response) => {
        response.json(
          await dna.getPublished(getActor(request), routeParam(request.params.organizationId))
        );
      })
    );

    router.get(
      "/organizations/:organizationId/dna/draft",
      asyncHandler(async (request, response) => {
        response.json(
          await dna.getActiveDraft(getActor(request), routeParam(request.params.organizationId))
        );
      })
    );

    router.get(
      "/organizations/:organizationId/dna/versions",
      asyncHandler(async (request, response) => {
        response.json(
          await dna.listVersions(getActor(request), routeParam(request.params.organizationId))
        );
      })
    );

    router.get(
      "/organizations/:organizationId/dna/versions/:versionId",
      asyncHandler(async (request, response) => {
        response.json(
          await dna.getVersion(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/dna/drafts",
      asyncHandler(async (request, response) => {
        const draft = await dna.createDraft(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        );
        response.status(201).json(draft);
      })
    );

    router.patch(
      "/organizations/:organizationId/dna/drafts/:versionId",
      asyncHandler(async (request, response) => {
        response.json(
          await dna.updateDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.versionId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/dna/drafts/:versionId/publish",
      asyncHandler(async (request, response) => {
        response.json(
          await dna.publishDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/dna/drafts/:versionId/discard",
      asyncHandler(async (request, response) => {
        response.json(
          await dna.discardDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/dna/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await dna.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  if (organizationalUnits) {
    router.post(
      "/organizations/:organizationId/organizational-units",
      asyncHandler(async (request, response) => {
        const unit = await organizationalUnits.createUnit(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        );
        response.status(201).json(unit);
      })
    );

    router.get(
      "/organizations/:organizationId/organizational-units/tree",
      asyncHandler(async (request, response) => {
        response.json(
          await organizationalUnits.listTree(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/organizational-units",
      asyncHandler(async (request, response) => {
        response.json(
          await organizationalUnits.listActive(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/organizational-units/history",
      asyncHandler(async (request, response) => {
        response.json(
          await organizationalUnits.listHistory(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/organizational-units/:unitId",
      asyncHandler(async (request, response) => {
        response.json(
          await organizationalUnits.getUnit(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.unitId)
          )
        );
      })
    );

    router.patch(
      "/organizations/:organizationId/organizational-units/:unitId",
      asyncHandler(async (request, response) => {
        response.json(
          await organizationalUnits.updateUnit(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.unitId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/organizational-units/:unitId/move",
      asyncHandler(async (request, response) => {
        response.json(
          await organizationalUnits.moveUnit(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.unitId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/organizational-units/:unitId/inactivate",
      asyncHandler(async (request, response) => {
        response.json(
          await organizationalUnits.inactivateUnit(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.unitId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/organizational-units/:unitId/reactivate",
      asyncHandler(async (request, response) => {
        response.json(
          await organizationalUnits.reactivateUnit(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.unitId)
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/organizational-units/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await organizationalUnits.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  if (competencies) {
    router.post(
      "/platform/competencies/global",
      asyncHandler(async (request, response) => {
        const competency = await competencies.createGlobal(getActor(request), request.body);
        response.status(201).json(competency);
      })
    );

    router.get(
      "/platform/competencies/global",
      asyncHandler(async (request, response) => {
        response.json(await competencies.listGlobals(getActor(request)));
      })
    );

    router.get(
      "/platform/competencies/global/history",
      asyncHandler(async (request, response) => {
        response.json(await competencies.globalHistory(getActor(request)));
      })
    );

    router.get(
      "/platform/competencies/global/:globalCompetencyId",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.getGlobal(
            getActor(request),
            routeParam(request.params.globalCompetencyId)
          )
        );
      })
    );

    router.patch(
      "/platform/competencies/global/:globalCompetencyId",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.updateGlobal(
            getActor(request),
            routeParam(request.params.globalCompetencyId),
            request.body
          )
        );
      })
    );

    router.post(
      "/platform/competencies/global/:globalCompetencyId/activate",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.setGlobalStatus(
            getActor(request),
            routeParam(request.params.globalCompetencyId),
            "active"
          )
        );
      })
    );

    router.post(
      "/platform/competencies/global/:globalCompetencyId/inactivate",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.setGlobalStatus(
            getActor(request),
            routeParam(request.params.globalCompetencyId),
            "inactive"
          )
        );
      })
    );

    router.post(
      "/platform/competencies/global/:globalCompetencyId/deprecate",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.setGlobalStatus(
            getActor(request),
            routeParam(request.params.globalCompetencyId),
            "deprecated"
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/competencies",
      asyncHandler(async (request, response) => {
        const competency = await competencies.createOrganizationCompetency(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        );
        response.status(201).json(competency);
      })
    );

    router.get(
      "/organizations/:organizationId/competencies",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.listOrganizationCompetencies(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/competencies/catalog",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.listUnifiedCatalog(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/competencies/available-globals",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.listAvailableGlobals(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/competencies/history",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.listHistory(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/competencies/catalog/:catalogItemId",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.getCatalogItem(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.catalogItemId)
          )
        );
      })
    );

    router.patch(
      "/organizations/:organizationId/competencies/:competencyId",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.updateOrganizationCompetency(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.competencyId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/competencies/:competencyId/activate",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.setOrganizationCompetencyStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.competencyId),
            "active"
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/competencies/:competencyId/inactivate",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.setOrganizationCompetencyStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.competencyId),
            "inactive"
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/competencies/adoptions",
      asyncHandler(async (request, response) => {
        const adoption = await competencies.adoptGlobal(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        );
        response.status(201).json(adoption);
      })
    );

    router.post(
      "/organizations/:organizationId/competencies/adoptions/:adoptionId/activate",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.setAdoptionStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.adoptionId),
            "active"
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/competencies/adoptions/:adoptionId/inactivate",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.setAdoptionStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.adoptionId),
            "inactive"
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/competencies/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  if (jobProfiles) {
    router.post(
      "/organizations/:organizationId/job-profiles",
      asyncHandler(async (request, response) => {
        const profile = await jobProfiles.createJobProfile(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        );
        response.status(201).json(profile);
      })
    );

    router.get(
      "/organizations/:organizationId/job-profiles",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.listActive(getActor(request), routeParam(request.params.organizationId))
        );
      })
    );

    router.get(
      "/organizations/:organizationId/job-profiles/inactive",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.listInactive(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/job-profiles/:jobProfileId",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.getJobProfile(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobProfileId)
          )
        );
      })
    );

    router.patch(
      "/organizations/:organizationId/job-profiles/:jobProfileId",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.updateJobProfile(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobProfileId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/job-profiles/:jobProfileId/activate",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.setJobProfileStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobProfileId),
            "active"
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/job-profiles/:jobProfileId/inactivate",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.setJobProfileStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobProfileId),
            "inactive"
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/job-profiles/:jobProfileId/drafts",
      asyncHandler(async (request, response) => {
        const draft = await jobProfiles.createDraft(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.jobProfileId),
          request.body
        );
        response.status(201).json(draft);
      })
    );

    router.get(
      "/organizations/:organizationId/job-profiles/:jobProfileId/draft",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.getActiveDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobProfileId)
          )
        );
      })
    );

    router.patch(
      "/organizations/:organizationId/job-profiles/:jobProfileId/drafts/:versionId",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.updateDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobProfileId),
            routeParam(request.params.versionId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/job-profiles/:jobProfileId/drafts/:versionId/publish",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.publishDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobProfileId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/job-profiles/:jobProfileId/drafts/:versionId/discard",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.discardDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobProfileId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/job-profiles/:jobProfileId/published",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.getPublished(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobProfileId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/job-profiles/:jobProfileId/versions",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.listVersions(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobProfileId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/job-profiles/:jobProfileId/versions/:versionId",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.getVersion(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobProfileId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/job-profiles/:jobProfileId/history",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.history(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobProfileId)
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/job-profiles/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  if (blueprints) {
    router.get(
      "/organizations/:organizationId/blueprint",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.getStatus(getActor(request), routeParam(request.params.organizationId))
        );
      })
    );

    router.get(
      "/organizations/:organizationId/blueprint/readiness",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.getReadiness(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/blueprint/draft",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.getDraft(getActor(request), routeParam(request.params.organizationId))
        );
      })
    );

    router.post(
      "/organizations/:organizationId/blueprint/drafts",
      asyncHandler(async (request, response) => {
        const draft = await blueprints.createDraft(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        );
        response.status(201).json(draft);
      })
    );

    // "Validar draft" (SPEC-018 secao 21, API conceitual) recalcula readiness sob demanda --
    // e a mesma operacao de leitura de `getReadiness`, exposta tambem sob o path de draft
    // pedido para manter o contrato de API do plano tecnico.
    router.post(
      "/organizations/:organizationId/blueprint/draft/validate",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.getReadiness(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/blueprint/draft/activate",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.activateBlueprint(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/blueprint/active",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.getActive(getActor(request), routeParam(request.params.organizationId))
        );
      })
    );

    router.get(
      "/organizations/:organizationId/blueprint/history",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.getHistory(getActor(request), routeParam(request.params.organizationId))
        );
      })
    );

    router.get(
      "/organizations/:organizationId/blueprint/versions/:versionId",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.getVersion(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/blueprint/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  if (questions) {
    router.post(
      "/platform/questions/global",
      asyncHandler(async (request, response) => {
        const question = await questions.createGlobal(getActor(request), request.body);
        response.status(201).json(question);
      })
    );

    router.get(
      "/platform/questions/global",
      asyncHandler(async (request, response) => {
        response.json(await questions.listGlobals(getActor(request)));
      })
    );

    router.get(
      "/platform/questions/global/history",
      asyncHandler(async (request, response) => {
        response.json(await questions.globalHistory(getActor(request)));
      })
    );

    router.get(
      "/platform/questions/global/:globalQuestionId",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.getGlobal(getActor(request), routeParam(request.params.globalQuestionId))
        );
      })
    );

    router.patch(
      "/platform/questions/global/:globalQuestionId",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.updateGlobal(
            getActor(request),
            routeParam(request.params.globalQuestionId),
            request.body
          )
        );
      })
    );

    router.post(
      "/platform/questions/global/:globalQuestionId/activate",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.setGlobalStatus(
            getActor(request),
            routeParam(request.params.globalQuestionId),
            "active"
          )
        );
      })
    );

    router.post(
      "/platform/questions/global/:globalQuestionId/inactivate",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.setGlobalStatus(
            getActor(request),
            routeParam(request.params.globalQuestionId),
            "inactive"
          )
        );
      })
    );

    router.post(
      "/platform/questions/global/:globalQuestionId/deprecate",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.setGlobalStatus(
            getActor(request),
            routeParam(request.params.globalQuestionId),
            "deprecated"
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/questions",
      asyncHandler(async (request, response) => {
        const question = await questions.createOrganizationQuestion(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        );
        response.status(201).json(question);
      })
    );

    router.get(
      "/organizations/:organizationId/questions",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.listOrganizationQuestions(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/questions/catalog",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.listUnifiedCatalog(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/questions/available-globals",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.listAvailableGlobals(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/questions/history",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.listHistory(getActor(request), routeParam(request.params.organizationId))
        );
      })
    );

    router.get(
      "/organizations/:organizationId/questions/catalog/:catalogItemId",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.getCatalogItem(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.catalogItemId)
          )
        );
      })
    );

    router.patch(
      "/organizations/:organizationId/questions/:questionId",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.updateOrganizationQuestion(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.questionId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/questions/:questionId/activate",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.setOrganizationQuestionStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.questionId),
            "active"
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/questions/:questionId/inactivate",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.setOrganizationQuestionStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.questionId),
            "inactive"
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/questions/adoptions",
      asyncHandler(async (request, response) => {
        const adoption = await questions.adoptGlobal(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        );
        response.status(201).json(adoption);
      })
    );

    router.post(
      "/organizations/:organizationId/questions/adoptions/:adoptionId/activate",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.setAdoptionStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.adoptionId),
            "active"
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/questions/adoptions/:adoptionId/inactivate",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.setAdoptionStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.adoptionId),
            "inactive"
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/questions/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  if (jobOpenings) {
    router.post(
      "/organizations/:organizationId/job-openings",
      asyncHandler(async (request, response) => {
        const opening = await jobOpenings.createJobOpening(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        );
        response.status(201).json(opening);
      })
    );

    router.get(
      "/organizations/:organizationId/job-openings",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.listJobOpenings(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/job-openings/inactive",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.listInactive(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/job-openings/:jobOpeningId",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.getJobOpening(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId)
          )
        );
      })
    );

    router.patch(
      "/organizations/:organizationId/job-openings/:jobOpeningId",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.updateJobOpening(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/job-openings/:jobOpeningId/drafts",
      asyncHandler(async (request, response) => {
        const draft = await jobOpenings.createDraft(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.jobOpeningId)
        );
        response.status(201).json(draft);
      })
    );

    router.get(
      "/organizations/:organizationId/job-openings/:jobOpeningId/draft",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.getActiveDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId)
          )
        );
      })
    );

    router.patch(
      "/organizations/:organizationId/job-openings/:jobOpeningId/drafts/:versionId",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.updateDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId),
            routeParam(request.params.versionId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/job-openings/:jobOpeningId/drafts/:versionId/publish",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.publishDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/job-openings/:jobOpeningId/drafts/:versionId/discard",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.discardDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/job-openings/:jobOpeningId/published",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.getPublished(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/job-openings/:jobOpeningId/versions",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.listVersions(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/job-openings/:jobOpeningId/versions/:versionId",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.getVersion(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    for (const [path, status] of [
      ["open", "open"],
      ["pause", "paused"],
      ["close", "closed"],
      ["cancel", "cancelled"]
    ] as const) {
      router.post(
        `/organizations/:organizationId/job-openings/:jobOpeningId/${path}`,
        asyncHandler(async (request, response) => {
          response.json(
            await jobOpenings.transition(
              getActor(request),
              routeParam(request.params.organizationId),
              routeParam(request.params.jobOpeningId),
              status
            )
          );
        })
      );
    }

    router.patch(
      "/organizations/:organizationId/job-openings/:jobOpeningId/publication",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.configurePublication(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId),
            request.body
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/job-openings/:jobOpeningId/history",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.history(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId)
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/job-openings/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );

    router.get(
      "/public/job-openings/:slug",
      asyncHandler(async (request, response) => {
        response.json(await jobOpenings.getPublicBySlug(routeParam(request.params.slug)));
      })
    );
  }

  // Fase 17 -- Candidatura Publica (SPEC-020 v1.1). Rota publica, sem `getActor`, sem
  // Membership, sem `organization_id` no body -- a Organization e sempre derivada do slug da
  // Vaga, nunca aceita do cliente (SPEC-020, secao 26).
  if (publicApplications) {
    router.post(
      "/public/job-openings/:slug/applications",
      asyncHandler(async (request, response) => {
        const result = await publicApplications.submit(
          routeParam(request.params.slug),
          request.body,
          {
            idempotencyKey: request.header("Idempotency-Key"),
            ip: request.ip ?? request.socket.remoteAddress ?? "unknown"
          }
        );

        // Fase 18 (SPEC-021, secao 8.2; Plano Tecnico, correcao final, itens 1/2/24): a
        // CandidateApplication ja esta commitada neste ponto -- `createIfConfigured` roda em
        // uma SEGUNDA transacao, inteiramente independente, sempre concluida (sucesso ou
        // falha) ANTES de montar a resposta HTTP. Uma falha aqui nunca reverte a candidatura
        // ja confirmada e nunca vira falha HTTP da candidatura -- apenas fica registrada
        // internamente, e `nextStep` permanece `null`.
        let nextStep: { type: "pre_interview"; access: string } | null = null;
        if (preInterviews) {
          try {
            const created = await preInterviews.createIfConfigured(result.candidateApplicationId);
            if (created.status !== "not_configured") {
              nextStep = { type: "pre_interview", access: created.rawAccessToken };
            }
          } catch (error) {
            console.error("Pre-interview creation failed after public application:", error);
          }
        }

        // DTO publico explicito -- nunca `{ ...result }` (que carregaria
        // `candidateApplicationId`, sempre interno, SPEC-020 secao 25).
        response
          .status(201)
          .json({ status: result.status, submissionId: result.submissionId, nextStep });
      })
    );
  }

  // Fase 18 -- Pre-Entrevista Estruturada (SPEC-021 v1.0). Sem IA. Rotas publicas sem
  // `getActor`, resolvidas por token opaco em header dedicado -- nunca no path nem em query
  // string (Plano Tecnico, correcao final, item 3/36).
  if (preInterviews) {
    router.get(
      "/organizations/:organizationId/job-openings/:jobOpeningId/pre-interview-settings",
      asyncHandler(async (request, response) => {
        response.json(
          await preInterviews.getSettings(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId)
          )
        );
      })
    );

    router.put(
      "/organizations/:organizationId/job-openings/:jobOpeningId/pre-interview-settings",
      asyncHandler(async (request, response) => {
        response.json(
          await preInterviews.updateSettings(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/pre-interviews",
      asyncHandler(async (request, response) => {
        const created = await preInterviews.createInternal(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.applicationId)
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications/:applicationId/pre-interviews",
      asyncHandler(async (request, response) => {
        response.json(
          await preInterviews.listByApplication(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/pre-interviews/:preInterviewId",
      asyncHandler(async (request, response) => {
        response.json(
          await preInterviews.getById(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.preInterviewId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/pre-interviews/:preInterviewId/cancel",
      asyncHandler(async (request, response) => {
        response.json(
          await preInterviews.cancel(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.preInterviewId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/pre-interviews/:preInterviewId/retry",
      asyncHandler(async (request, response) => {
        const created = await preInterviews.retry(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.preInterviewId)
        );
        response.status(201).json(created);
      })
    );

    router.post(
      "/organizations/:organizationId/pre-interviews/:preInterviewId/rotate-access-token",
      asyncHandler(async (request, response) => {
        response.json(
          await preInterviews.rotateAccessToken(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.preInterviewId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/pre-interviews/:preInterviewId/events",
      asyncHandler(async (request, response) => {
        response.json(
          await preInterviews.timeline(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.preInterviewId)
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/pre-interviews/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await preInterviews.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );

    // --- Publico (Candidate, via token opaco em header, nunca no path/query) --------------
    router.get(
      "/public/pre-interviews/current",
      asyncHandler(async (request, response) => {
        response.set("Cache-Control", "no-store");
        response.json(
          await preInterviews.getPublic(extractAccessToken(request), {
            ip: request.ip ?? request.socket.remoteAddress ?? "unknown"
          })
        );
      })
    );

    router.post(
      "/public/pre-interviews/start",
      asyncHandler(async (request, response) => {
        response.set("Cache-Control", "no-store");
        response.json(
          await preInterviews.start(extractAccessToken(request), {
            ip: request.ip ?? request.socket.remoteAddress ?? "unknown"
          })
        );
      })
    );

    router.put(
      "/public/pre-interviews/responses/:questionPublicId",
      asyncHandler(async (request, response) => {
        response.set("Cache-Control", "no-store");
        response.json(
          await preInterviews.saveResponse(
            extractAccessToken(request),
            routeParam(request.params.questionPublicId),
            request.body,
            { ip: request.ip ?? request.socket.remoteAddress ?? "unknown" }
          )
        );
      })
    );

    router.post(
      "/public/pre-interviews/submit",
      asyncHandler(async (request, response) => {
        response.set("Cache-Control", "no-store");
        response.json(
          await preInterviews.submit(extractAccessToken(request), {
            ip: request.ip ?? request.socket.remoteAddress ?? "unknown"
          })
        );
      })
    );
  }

  // Fase 19 -- Perfil Comportamental (SPEC-022 v1.0). Sem DISC proprietario, sem IA, sem
  // score global, sem ranking/matching. Rotas publicas sem `getActor`, resolvidas por token
  // opaco em header dedicado -- nunca no path nem em query string (mesmo padrao ja usado pela
  // Pre-Entrevista, Fase 18).
  if (behavioralAssessments) {
    // --- Instrumentos globais (Platform Admin) -------------------------------------------
    router.post(
      "/platform/behavioral-instruments",
      asyncHandler(async (request, response) => {
        const created = await behavioralAssessments.createGlobalInstrument(
          getActor(request),
          request.body
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/platform/behavioral-instruments",
      asyncHandler(async (request, response) => {
        response.json(await behavioralAssessments.listGlobalInstruments(getActor(request)));
      })
    );

    router.get(
      "/platform/behavioral-instruments/:instrumentId",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.getInstrument(
            getActor(request),
            null,
            routeParam(request.params.instrumentId)
          )
        );
      })
    );

    router.patch(
      "/platform/behavioral-instruments/:instrumentId",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.updateInstrument(
            getActor(request),
            null,
            routeParam(request.params.instrumentId),
            request.body
          )
        );
      })
    );

    router.post(
      "/platform/behavioral-instruments/:instrumentId/status",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.setInstrumentStatus(
            getActor(request),
            null,
            routeParam(request.params.instrumentId),
            request.body?.status
          )
        );
      })
    );

    router.post(
      "/platform/behavioral-instruments/:instrumentId/versions",
      asyncHandler(async (request, response) => {
        const created = await behavioralAssessments.createDraftVersion(
          getActor(request),
          null,
          routeParam(request.params.instrumentId),
          request.body
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/platform/behavioral-instruments/:instrumentId/versions",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.listVersions(
            getActor(request),
            null,
            routeParam(request.params.instrumentId)
          )
        );
      })
    );

    router.post(
      "/platform/behavioral-instruments/:instrumentId/versions/:versionId/activate",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.activateVersion(
            getActor(request),
            null,
            routeParam(request.params.instrumentId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    router.post(
      "/platform/behavioral-instruments/:instrumentId/versions/:versionId/archive",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.archiveVersion(
            getActor(request),
            null,
            routeParam(request.params.instrumentId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    // --- Instrumentos proprios da Organization --------------------------------------------
    router.post(
      "/organizations/:organizationId/behavioral-instruments",
      asyncHandler(async (request, response) => {
        const created = await behavioralAssessments.createPrivateInstrument(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/behavioral-instruments",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.listAvailableInstruments(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    // Rota literal ("platform-catalog") registrada ANTES da rota parametrizada
    // (":instrumentId") de proposito -- o Express casa rotas na ordem de registro, nunca por
    // especificidade; se viesse depois, toda chamada a este caminho seria capturada como se
    // "platform-catalog" fosse um instrumentId.
    router.get(
      "/organizations/:organizationId/behavioral-instruments/platform-catalog",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.listGlobalCatalog(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/behavioral-instruments/:instrumentId",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.getInstrument(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.instrumentId)
          )
        );
      })
    );

    router.patch(
      "/organizations/:organizationId/behavioral-instruments/:instrumentId",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.updateInstrument(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.instrumentId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/behavioral-instruments/:instrumentId/status",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.setInstrumentStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.instrumentId),
            request.body?.status
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/behavioral-instruments/:instrumentId/versions",
      asyncHandler(async (request, response) => {
        const created = await behavioralAssessments.createDraftVersion(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.instrumentId),
          request.body
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/behavioral-instruments/:instrumentId/versions",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.listVersions(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.instrumentId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/behavioral-instruments/:instrumentId/versions/:versionId/activate",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.activateVersion(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.instrumentId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/behavioral-instruments/:instrumentId/versions/:versionId/archive",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.archiveVersion(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.instrumentId),
            routeParam(request.params.versionId)
          )
        );
      })
    );

    // --- Disponibilidade de instrumento global por Organization ---------------------------
    router.get(
      "/organizations/:organizationId/behavioral-instrument-settings",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.listOrganizationInstrumentSettings(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.put(
      "/organizations/:organizationId/behavioral-instrument-settings/:instrumentId",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.setOrganizationInstrumentEnabled(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.instrumentId),
            request.body
          )
        );
      })
    );

    // --- Preferencia da vaga (nunca dispara aplicacao sozinha) -----------------------------
    router.get(
      "/organizations/:organizationId/job-openings/:jobOpeningId/behavioral-assessment-settings",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.getJobOpeningSettings(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId)
          )
        );
      })
    );

    router.put(
      "/organizations/:organizationId/job-openings/:jobOpeningId/behavioral-assessment-settings",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.updateJobOpeningSettings(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.jobOpeningId),
            request.body
          )
        );
      })
    );

    // --- Aplicacoes (sempre ato administrativo explicito, SPEC-022 secao 9.1) --------------
    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/behavioral-assessments",
      asyncHandler(async (request, response) => {
        const created = await behavioralAssessments.createAssessment(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.applicationId),
          request.body
        );
        response.status(201).json(created);
      })
    );

    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/behavioral-assessments/external-import",
      asyncHandler(async (request, response) => {
        const created = await behavioralAssessments.registerExternalImport(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.applicationId),
          request.body
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications/:applicationId/behavioral-assessments",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.listByApplication(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/behavioral-assessments/:assessmentId",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.getById(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.assessmentId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/behavioral-assessments/:assessmentId/cancel",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.cancel(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.assessmentId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/behavioral-assessments/:assessmentId/retry",
      asyncHandler(async (request, response) => {
        const created = await behavioralAssessments.retry(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.assessmentId)
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/behavioral-assessments/:assessmentId/events",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.timeline(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.assessmentId)
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/behavioral-assessments/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );

    // --- Publico (Candidate, via token opaco em header, nunca no path/query) --------------
    router.get(
      "/public/behavioral-assessments/current",
      asyncHandler(async (request, response) => {
        response.set("Cache-Control", "no-store");
        response.json(
          await behavioralAssessments.getPublic(extractBehavioralAssessmentAccessToken(request), {
            ip: request.ip ?? request.socket.remoteAddress ?? "unknown"
          })
        );
      })
    );

    router.post(
      "/public/behavioral-assessments/start",
      asyncHandler(async (request, response) => {
        response.set("Cache-Control", "no-store");
        response.json(
          await behavioralAssessments.start(extractBehavioralAssessmentAccessToken(request), {
            ip: request.ip ?? request.socket.remoteAddress ?? "unknown"
          })
        );
      })
    );

    router.put(
      "/public/behavioral-assessments/responses/:itemPublicId",
      asyncHandler(async (request, response) => {
        response.set("Cache-Control", "no-store");
        response.json(
          await behavioralAssessments.saveResponse(
            extractBehavioralAssessmentAccessToken(request),
            routeParam(request.params.itemPublicId),
            request.body,
            { ip: request.ip ?? request.socket.remoteAddress ?? "unknown" }
          )
        );
      })
    );

    router.post(
      "/public/behavioral-assessments/submit",
      asyncHandler(async (request, response) => {
        response.set("Cache-Control", "no-store");
        response.json(
          await behavioralAssessments.submit(extractBehavioralAssessmentAccessToken(request), {
            ip: request.ip ?? request.socket.remoteAddress ?? "unknown"
          })
        );
      })
    );
  }

  if (candidates) {
    router.post(
      "/organizations/:organizationId/candidates",
      asyncHandler(async (request, response) => {
        const candidate = await candidates.createCandidate(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        );
        response.status(201).json(candidate);
      })
    );

    router.get(
      "/organizations/:organizationId/candidates",
      asyncHandler(async (request, response) => {
        response.json(
          await candidates.listActive(getActor(request), routeParam(request.params.organizationId))
        );
      })
    );

    router.get(
      "/organizations/:organizationId/candidates/inactive",
      asyncHandler(async (request, response) => {
        response.json(
          await candidates.listInactive(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/candidates/:candidateId",
      asyncHandler(async (request, response) => {
        response.json(
          await candidates.getCandidate(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.candidateId)
          )
        );
      })
    );

    router.patch(
      "/organizations/:organizationId/candidates/:candidateId",
      asyncHandler(async (request, response) => {
        response.json(
          await candidates.updateCandidate(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.candidateId),
            request.body
          )
        );
      })
    );

    router.patch(
      "/organizations/:organizationId/candidates/:candidateId/email",
      asyncHandler(async (request, response) => {
        response.json(
          await candidates.changeEmail(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.candidateId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/candidates/:candidateId/inactivate",
      asyncHandler(async (request, response) => {
        response.json(
          await candidates.setStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.candidateId),
            "inactive"
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/candidates/:candidateId/reactivate",
      asyncHandler(async (request, response) => {
        response.json(
          await candidates.setStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.candidateId),
            "active"
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/candidates/:candidateId/history",
      asyncHandler(async (request, response) => {
        response.json(
          await candidates.history(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.candidateId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/candidates/:candidateId/consents",
      asyncHandler(async (request, response) => {
        const consent = await candidates.addConsent(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.candidateId),
          request.body
        );
        response.status(201).json(consent);
      })
    );

    router.post(
      "/organizations/:organizationId/candidates/:candidateId/consents/revoke",
      asyncHandler(async (request, response) => {
        const consent = await candidates.revokeConsent(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.candidateId)
        );
        response.status(201).json(consent);
      })
    );

    router.post(
      "/organizations/:organizationId/candidates/:candidateId/internal-notes",
      asyncHandler(async (request, response) => {
        const note = await candidates.addInternalNote(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.candidateId),
          request.body
        );
        response.status(201).json(note);
      })
    );

    router.post(
      "/platform/organizations/:organizationId/candidates/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await candidates.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  if (candidateApplications) {
    router.post(
      "/organizations/:organizationId/candidate-applications",
      asyncHandler(async (request, response) => {
        const application = await candidateApplications.createApplication(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        );
        response.status(201).json(application);
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications",
      asyncHandler(async (request, response) => {
        response.json(
          await candidateApplications.listApplications(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications/:applicationId",
      asyncHandler(async (request, response) => {
        response.json(
          await candidateApplications.getApplication(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/stage",
      asyncHandler(async (request, response) => {
        response.json(
          await candidateApplications.moveStage(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId),
            request.body
          )
        );
      })
    );

    for (const [path, action] of [
      ["withdraw", "withdraw"],
      ["reject", "reject"],
      ["hire", "hire"],
      ["cancel", "cancel"]
    ] as const) {
      router.post(
        `/organizations/:organizationId/candidate-applications/:applicationId/${path}`,
        asyncHandler(async (request, response) => {
          response.json(
            await candidateApplications[action](
              getActor(request),
              routeParam(request.params.organizationId),
              routeParam(request.params.applicationId),
              request.body
            )
          );
        })
      );
    }

    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/notes",
      asyncHandler(async (request, response) => {
        const note = await candidateApplications.addNote(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.applicationId),
          request.body
        );
        response.status(201).json(note);
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications/:applicationId/events",
      asyncHandler(async (request, response) => {
        response.json(
          await candidateApplications.listEvents(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications/:applicationId/notes",
      asyncHandler(async (request, response) => {
        response.json(
          await candidateApplications.listNotes(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications/:applicationId/history",
      asyncHandler(async (request, response) => {
        response.json(
          await candidateApplications.history(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId)
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/candidate-applications/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await candidateApplications.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  if (proposals) {
    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/proposals/draft",
      asyncHandler(async (request, response) => {
        const draft = await proposals.createDraft(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.applicationId),
          request.body
        );
        response.status(201).json(draft);
      })
    );

    router.patch(
      "/organizations/:organizationId/candidate-applications/:applicationId/proposals/draft",
      asyncHandler(async (request, response) => {
        response.json(
          await proposals.createDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/proposals/issue",
      asyncHandler(async (request, response) => {
        const result = await proposals.issue(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.applicationId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(result.idempotentReplay ? 200 : 201).json(result);
      })
    );

    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/proposals/supersede",
      asyncHandler(async (request, response) => {
        const result = await proposals.supersede(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.applicationId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(result.idempotentReplay ? 200 : 201).json(result);
      })
    );

    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/proposals/cancel",
      asyncHandler(async (request, response) => {
        response.json(
          await proposals.cancel(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/proposals/discard-draft",
      asyncHandler(async (request, response) => {
        response.json(
          await proposals.discardDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/proposals/rotate-grant",
      asyncHandler(async (request, response) => {
        const result = await proposals.rotateGrant(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.applicationId),
          request.header("Idempotency-Key")
        );
        response.status(result.idempotentReplay ? 200 : 201).json(result);
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications/:applicationId/proposals",
      asyncHandler(async (request, response) => {
        response.json(
          await proposals.getProposal(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications/:applicationId/proposals/versions",
      asyncHandler(async (request, response) => {
        response.json(
          await proposals.listVersions(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications/:applicationId/proposals/events",
      asyncHandler(async (request, response) => {
        response.json(
          await proposals.listEvents(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/proposals/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await proposals.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );

    router.get(
      "/public/proposals/current",
      asyncHandler(async (request, response) => {
        response.setHeader("Cache-Control", "no-store");
        response.json(
          await proposals.getPublic(extractProposalAccessToken(request), {
            ip: request.ip ?? "",
            userAgent: request.header("User-Agent") ?? null
          })
        );
      })
    );

    router.post(
      "/public/proposals/accept",
      asyncHandler(async (request, response) => {
        response.setHeader("Cache-Control", "no-store");
        response.json(
          await proposals.accept(extractProposalAccessToken(request), request.body, {
            ip: request.ip ?? "",
            userAgent: request.header("User-Agent") ?? null,
            idempotencyKey: request.header("Idempotency-Key")
          })
        );
      })
    );

    router.post(
      "/public/proposals/decline",
      asyncHandler(async (request, response) => {
        response.setHeader("Cache-Control", "no-store");
        response.json(
          await proposals.decline(extractProposalAccessToken(request), request.body, {
            ip: request.ip ?? "",
            userAgent: request.header("User-Agent") ?? null,
            idempotencyKey: request.header("Idempotency-Key")
          })
        );
      })
    );
  }

  if (interviews) {
    router.post(
      "/organizations/:organizationId/interviews",
      asyncHandler(async (request, response) => {
        const interview = await interviews.createInterview(
          getActor(request),
          routeParam(request.params.organizationId),
          request.body
        );
        response.status(201).json(interview);
      })
    );

    router.get(
      "/organizations/:organizationId/interviews",
      asyncHandler(async (request, response) => {
        response.json(
          await interviews.listInterviews(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications/:applicationId/interviews",
      asyncHandler(async (request, response) => {
        response.json(
          await interviews.listByApplication(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/interviews/:interviewId",
      asyncHandler(async (request, response) => {
        response.json(
          await interviews.getInterview(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.interviewId)
          )
        );
      })
    );

    router.patch(
      "/organizations/:organizationId/interviews/:interviewId/draft",
      asyncHandler(async (request, response) => {
        response.json(
          await interviews.updateDraft(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.interviewId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/interviews/:interviewId/participants",
      asyncHandler(async (request, response) => {
        const participant = await interviews.addParticipant(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.interviewId),
          request.body
        );
        response.status(201).json(participant);
      })
    );

    router.post(
      "/organizations/:organizationId/interviews/:interviewId/participants/:userId/remove",
      asyncHandler(async (request, response) => {
        response.json(
          await interviews.removeParticipant(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.interviewId),
            routeParam(request.params.userId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/interviews/:interviewId/questions",
      asyncHandler(async (request, response) => {
        const question = await interviews.addQuestion(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.interviewId),
          request.body
        );
        response.status(201).json(question);
      })
    );

    for (const [path, action] of [
      ["schedule", "schedule"],
      ["reschedule", "reschedule"]
    ] as const) {
      router.post(
        `/organizations/:organizationId/interviews/:interviewId/${path}`,
        asyncHandler(async (request, response) => {
          response.json(
            await interviews[action](
              getActor(request),
              routeParam(request.params.organizationId),
              routeParam(request.params.interviewId),
              request.body
            )
          );
        })
      );
    }

    router.post(
      "/organizations/:organizationId/interviews/:interviewId/start",
      asyncHandler(async (request, response) => {
        response.json(
          await interviews.start(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.interviewId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/interviews/:interviewId/responses",
      asyncHandler(async (request, response) => {
        const result = await interviews.recordResponse(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.interviewId),
          request.body
        );
        response.status(201).json(result);
      })
    );

    router.post(
      "/organizations/:organizationId/interviews/:interviewId/evaluations",
      asyncHandler(async (request, response) => {
        const result = await interviews.recordEvaluation(
          getActor(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.interviewId),
          request.body
        );
        response.status(201).json(result);
      })
    );

    for (const [path, action] of [
      ["complete", "complete"],
      ["cancel", "cancel"],
      ["no-show", "noShow"]
    ] as const) {
      router.post(
        `/organizations/:organizationId/interviews/:interviewId/${path}`,
        asyncHandler(async (request, response) => {
          response.json(
            await interviews[action](
              getActor(request),
              routeParam(request.params.organizationId),
              routeParam(request.params.interviewId),
              request.body
            )
          );
        })
      );
    }

    router.get(
      "/organizations/:organizationId/interviews/:interviewId/timeline",
      asyncHandler(async (request, response) => {
        response.json(
          await interviews.timeline(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.interviewId)
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/interviews/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await interviews.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  if (ai) {
    // --- Platform Admin: global catalogs and platform-level availability -----------------
    router.get(
      "/platform/ai/features",
      asyncHandler(async (request, response) => {
        response.json(await ai.policy.listFeatureCatalogAsPlatformAdmin(getActor(request)));
      })
    );
    router.post(
      "/platform/ai/features",
      asyncHandler(async (request, response) => {
        response.status(201).json(await ai.policy.createFeature(getActor(request), request.body));
      })
    );
    router.patch(
      "/platform/ai/features/:featureKey/availability",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.policy.setFeatureAvailability(
            getActor(request),
            routeParam(request.params.featureKey),
            request.body
          )
        );
      })
    );
    router.patch(
      "/platform/ai/features/:featureKey/fallback-allowed",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.policy.setFallbackAllowedOnPlatform(
            getActor(request),
            routeParam(request.params.featureKey),
            request.body
          )
        );
      })
    );
    router.patch(
      "/platform/ai/features/:featureKey/default-prompt",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.policy.setDefaultPromptKey(
            getActor(request),
            routeParam(request.params.featureKey),
            request.body
          )
        );
      })
    );

    router.get(
      "/platform/organizations/:organizationId/ai/settings",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.policy.getOrganizationSettingsAsPlatformAdmin(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );
    router.put(
      "/platform/organizations/:organizationId/ai/settings/platform-allowed",
      asyncHandler(async (request, response) => {
        const value = validatePlatformAllowedInput(request.body);
        response.json(
          await ai.policy.setPlatformAllowed(
            getActor(request),
            routeParam(request.params.organizationId),
            value
          )
        );
      })
    );

    router.get(
      "/platform/ai/providers",
      asyncHandler(async (request, response) => {
        response.json(await ai.providerCatalog.listAsPlatformAdmin(getActor(request)));
      })
    );
    router.post(
      "/platform/ai/providers",
      asyncHandler(async (request, response) => {
        response
          .status(201)
          .json(await ai.providerCatalog.register(getActor(request), request.body));
      })
    );
    router.patch(
      "/platform/ai/providers/:provider/retire",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.providerCatalog.retire(getActor(request), routeParam(request.params.provider))
        );
      })
    );

    router.get(
      "/platform/ai/models",
      asyncHandler(async (request, response) => {
        response.json(await ai.modelRegistry.listAsPlatformAdmin(getActor(request)));
      })
    );
    router.post(
      "/platform/ai/models",
      asyncHandler(async (request, response) => {
        response.status(201).json(await ai.modelRegistry.register(getActor(request), request.body));
      })
    );
    router.patch(
      "/platform/ai/models/:provider/:modelKey/retire",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.modelRegistry.retire(
            getActor(request),
            routeParam(request.params.provider),
            routeParam(request.params.modelKey)
          )
        );
      })
    );

    router.get(
      "/platform/ai/prompts/:promptKey/versions",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.promptRegistry.listVersionsAsPlatformAdmin(
            getActor(request),
            routeParam(request.params.promptKey)
          )
        );
      })
    );
    router.post(
      "/platform/ai/prompts",
      asyncHandler(async (request, response) => {
        response
          .status(201)
          .json(await ai.promptRegistry.createDraft(getActor(request), request.body));
      })
    );
    router.post(
      "/platform/ai/prompts/:promptKey/versions/:version/publish",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.promptRegistry.publish(
            getActor(request),
            routeParam(request.params.promptKey),
            Number(routeParam(request.params.version))
          )
        );
      })
    );
    router.post(
      "/platform/ai/prompts/:promptKey/archive",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.promptRegistry.archivePublished(
            getActor(request),
            routeParam(request.params.promptKey)
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/ai/providers/:provider/platform-managed",
      asyncHandler(async (request, response) => {
        response.status(201).json(
          await ai.providerConfig.configureCredential(
            getActor(request),
            routeParam(request.params.organizationId),
            {
              provider: routeParam(request.params.provider),
              credentialMode: "platform_managed",
              secret: request.body?.secret
            }
          )
        );
      })
    );
    router.delete(
      "/platform/organizations/:organizationId/ai/providers/:provider/platform-managed",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.providerConfig.revokeCredential(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.provider)
          )
        );
      })
    );
    router.post(
      "/platform/organizations/:organizationId/ai/providers/:provider/test-connection",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.providerConfig.testConnection(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.provider)
          )
        );
      })
    );

    // --- Organization: Owner administers, Admin only reads, Member has no access ---------
    router.get(
      "/organizations/:organizationId/ai/settings",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.policy.getOrganizationSettings(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );
    router.put(
      "/organizations/:organizationId/ai/settings",
      asyncHandler(async (request, response) => {
        const value = validateOrganizationAiEnabledInput(request.body);
        response.json(
          await ai.policy.setOrganizationPreference(
            getActor(request),
            routeParam(request.params.organizationId),
            value
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/ai/features",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.policy.listAvailableFeatures(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );
    router.get(
      "/organizations/:organizationId/ai/features/:featureKey",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.policy.getFeatureSettings(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.featureKey)
          )
        );
      })
    );
    router.patch(
      "/organizations/:organizationId/ai/features/:featureKey/enabled",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.policy.setOrganizationFeatureEnabled(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.featureKey),
            request.body
          )
        );
      })
    );
    router.patch(
      "/organizations/:organizationId/ai/features/:featureKey/fallback",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.policy.setOrganizationFallbackEnabled(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.featureKey),
            request.body
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/ai/providers",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.providerCatalog.listActiveForOrganization(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/ai/provider-configs",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.providerConfig.listForOrganization(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );
    router.get(
      "/organizations/:organizationId/ai/provider-configs/:provider",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.providerConfig.getStatus(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.provider)
          )
        );
      })
    );
    router.post(
      "/organizations/:organizationId/ai/provider-configs",
      asyncHandler(async (request, response) => {
        response
          .status(201)
          .json(
            await ai.providerConfig.configureCredential(
              getActor(request),
              routeParam(request.params.organizationId),
              request.body
            )
          );
      })
    );
    router.delete(
      "/organizations/:organizationId/ai/provider-configs/:provider",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.providerConfig.revokeCredential(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.provider)
          )
        );
      })
    );
    router.post(
      "/organizations/:organizationId/ai/provider-configs/:provider/test-connection",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.providerConfig.testConnection(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.provider)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/ai/models",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.modelRegistry.listAvailableForOrganization(
            getActor(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/ai/routing/:featureKey",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.routing.listRoutes(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.featureKey)
          )
        );
      })
    );
    router.post(
      "/organizations/:organizationId/ai/routing",
      asyncHandler(async (request, response) => {
        response
          .status(201)
          .json(
            await ai.routing.createRoute(
              getActor(request),
              routeParam(request.params.organizationId),
              request.body
            )
          );
      })
    );
    router.post(
      "/organizations/:organizationId/ai/routing/:routingId/deactivate",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.routing.deactivateRoute(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.routingId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/ai/executions",
      asyncHandler(async (request, response) => {
        const featureKey = request.query.featureKey;
        response.json(
          await ai.listExecutions(
            getActor(request),
            routeParam(request.params.organizationId),
            typeof featureKey === "string" ? featureKey : undefined
          )
        );
      })
    );
  }

  // --- Fase 20 (SPEC-023 v1.1) - Pre-Analise Assistida por IA -----------------------------
  // Sem rota publica -- o Candidate nunca e ator desta SPEC (Sec 3, Sec 24.1, Sec 26).
  if (preAnalyses) {
    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/pre-analyses",
      asyncHandler(async (request, response) => {
        const created = await preAnalyses.requestPreAnalysis(
          getActor(request),
          routeParam(request.params.organizationId),
          { candidateApplicationId: routeParam(request.params.applicationId) }
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications/:applicationId/pre-analyses",
      asyncHandler(async (request, response) => {
        response.json(
          await preAnalyses.listByApplication(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/pre-analyses/:preAnalysisId",
      asyncHandler(async (request, response) => {
        response.json(
          await preAnalyses.getForOwner(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.preAnalysisId)
          )
        );
      })
    );

    // `member` recebe exclusivamente id+status (SPEC-023 Sec 24.2) -- este endpoint delega ao
    // service, que decide o DTO pelo role real da Membership, nunca pelo que o cliente pede.
    router.get(
      "/organizations/:organizationId/pre-analyses/:preAnalysisId/status",
      asyncHandler(async (request, response) => {
        response.json(
          await preAnalyses.getForMember(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.preAnalysisId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/pre-analyses/:preAnalysisId/result",
      asyncHandler(async (request, response) => {
        response.json(
          await preAnalyses.getResult(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.preAnalysisId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/pre-analyses/:preAnalysisId/evidences",
      asyncHandler(async (request, response) => {
        response.json(
          await preAnalyses.getEvidences(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.preAnalysisId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/pre-analyses/:preAnalysisId/events",
      asyncHandler(async (request, response) => {
        response.json(
          await preAnalyses.listEvents(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.preAnalysisId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/pre-analyses/:preAnalysisId/cancel",
      asyncHandler(async (request, response) => {
        response.json(
          await preAnalyses.cancel(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.preAnalysisId),
            request.body
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/pre-analyses/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await preAnalyses.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  // --- Fase 21 (SPEC-024 v1.1) - Dossie Inteligente do Candidato -------------------------
  // Sem rota publica e sem chamada a AIService: materializa fontes ja existentes.
  if (candidateDossiers) {
    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/candidate-dossiers",
      asyncHandler(async (request, response) => {
        const created = await candidateDossiers.generate(
          getActor(request),
          routeParam(request.params.organizationId),
          {
            ...request.body,
            candidateApplicationId: routeParam(request.params.applicationId)
          },
          request.header("Idempotency-Key")
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications/:applicationId/candidate-dossiers",
      asyncHandler(async (request, response) => {
        response.json(
          await candidateDossiers.listByApplication(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-dossiers/:candidateDossierId",
      asyncHandler(async (request, response) => {
        response.json(
          await candidateDossiers.getForOwner(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.candidateDossierId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-dossiers/:candidateDossierId/status",
      asyncHandler(async (request, response) => {
        response.json(
          await candidateDossiers.getForMember(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.candidateDossierId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-dossiers/:candidateDossierId/sources",
      asyncHandler(async (request, response) => {
        response.json(
          await candidateDossiers.getSources(
            getActor(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.candidateDossierId)
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/candidate-dossiers/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await candidateDossiers.adminRead(
            getActor(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  return router;
}

function routeParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

// Fase 18 (SPEC-021, secao 25.1; Plano Tecnico, correcao final, item 3/36): token nunca no
// path nem em query string -- somente em header dedicado. `PreInterviewService` trata qualquer
// valor ausente/malformado como token invalido (resposta publica generica, sem diferenciar
// "ausente" de "invalido").
// Revisao destrutiva (Plano Tecnico, correcao final, item 39): a versao anterior usava
// `header.split(" ")[1]`, que corta silenciosamente no primeiro espaco -- um cabecalho com
// espacos duplicados ("PreInterview  abc") pegava a string vazia entre eles como token, nunca
// "abc". A expressao regular abaixo exige exatamente "<scheme> <token-sem-espacos>" do inicio
// ao fim do cabecalho (apos trim): multiplos espacos entre scheme/token sao aceitos
// (`\s+`), mas qualquer conteudo alem de um unico token final (por exemplo, dois cabecalhos
// Authorization concatenados pelo Node em "PreInterview a, PreInterview b") nunca casa, e cai
// no mesmo caminho seguro de token vazio/invalido. O nome do scheme e comparado sem diferenciar
// maiusculas/minusculas (mesma leniencia convencional de esquemas de autenticacao HTTP); o
// token em si nunca tem essa leniencia aplicada.
const PRE_INTERVIEW_AUTH_HEADER = /^PreInterview\s+(\S+)$/i;
// Limite defensivo de tamanho -- nenhum token legitimo gerado por este modulo passa de 43
// caracteres (32 bytes em base64url); um valor muito maior nunca e util, apenas descartado
// antes de qualquer hash, sem custo de processamento desnecessario.
const MAX_ACCESS_TOKEN_LENGTH = 512;

function extractAccessToken(request: Request) {
  const header = request.header("Authorization");
  if (!header) {
    return "";
  }
  const match = PRE_INTERVIEW_AUTH_HEADER.exec(header.trim());
  const token = match?.[1] ?? "";
  return token.length > MAX_ACCESS_TOKEN_LENGTH ? "" : token;
}

// Fase 19 (SPEC-022, secao 25.1): mesmo padrao de extracao da Pre-Entrevista (Fase 18), com
// scheme dedicado -- nunca compartilha o mesmo scheme HTTP de outro modulo de token opaco,
// para nao permitir que um token de uma finalidade seja aceito por engano na rota de outra.
const BEHAVIORAL_ASSESSMENT_AUTH_HEADER = /^BehavioralAssessment\s+(\S+)$/i;
const PROPOSAL_AUTH_HEADER = /^Proposal\s+(\S+)$/i;

function extractBehavioralAssessmentAccessToken(request: Request) {
  const header = request.header("Authorization");
  if (!header) {
    return "";
  }
  const match = BEHAVIORAL_ASSESSMENT_AUTH_HEADER.exec(header.trim());
  const token = match?.[1] ?? "";
  return token.length > MAX_ACCESS_TOKEN_LENGTH ? "" : token;
}

function extractProposalAccessToken(request: Request) {
  const header = request.header("Authorization");
  if (!header) {
    return "";
  }
  const match = PROPOSAL_AUTH_HEADER.exec(header.trim());
  const token = match?.[1] ?? "";
  return token.length > MAX_ACCESS_TOKEN_LENGTH ? "" : token;
}

function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>
) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}
