import type { Request } from "express";
import { forbidden } from "../core/errors";
import type { Actor } from "../core/types";

export function getActor(request: Request): Actor {
  const appEnv = process.env.APP_ENV ?? "development";

  if (appEnv !== "development" && appEnv !== "test") {
    throw forbidden("temporary_auth_disabled", "Temporary development auth is disabled.");
  }

  const isPlatformAdmin = request.header("x-dev-platform-admin") === "true";
  const userId = request.header("x-dev-user-id")?.trim();

  if (isPlatformAdmin) {
    return {
      kind: "platform",
      userId: userId || null
    };
  }

  if (!userId) {
    throw forbidden("temporary_user_required", "Temporary development user is required.");
  }

  return {
    kind: "user",
    userId
  };
}
