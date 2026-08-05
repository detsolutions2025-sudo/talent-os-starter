import { forbidden, notFound } from "./errors";
import type { Actor, Membership, MembershipRole, Permission } from "./types";
import type { CoreStore } from "./store";

export type AuthorizationContext = {
  actor: Actor;
  organizationId?: string;
  permission: Permission;
};

export type AuthorizedMembership = {
  membership: Membership | null;
  role: MembershipRole | "platform";
};

const platformPermissions = new Set<Permission>([
  "platform.organization.create",
  "platform.organization.read",
  "platform.organization.archive",
  "platform.organization.reactivate",
  "platform.user.create",
  "platform.user.deactivate",
  "organization.read",
  "organization.update_operational_fields",
  "membership.read",
  "membership.create",
  "membership.update",
  "membership.manage_owner"
]);

export function authorize(store: CoreStore, context: AuthorizationContext): AuthorizedMembership {
  if (context.actor.kind === "platform") {
    if (!platformPermissions.has(context.permission)) {
      throw forbidden("permission_denied", "Permission denied.");
    }

    return { membership: null, role: "platform" };
  }

  const user = store.users().find((candidate) => candidate.id === context.actor.userId);

  if (!user || user.status !== "active") {
    throw forbidden("user_inactive_or_missing", "Active user is required.");
  }

  if (!context.organizationId) {
    throw forbidden("organization_context_required", "Organization context is required.");
  }

  const organization = store
    .organizations()
    .find((candidate) => candidate.id === context.organizationId);

  if (!organization) {
    throw notFound("organization_not_found", "Organization not found.");
  }

  if (organization.status !== "active") {
    throw forbidden("organization_archived", "Archived organization cannot be used as context.");
  }

  const membership = store
    .memberships()
    .find(
      (candidate) => candidate.organizationId === organization.id && candidate.userId === user.id
    );

  if (!membership || membership.status !== "active") {
    throw forbidden("membership_required", "Active membership is required.");
  }

  if (!isRoleAllowed(membership.role, context.permission)) {
    throw forbidden("permission_denied", "Permission denied.");
  }

  return { membership, role: membership.role };
}

function isRoleAllowed(role: MembershipRole, permission: Permission) {
  if (permission === "organization.read") {
    return true;
  }

  if (permission === "organization.update_operational_fields") {
    return role === "owner" || role === "admin";
  }

  if (permission === "membership.read") {
    return role === "owner" || role === "admin";
  }

  if (permission === "membership.create" || permission === "membership.update") {
    return role === "owner" || role === "admin";
  }

  if (permission === "membership.manage_owner") {
    return role === "owner";
  }

  return false;
}
