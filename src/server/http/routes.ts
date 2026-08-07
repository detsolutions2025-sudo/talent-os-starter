import type { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { Router as createRouter } from "express";
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
import type { QuestionService } from "../questions/service";

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
  interviews?: InterviewService
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

  return router;
}

function routeParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>
) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}
