import { forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, MembershipRole } from "../core/types";

export type AIAuthorizedContext = {
  role: MembershipRole;
  userId: string;
};

// Mirrors InterviewService's private authorizeUser(): Platform Admin actors are never
// authorized for organization-scoped operations (ADR-0016/0017/0018/0019 -- "Platform Admin
// nao atua funcionalmente dentro da Organization"), and every check (active user, active
// Organization, active membership, allowed role) is re-validated on every call, never cached.
export async function authorizeOrganizationActor(
  core: CoreRepository,
  actor: Actor,
  organizationId: string,
  allowedRoles: MembershipRole[]
): Promise<AIAuthorizedContext> {
  if (actor.kind === "platform") {
    throw forbidden("ai_permission_denied", "Permission denied.");
  }

  const user = await core.findUserById(actor.userId);
  if (!user || user.status !== "active") {
    throw forbidden("ai_user_inactive_or_missing", "Active user is required.");
  }

  const organization = await core.findOrganizationById(organizationId);
  if (!organization) {
    throw notFound("ai_organization_not_found", "Organization not found.");
  }
  if (organization.status !== "active") {
    throw forbidden("ai_organization_archived", "Archived organization cannot be used as context.");
  }

  const membership = await core.findMembershipByOrganizationAndUser(organizationId, actor.userId);
  if (!membership || membership.status !== "active") {
    throw forbidden("ai_membership_required", "Active membership is required.");
  }

  if (!allowedRoles.includes(membership.role)) {
    throw forbidden("ai_permission_denied", "Permission denied.");
  }

  return { role: membership.role, userId: actor.userId };
}

// Platform Admin-only operations (global catalogs, platform-level availability). Never
// accepts a "user" actor, however privileged its Membership role -- Platform Admin is not a
// Membership role (ADR-0003, ADR-0013, ADR-0014).
export function requirePlatformActor(actor: Actor) {
  if (actor.kind !== "platform") {
    throw forbidden("ai_platform_actor_required", "This operation requires Platform Admin.");
  }
}

export function requireUserActorId(actor: Actor): string {
  if (actor.kind !== "user") {
    throw forbidden("ai_user_actor_required", "A user actor is required.");
  }
  return actor.userId;
}

export function actorUserIdOrNull(actor: Actor): string | null {
  return actor.kind === "user" ? actor.userId : null;
}
