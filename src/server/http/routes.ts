import type { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { Router as createRouter } from "express";
import { getActor } from "./dev-auth";
import type { CoreService } from "../core/service";

export function createApiRouter(core: CoreService): Router {
  const router = createRouter();

  router.get("/dev/me", (request, response) => {
    response.json(core.getCurrentUser(getActor(request)));
  });

  router.post(
    "/dev/users",
    asyncHandler(async (request, response) => {
      const user = await core.createUser(getActor(request), request.body);
      response.status(201).json(user);
    })
  );

  router.get("/dev/users", (request, response) => {
    response.json(core.listUsers(getActor(request)));
  });

  router.get("/audit-events", (request, response) => {
    getActor(request);
    response.json(core.auditEvents());
  });

  router.post(
    "/organizations",
    asyncHandler(async (request, response) => {
      const result = await core.createOrganization(getActor(request), request.body);
      response.status(201).json(result);
    })
  );

  router.get("/organizations", (request, response) => {
    response.json(core.listOrganizations(getActor(request)));
  });

  router.get("/organizations/:organizationId", (request, response) => {
    response.json(
      core.getOrganization(getActor(request), routeParam(request.params.organizationId))
    );
  });

  router.patch("/organizations/:organizationId", (request, response) => {
    response.json(
      core.updateOrganization(
        getActor(request),
        routeParam(request.params.organizationId),
        request.body
      )
    );
  });

  router.post("/organizations/:organizationId/archive", (request, response) => {
    response.json(
      core.archiveOrganization(getActor(request), routeParam(request.params.organizationId))
    );
  });

  router.post("/organizations/:organizationId/reactivate", (request, response) => {
    response.json(
      core.reactivateOrganization(getActor(request), routeParam(request.params.organizationId))
    );
  });

  router.get("/organizations/:organizationId/memberships", (request, response) => {
    response.json(
      core.listMemberships(getActor(request), routeParam(request.params.organizationId))
    );
  });

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
