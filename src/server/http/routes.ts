import type { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { Router as createRouter } from "express";
import type { AIService } from "../ai/service";
import { validateOrganizationAiEnabledInput, validatePlatformAllowedInput } from "../ai/validation";
import type { BlueprintService } from "../blueprints/service";
import type { CandidateApplicationService } from "../candidate-applications/service";
import type { CandidateService } from "../candidates/service";
import type { CompetencyService } from "../competencies/service";
import { DevActorProvider, type ActorProvider } from "./actor-provider";
import type { AuthService } from "../auth/service";
import { clearSessionCookies, readSessionCookies, setSessionCookies } from "./cookies";
import { badRequest, forbidden } from "../core/errors";
import type { CoreService } from "../core/service";
import type { DnaService } from "../dna/service";
import type { JobOpeningService } from "../job-openings/service";
import type { JobProfileService } from "../job-profiles/service";
import type { InterviewService } from "../interviews/service";
import type { OrganizationalUnitService } from "../organizational-units/service";
import type { OnboardingService } from "../onboardings/service";
import type { EmploymentService } from "../employments/service";
import type { DevelopmentRetentionService } from "../development-retention/service";
import type { OffboardingService } from "../offboardings/service";
import type { AccessGrantService } from "../access-grants/service";
import type { PreInterviewService } from "../pre-interviews/service";
import type { PublicApplicationService } from "../public-applications/service";
import type { QuestionService } from "../questions/service";
import type { BehavioralAssessmentService } from "../behavioral-assessments/service";
import type { PreAnalysisService } from "../pre-analyses/service";
import type { ProposalService } from "../proposals/service";
import type { CandidateDossierService } from "../candidate-dossiers/service";

export function createApiRouter(
  core: CoreService,
  // Fase 29 (ADR-0026; SPEC-028 v1.0). Excecao deliberada a convencao de "sempre acrescentar ao
  // fim" -- `actorProvider` e infraestrutura central (como `core`), nunca um servico de dominio
  // opcional. Default `DevActorProvider` preserva, sem tocar nenhum dos ~25 pontos de chamada
  // de teste existentes, o comportamento identico de antes desta Fase (dev-auth); producao
  // (index.ts) sempre passa o provider real explicitamente -- o default nunca e alcancado la.
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
  // Fase 20 (SPEC-023 v1.1). Ultimo parametro posicional -- mesma convencao ja usada por todo
  // o roteador (cada Fase acrescenta seu servico opcional ao final da assinatura, nunca no
  // meio, para nao quebrar nenhuma chamada posicional ja existente de fases anteriores).
  preAnalyses?: PreAnalysisService,
  // Fase 21 (SPEC-024 v1.1). Mantido no fim da assinatura posicional.
  candidateDossiers?: CandidateDossierService,
  proposals?: ProposalService,
  onboardings?: OnboardingService,
  employments?: EmploymentService,
  developmentRetention?: DevelopmentRetentionService,
  // Fase 27 (SPEC-026 v1.0). Mantido no fim da assinatura posicional, mesma convencao ja usada
  // por todo o roteador.
  offboardings?: OffboardingService,
  // Fase 28 (ADR-0025; SPEC-027 v1.0). Mantido no fim da assinatura posicional.
  accessGrants?: AccessGrantService,
  // Fase 29 (ADR-0026; SPEC-028 v1.0). Mantido no fim da assinatura posicional (servico
  // opcional, ao contrario de `actorProvider` acima).
  auth?: AuthService,
  // Fase 29: `APP_ENV=production` determina se os cookies de sessao usam `Secure` -- passado
  // explicitamente (nunca lido de `process.env` dentro de routes.ts) para manter o modulo
  // testavel sem variaveis de ambiente globais.
  isProductionEnv = false
): Router {
  const router = createRouter();

  // Fase 31 (ADR-0027; SPEC-030 v1.0, RN-036/RN-037/RN-038). `Cache-Control: no-store` para
  // toda resposta deste roteador -- cobre as classes E/F (Membership/Platform Admin
  // cookie-autenticadas, mandatorio) e G (bootstrap de sessao, tambem `no-store` pela matriz da
  // SPEC), e estende conservadoramente as classes B/C (a SPEC deixa "a definir"/"recomendado",
  // nunca proibido). `GET /api/health` (classe A, RN-038) fica FORA deste roteador (registrado
  // direto em `app.ts`), entao seu comportamento de cache atual e preservado sem alteracao. As
  // chamadas manuais ja existentes em rotas publicas token-based (classe D, RN-037) permanecem
  // intocadas -- redundantes com este middleware, nunca removidas.
  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  router.get(
    "/dev/me",
    asyncHandler(async (request, response) => {
      response.json(await core.getCurrentUser(await actorProvider.resolve(request)));
    })
  );

  router.post(
    "/dev/users",
    asyncHandler(async (request, response) => {
      const user = await core.createUser(await actorProvider.resolve(request), request.body);
      response.status(201).json(user);
    })
  );

  router.get(
    "/dev/users",
    asyncHandler(async (request, response) => {
      response.json(await core.listUsers(await actorProvider.resolve(request)));
    })
  );

  router.get(
    "/audit-events",
    asyncHandler(async (request, response) => {
      const actor = await actorProvider.resolve(request);

      if (actor.kind !== "platform") {
        throw forbidden("permission_denied", "Permission denied.");
      }

      response.json(await core.auditEvents());
    })
  );

  router.post(
    "/organizations",
    asyncHandler(async (request, response) => {
      const result = await core.createOrganization(
        await actorProvider.resolve(request),
        request.body
      );
      response.status(201).json(result);
    })
  );

  router.get(
    "/organizations",
    asyncHandler(async (request, response) => {
      response.json(await core.listOrganizations(await actorProvider.resolve(request)));
    })
  );

  router.get(
    "/organizations/:organizationId",
    asyncHandler(async (request, response) => {
      response.json(
        await core.getOrganization(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId)
        )
      );
    })
  );

  router.patch(
    "/organizations/:organizationId",
    asyncHandler(async (request, response) => {
      response.json(
        await core.updateOrganization(
          await actorProvider.resolve(request),
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
        await core.archiveOrganization(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId)
        )
      );
    })
  );

  router.post(
    "/organizations/:organizationId/reactivate",
    asyncHandler(async (request, response) => {
      response.json(
        await core.reactivateOrganization(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId)
        )
      );
    })
  );

  router.get(
    "/organizations/:organizationId/memberships",
    asyncHandler(async (request, response) => {
      response.json(
        await core.listMemberships(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId)
        )
      );
    })
  );

  router.post(
    "/organizations/:organizationId/memberships",
    asyncHandler(async (request, response) => {
      const membership = await core.createMembership(await actorProvider.resolve(request), {
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
        await actorProvider.resolve(request),
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
          await dna.getPublished(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/dna/draft",
      asyncHandler(async (request, response) => {
        response.json(
          await dna.getActiveDraft(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/dna/versions",
      asyncHandler(async (request, response) => {
        response.json(
          await dna.listVersions(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/dna/versions/:versionId",
      asyncHandler(async (request, response) => {
        response.json(
          await dna.getVersion(
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
        const competency = await competencies.createGlobal(
          await actorProvider.resolve(request),
          request.body
        );
        response.status(201).json(competency);
      })
    );

    router.get(
      "/platform/competencies/global",
      asyncHandler(async (request, response) => {
        response.json(await competencies.listGlobals(await actorProvider.resolve(request)));
      })
    );

    router.get(
      "/platform/competencies/global/history",
      asyncHandler(async (request, response) => {
        response.json(await competencies.globalHistory(await actorProvider.resolve(request)));
      })
    );

    router.get(
      "/platform/competencies/global/:globalCompetencyId",
      asyncHandler(async (request, response) => {
        response.json(
          await competencies.getGlobal(
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
          await jobProfiles.listActive(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/job-profiles/inactive",
      asyncHandler(async (request, response) => {
        response.json(
          await jobProfiles.listInactive(
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await blueprints.getStatus(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/blueprint/readiness",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.getReadiness(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/blueprint/draft",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.getDraft(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/blueprint/drafts",
      asyncHandler(async (request, response) => {
        const draft = await blueprints.createDraft(
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/blueprint/active",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.getActive(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/blueprint/history",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.getHistory(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/blueprint/versions/:versionId",
      asyncHandler(async (request, response) => {
        response.json(
          await blueprints.getVersion(
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
        const question = await questions.createGlobal(
          await actorProvider.resolve(request),
          request.body
        );
        response.status(201).json(question);
      })
    );

    router.get(
      "/platform/questions/global",
      asyncHandler(async (request, response) => {
        response.json(await questions.listGlobals(await actorProvider.resolve(request)));
      })
    );

    router.get(
      "/platform/questions/global/history",
      asyncHandler(async (request, response) => {
        response.json(await questions.globalHistory(await actorProvider.resolve(request)));
      })
    );

    router.get(
      "/platform/questions/global/:globalQuestionId",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.getGlobal(
            await actorProvider.resolve(request),
            routeParam(request.params.globalQuestionId)
          )
        );
      })
    );

    router.patch(
      "/platform/questions/global/:globalQuestionId",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.updateGlobal(
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/questions/history",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.listHistory(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/questions/catalog/:catalogItemId",
      asyncHandler(async (request, response) => {
        response.json(
          await questions.getCatalogItem(
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
              await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );

    router.get(
      "/public/job-openings/:slug",
      asyncHandler(async (request, response) => {
        response.json(
          await jobOpenings.getPublicBySlug(
            routeParam(request.params.slug),
            request.ip ?? request.socket.remoteAddress ?? "unknown"
          )
        );
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
          request.body
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/platform/behavioral-instruments",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.listGlobalInstruments(await actorProvider.resolve(request))
        );
      })
    );

    router.get(
      "/platform/behavioral-instruments/:instrumentId",
      asyncHandler(async (request, response) => {
        response.json(
          await behavioralAssessments.getInstrument(
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
          await candidates.listActive(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/candidates/inactive",
      asyncHandler(async (request, response) => {
        response.json(
          await candidates.listInactive(
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
              await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
              await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
              await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
        response.json(
          await ai.policy.listFeatureCatalogAsPlatformAdmin(await actorProvider.resolve(request))
        );
      })
    );
    router.post(
      "/platform/ai/features",
      asyncHandler(async (request, response) => {
        response
          .status(201)
          .json(await ai.policy.createFeature(await actorProvider.resolve(request), request.body));
      })
    );
    router.patch(
      "/platform/ai/features/:featureKey/availability",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.policy.setFeatureAvailability(
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            value
          )
        );
      })
    );

    router.get(
      "/platform/ai/providers",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.providerCatalog.listAsPlatformAdmin(await actorProvider.resolve(request))
        );
      })
    );
    router.post(
      "/platform/ai/providers",
      asyncHandler(async (request, response) => {
        response
          .status(201)
          .json(
            await ai.providerCatalog.register(await actorProvider.resolve(request), request.body)
          );
      })
    );
    router.patch(
      "/platform/ai/providers/:provider/retire",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.providerCatalog.retire(
            await actorProvider.resolve(request),
            routeParam(request.params.provider)
          )
        );
      })
    );

    router.get(
      "/platform/ai/models",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.modelRegistry.listAsPlatformAdmin(await actorProvider.resolve(request))
        );
      })
    );
    router.post(
      "/platform/ai/models",
      asyncHandler(async (request, response) => {
        response
          .status(201)
          .json(
            await ai.modelRegistry.register(await actorProvider.resolve(request), request.body)
          );
      })
    );
    router.patch(
      "/platform/ai/models/:provider/:modelKey/retire",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.modelRegistry.retire(
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          .json(
            await ai.promptRegistry.createDraft(await actorProvider.resolve(request), request.body)
          );
      })
    );
    router.post(
      "/platform/ai/prompts/:promptKey/versions/:version/publish",
      asyncHandler(async (request, response) => {
        response.json(
          await ai.promptRegistry.publish(
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
              await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
              await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
          await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
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
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  // --- Fase 23 (SPEC-016 v1.0) - Onboarding interno -------------------------------
  // Sem rota publica: a pessoa onboardada nao recebe User, Membership, token ou portal.
  if (onboardings) {
    router.post(
      "/organizations/:organizationId/candidate-applications/:applicationId/onboarding",
      asyncHandler(async (request, response) => {
        const created = await onboardings.create(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.applicationId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/candidate-applications/:applicationId/onboarding",
      asyncHandler(async (request, response) => {
        response.json(
          await onboardings.getByApplication(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.applicationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/onboardings/:onboardingId",
      asyncHandler(async (request, response) => {
        response.json(
          await onboardings.get(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.onboardingId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/onboardings/:onboardingId/tasks",
      asyncHandler(async (request, response) => {
        response.json(
          await onboardings.listTasks(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.onboardingId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/onboarding-tasks/mine",
      asyncHandler(async (request, response) => {
        response.json(
          await onboardings.listMyTasks(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/onboardings/:onboardingId/start",
      asyncHandler(async (request, response) => {
        response.json(
          await onboardings.start(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.onboardingId),
            request.header("Idempotency-Key")
          )
        );
      })
    );

    // Fase 26 (SPEC-016 v1.1 s43-s51): vinculo tardio, explicito e imutavel
    // entre Onboarding e Employment. employmentId nunca e aceito no create.
    router.post(
      "/organizations/:organizationId/onboardings/:onboardingId/employment-link",
      asyncHandler(async (request, response) => {
        response.json(
          await onboardings.linkEmployment(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.onboardingId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/onboardings/:onboardingId/tasks",
      asyncHandler(async (request, response) => {
        const task = await onboardings.addTask(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.onboardingId),
          request.body
        );
        response.status(201).json(task);
      })
    );

    router.patch(
      "/organizations/:organizationId/onboarding-tasks/:taskId/assignment",
      asyncHandler(async (request, response) => {
        response.json(
          await onboardings.assignTask(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.taskId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/onboarding-tasks/:taskId/complete",
      asyncHandler(async (request, response) => {
        response.json(
          await onboardings.completeTask(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.taskId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/onboarding-tasks/:taskId/cancel",
      asyncHandler(async (request, response) => {
        response.json(
          await onboardings.cancelTask(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.taskId),
            request.body
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/onboardings/:onboardingId/complete",
      asyncHandler(async (request, response) => {
        response.json(
          await onboardings.complete(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.onboardingId),
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/onboardings/:onboardingId/cancel",
      asyncHandler(async (request, response) => {
        response.json(
          await onboardings.cancel(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.onboardingId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/onboardings/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await onboardings.adminRead(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  // --- Fase 24 (SPEC-025 v1.0) - OrganizationPerson e Employment -------------------------
  // Sem rota publica e sem automacao: contratar, ativar, encerrar e cancelar sao atos internos
  // explicitos, idempotentes e auditados. User/Membership continuam separados do Employment.
  if (employments) {
    router.post(
      "/organizations/:organizationId/organization-people",
      asyncHandler(async (request, response) => {
        const created = await employments.createPerson(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/organization-people",
      asyncHandler(async (request, response) => {
        response.json(
          await employments.listPeople(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/organization-people/:personId",
      asyncHandler(async (request, response) => {
        response.json(
          await employments.getPerson(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.personId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/employments",
      asyncHandler(async (request, response) => {
        const created = await employments.createEmployment(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/employments",
      asyncHandler(async (request, response) => {
        const organizationPersonId =
          typeof request.query.organizationPersonId === "string"
            ? request.query.organizationPersonId
            : undefined;
        response.json(
          await employments.listEmployments(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            organizationPersonId
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/employments/:employmentId/activate",
      asyncHandler(async (request, response) => {
        response.json(
          await employments.activate(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.employmentId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/employments/:employmentId/cancel",
      asyncHandler(async (request, response) => {
        response.json(
          await employments.cancel(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.employmentId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/employments/:employmentId/end",
      asyncHandler(async (request, response) => {
        response.json(
          await employments.end(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.employmentId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/employments/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await employments.adminRead(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  // --- Fase 25 (SPEC-017 v1.0) - Desenvolvimento e Retencao -------------------------------
  // Employment e o aggregate root obrigatorio: toda rota vive aninhada sob um Employment.
  // Sem rota publica, sem autosservico, sem endpoint generico de mutacao.
  if (developmentRetention) {
    router.post(
      "/organizations/:organizationId/employments/:employmentId/development-plans",
      asyncHandler(async (request, response) => {
        const created = await developmentRetention.createPlan(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.employmentId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/employments/:employmentId/development-plans",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.listPlans(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.employmentId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/development-plans/:planId",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.getPlan(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.planId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/development-plans/:planId/activate",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.activatePlan(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.planId),
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/development-plans/:planId/complete",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.completePlan(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.planId),
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/development-plans/:planId/cancel",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.cancelPlan(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.planId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/development-plans/:planId/goals",
      asyncHandler(async (request, response) => {
        const created = await developmentRetention.createGoal(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.planId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(201).json(created);
      })
    );

    router.post(
      "/organizations/:organizationId/development-goals/:goalId/complete",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.completeGoal(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.goalId),
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/development-goals/:goalId/cancel",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.cancelGoal(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.goalId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/development-plans/:planId/check-ins",
      asyncHandler(async (request, response) => {
        const created = await developmentRetention.createCheckIn(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.planId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(201).json(created);
      })
    );

    router.post(
      "/organizations/:organizationId/employments/:employmentId/retention-concerns",
      asyncHandler(async (request, response) => {
        const created = await developmentRetention.createConcern(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.employmentId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/employments/:employmentId/retention-concerns",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.listConcerns(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.employmentId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/retention-concerns/:concernId/resolve",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.resolveConcern(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.concernId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/retention-concerns/:concernId/cancel",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.cancelConcern(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.concernId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/employments/:employmentId/retention-actions",
      asyncHandler(async (request, response) => {
        const created = await developmentRetention.createAction(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.employmentId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/employments/:employmentId/retention-actions",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.listActions(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.employmentId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/retention-actions/:actionId/complete",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.completeAction(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.actionId),
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/retention-actions/:actionId/cancel",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.cancelAction(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.actionId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/development-retention/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await developmentRetention.adminRead(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  // Fase 27 (SPEC-026 v1.0). Offboarding e aggregate proprio pendurado em Employment;
  // EmploymentService nunca e importado nem chamado a partir daqui.
  if (offboardings) {
    router.post(
      "/organizations/:organizationId/employments/:employmentId/offboardings",
      asyncHandler(async (request, response) => {
        const created = await offboardings.create(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.employmentId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(201).json(created);
      })
    );

    router.get(
      "/organizations/:organizationId/employments/:employmentId/offboardings",
      asyncHandler(async (request, response) => {
        response.json(
          await offboardings.listForEmployment(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.employmentId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/offboardings/:offboardingId",
      asyncHandler(async (request, response) => {
        response.json(
          await offboardings.get(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.offboardingId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/offboardings/:offboardingId/start",
      asyncHandler(async (request, response) => {
        response.json(
          await offboardings.start(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.offboardingId),
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/offboardings/:offboardingId/tasks",
      asyncHandler(async (request, response) => {
        response.json(
          await offboardings.listTasks(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.offboardingId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/offboarding-tasks/mine",
      asyncHandler(async (request, response) => {
        response.json(
          await offboardings.listMyTasks(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/offboardings/:offboardingId/tasks",
      asyncHandler(async (request, response) => {
        const task = await offboardings.addTask(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId),
          routeParam(request.params.offboardingId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(201).json(task);
      })
    );

    router.post(
      "/organizations/:organizationId/offboarding-tasks/:taskId/assign",
      asyncHandler(async (request, response) => {
        response.json(
          await offboardings.assignTask(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.taskId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/offboarding-tasks/:taskId/complete",
      asyncHandler(async (request, response) => {
        response.json(
          await offboardings.completeTask(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.taskId),
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/offboarding-tasks/:taskId/cancel",
      asyncHandler(async (request, response) => {
        response.json(
          await offboardings.cancelTask(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.taskId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/offboardings/:offboardingId/complete",
      asyncHandler(async (request, response) => {
        response.json(
          await offboardings.complete(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.offboardingId),
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/organizations/:organizationId/offboardings/:offboardingId/cancel",
      asyncHandler(async (request, response) => {
        response.json(
          await offboardings.cancel(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.offboardingId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/offboardings/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await offboardings.adminRead(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  // Fase 28 (ADR-0025; SPEC-027 v1.0). AccessGrant e proveniencia/governanca sobre um
  // Membership existente; CoreService/authorize() nunca sao alterados para exigir AccessGrant.
  if (accessGrants) {
    router.post(
      "/organizations/:organizationId/access-grants",
      asyncHandler(async (request, response) => {
        const created = await accessGrants.grant(
          await actorProvider.resolve(request),
          routeParam(request.params.organizationId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(201).json(created);
      })
    );

    router.post(
      "/organizations/:organizationId/access-grants/:accessGrantId/revoke",
      asyncHandler(async (request, response) => {
        response.json(
          await accessGrants.revoke(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.accessGrantId),
            request.body,
            request.header("Idempotency-Key")
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/access-grants/:accessGrantId",
      asyncHandler(async (request, response) => {
        response.json(
          await accessGrants.get(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.accessGrantId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/access-grants",
      asyncHandler(async (request, response) => {
        response.json(
          await accessGrants.list(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/organization-people/:personId/access-grants",
      asyncHandler(async (request, response) => {
        response.json(
          await accessGrants.listByPerson(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.personId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/memberships/:membershipId/access-grants",
      asyncHandler(async (request, response) => {
        response.json(
          await accessGrants.listByMembership(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.membershipId)
          )
        );
      })
    );

    router.get(
      "/organizations/:organizationId/employments/:employmentId/access-grants",
      asyncHandler(async (request, response) => {
        response.json(
          await accessGrants.listByEmployment(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            routeParam(request.params.employmentId)
          )
        );
      })
    );

    router.post(
      "/platform/organizations/:organizationId/access-grants/admin-read",
      asyncHandler(async (request, response) => {
        response.json(
          await accessGrants.adminRead(
            await actorProvider.resolve(request),
            routeParam(request.params.organizationId),
            request.body
          )
        );
      })
    );
  }

  // Fase 29 (ADR-0026; SPEC-028 v1.0). Todas as rotas abaixo dependem de `auth` (AuthService).
  // `/auth/session`, `/auth/refresh` e `/auth/invitations/:id/accept` sao publicas por
  // definicao (a pessoa ainda nao tem sessao local no momento em que as acessa, SPEC-028 s23) --
  // nunca chamam `actorProvider.resolve`. As demais exigem Actor normalmente.
  if (auth) {
    // Ponte de sessao (SPEC-028 s9/s13/s15): frontend fala com o provider diretamente para a
    // credencial (login, aceite de convite) e entrega o token aqui UMA VEZ; o servidor verifica
    // a assinatura localmente e emite os cookies HttpOnly -- o token nunca fica em
    // localStorage/JS do frontend depois deste ponto.
    router.post(
      "/auth/session",
      asyncHandler(async (request, response) => {
        // Fase 32 (ADR-0027 s9): unica das rotas publicas de `auth` sem rate limit ate aqui
        // (achado fisico do discovery) -- chave IP, ja que nenhuma sessao/Actor existe neste
        // ponto. Sempre antes de `verifyToken` (nunca dentro dele -- ver `AuthService`).
        await auth.checkSessionBridgeRateLimit(
          request.ip ?? request.socket.remoteAddress ?? "unknown"
        );
        const accessToken = requireBodyString(request.body, "accessToken");
        const refreshToken = requireBodyString(request.body, "refreshToken");
        // Verificacao local (mesma usada por qualquer requisicao autenticada) -- confirma que o
        // token e legitimo antes de emitir cookie a partir dele; nao exige AuthIdentity
        // existente (pode ser a primeira sessao apos aceite de convite, SPEC-028 s10).
        await auth.verifyToken(accessToken);
        setSessionCookies(response, { accessToken, refreshToken }, isProductionEnv);
        response.status(204).end();
      })
    );

    router.post(
      "/auth/refresh",
      asyncHandler(async (request, response) => {
        // Fase 32 (ADR-0027 s9): mesma justificativa de `/auth/session` acima.
        await auth.checkRefreshRateLimit(request.ip ?? request.socket.remoteAddress ?? "unknown");
        const { refreshToken } = readSessionCookies(request);
        if (!refreshToken) {
          throw forbidden("session_required", "A valid session is required.");
        }
        const session = await auth.refreshSession(refreshToken);
        setSessionCookies(
          response,
          { accessToken: session.accessToken, refreshToken: session.refreshToken },
          isProductionEnv
        );
        response.status(204).end();
      })
    );

    router.post(
      "/auth/logout",
      asyncHandler(async (request, response) => {
        const { refreshToken } = readSessionCookies(request);
        // Limpeza local e revogacao do refresh token no provider sempre ocorrem, mesmo que o
        // access token ja tenha expirado ou a AuthIdentity nao seja mais resolvivel (SPEC-028
        // s9) -- resolucao de Actor e tentada apenas para a AUDITORIA (que exige um userId),
        // nunca como pre-condicao para revogar o refresh token em si (ver comentario em
        // `AuthService.logout`).
        let actor = null;
        try {
          actor = await actorProvider.resolve(request);
        } catch {
          // Sem Actor resolvivel -- auditoria e pulada, mas a revogacao do refresh token
          // (dentro de `auth.logout`) ainda acontece normalmente.
        }
        await auth.logout(actor, refreshToken);
        clearSessionCookies(response, isProductionEnv);
        response.status(204).end();
      })
    );

    router.get(
      "/me",
      asyncHandler(async (request, response) => {
        const actor = await actorProvider.resolve(request);
        const user = await core.getCurrentUser(actor);
        const organizations = actor.kind === "user" ? await core.listOrganizations(actor) : [];
        response.json({ user, organizations });
      })
    );

    router.post(
      "/organizations/:organizationId/invitations",
      asyncHandler(async (request, response) => {
        const actor = await actorProvider.resolve(request);
        const result = await auth.createInvitation(
          actor,
          routeParam(request.params.organizationId),
          request.body,
          request.header("Idempotency-Key")
        );
        response.status(201).json(result);
      })
    );

    router.get(
      "/organizations/:organizationId/invitations",
      asyncHandler(async (request, response) => {
        const actor = await actorProvider.resolve(request);
        response.json(await auth.listInvitations(actor, routeParam(request.params.organizationId)));
      })
    );

    router.post(
      "/organizations/:organizationId/invitations/:invitationId/cancel",
      asyncHandler(async (request, response) => {
        const actor = await actorProvider.resolve(request);
        response.json(
          await auth.cancelInvitation(
            actor,
            routeParam(request.params.organizationId),
            routeParam(request.params.invitationId)
          )
        );
      })
    );

    // SPEC-028 s10/s27: sem Actor previo -- le o access token do proprio cookie de sessao (ja
    // emitido por `/auth/session` apos a confirmacao do provider), nunca de um body separado.
    router.post(
      "/auth/invitations/:invitationId/accept",
      asyncHandler(async (request, response) => {
        const { accessToken } = readSessionCookies(request);
        if (!accessToken) {
          throw forbidden("session_required", "A valid session is required.");
        }
        response.json(
          await auth.acceptInvitation(accessToken, routeParam(request.params.invitationId))
        );
      })
    );

    router.post(
      "/platform/organizations/bootstrap",
      asyncHandler(async (request, response) => {
        const actor = await actorProvider.resolve(request);
        response
          .status(201)
          .json(
            await auth.bootstrapOrganization(actor, request.body, request.header("Idempotency-Key"))
          );
      })
    );

    router.post(
      "/platform/sessions/:userId/revoke",
      asyncHandler(async (request, response) => {
        const actor = await actorProvider.resolve(request);
        await auth.revokeSessionForUser(actor, routeParam(request.params.userId), request.body);
        response.status(204).end();
      })
    );

    router.post(
      "/sessions/revoke",
      asyncHandler(async (request, response) => {
        const actor = await actorProvider.resolve(request);
        const selfUserId = actor.kind === "user" ? actor.userId : null;
        if (!selfUserId) {
          throw forbidden("permission_denied", "Permission denied.");
        }
        await auth.revokeSessionForUser(actor, selfUserId, request.body);
        response.status(204).end();
      })
    );
  }

  return router;
}

function requireBodyString(body: unknown, field: string) {
  const value = (body as Record<string, unknown> | null)?.[field];
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`${field}_required`, `${field} is required.`);
  }
  return value;
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
