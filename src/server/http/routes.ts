import type { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { Router as createRouter } from "express";
import { getActor } from "./dev-auth";
import { forbidden } from "../core/errors";
import type { CoreService } from "../core/service";
import type { DnaService } from "../dna/service";

export function createApiRouter(core: CoreService, dna?: DnaService): Router {
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
