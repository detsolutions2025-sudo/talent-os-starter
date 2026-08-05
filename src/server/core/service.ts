import { authorize } from "./authorization";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { normalizeEmail, normalizeSlug } from "./normalization";
import { CoreStore } from "./store";
import type {
  Actor,
  AuditEvent,
  Membership,
  MembershipRole,
  MembershipStatus,
  Organization,
  Permission,
  User,
  UserStatus
} from "./types";

type CreateUserInput = {
  name: string;
  email: string;
  status?: UserStatus;
};

type CreateOrganizationInput = {
  name: string;
  slug: string;
  initialOwnerUserId: string;
  legalName?: string | null;
  taxId?: string | null;
  description?: string | null;
};

type UpdateOrganizationInput = Partial<
  Pick<Organization, "name" | "slug" | "legalName" | "taxId" | "description">
>;

type CreateMembershipInput = {
  organizationId: string;
  userId: string;
  role: MembershipRole;
};

type UpdateMembershipInput = {
  role?: MembershipRole;
  status?: MembershipStatus;
};

export class CoreService {
  constructor(private readonly store = new CoreStore()) {}

  getStore() {
    return this.store;
  }

  async createUser(actor: Actor, input: CreateUserInput) {
    return this.withDeniedAudit(actor, null, "user.create_denied", () => {
      authorize(this.store, { actor, permission: "platform.user.create" });

      const email = normalizeEmail(input.email);

      if (!input.name.trim()) {
        throw badRequest("user_name_required", "User name is required.");
      }

      if (!email || !email.includes("@")) {
        throw badRequest("user_email_invalid", "A valid email is required.");
      }

      if (input.status && !["active", "inactive"].includes(input.status)) {
        throw badRequest("user_status_invalid", "User status is invalid.");
      }

      if (this.store.users().some((user) => user.email === email)) {
        throw conflict("user_email_duplicate", "Email already exists.");
      }

      const now = this.store.now();
      const user: User = {
        id: this.store.nextId("usr"),
        name: input.name.trim(),
        email,
        status: input.status ?? "active",
        createdAt: now,
        updatedAt: now
      };

      this.store.addUser(user);
      this.audit(actor, null, "user.created", "allowed", null, { userId: user.id });

      return user;
    });
  }

  listUsers(actor: Actor) {
    return this.withDeniedAudit(actor, null, "user.list_denied", () => {
      authorize(this.store, { actor, permission: "platform.user.create" });
      return this.store.users();
    });
  }

  getCurrentUser(actor: Actor) {
    if (actor.kind === "platform") {
      return { kind: "platform", userId: actor.userId };
    }

    const user = this.store.users().find((candidate) => candidate.id === actor.userId);

    if (!user) {
      throw notFound("user_not_found", "User not found.");
    }

    return user;
  }

  async createOrganization(actor: Actor, input: CreateOrganizationInput) {
    return this.store.transaction(async (store) => {
      const scopedService = new CoreService(store);

      return scopedService.withDeniedAudit(actor, null, "organization.create_denied", () => {
        authorize(store, { actor, permission: "platform.organization.create" });

        const name = input.name.trim();
        const slug = normalizeSlug(input.slug);
        const owner = store.users().find((user) => user.id === input.initialOwnerUserId);

        if (!name) {
          throw badRequest("organization_name_required", "Organization name is required.");
        }

        if (!slug) {
          throw badRequest("organization_slug_required", "Organization slug is required.");
        }

        if (store.organizations().some((organization) => organization.slug === slug)) {
          throw conflict("organization_slug_duplicate", "Organization slug already exists.");
        }

        if (!owner) {
          throw badRequest("initial_owner_missing", "Initial owner user does not exist.");
        }

        if (owner.status !== "active") {
          throw badRequest("initial_owner_inactive", "Initial owner user must be active.");
        }

        const now = store.now();
        const organization: Organization = {
          id: store.nextId("org"),
          name,
          slug,
          status: "active",
          legalName: input.legalName ?? null,
          taxId: input.taxId ?? null,
          description: input.description ?? null,
          archivedAt: null,
          archivedByUserId: null,
          reactivatedAt: null,
          reactivatedByUserId: null,
          createdAt: now,
          updatedAt: now
        };
        const membership: Membership = {
          id: store.nextId("mem"),
          organizationId: organization.id,
          userId: owner.id,
          role: "owner",
          status: "active",
          joinedAt: now,
          createdAt: now,
          updatedAt: now
        };

        store.addOrganization(organization);
        store.addMembership(membership);

        const ownerCount = store
          .memberships()
          .filter(
            (candidate) =>
              candidate.organizationId === organization.id &&
              candidate.role === "owner" &&
              candidate.status === "active"
          ).length;

        if (ownerCount !== 1) {
          throw conflict("initial_owner_count_invalid", "Organization must start with one owner.");
        }

        scopedService.audit(actor, organization.id, "organization.created", "allowed", null, {
          organizationId: organization.id
        });
        scopedService.audit(
          actor,
          organization.id,
          "membership.created_initial_owner",
          "allowed",
          null,
          {
            membershipId: membership.id,
            userId: owner.id
          }
        );

        return { organization, membership };
      });
    });
  }

  listOrganizations(actor: Actor) {
    if (actor.kind === "platform") {
      return this.store.organizations();
    }

    const user = this.ensureActiveUser(actor.userId);
    const organizations = this.store
      .memberships()
      .filter((membership) => membership.userId === user.id && membership.status === "active")
      .map((membership) =>
        this.store
          .organizations()
          .find((organization) => organization.id === membership.organizationId)
      )
      .filter((organization): organization is Organization => organization !== undefined);

    return organizations.filter((organization) => organization.status === "active");
  }

  getOrganization(actor: Actor, organizationId: string) {
    return this.withDeniedAudit(actor, organizationId, "organization.access_denied", () => {
      authorize(this.store, { actor, organizationId, permission: "organization.read" });
      return this.findOrganization(organizationId);
    });
  }

  updateOrganization(actor: Actor, organizationId: string, input: UpdateOrganizationInput) {
    return this.withDeniedAudit(actor, organizationId, "organization.update_denied", () => {
      authorize(this.store, {
        actor,
        organizationId,
        permission: "organization.update_operational_fields"
      });

      const organization = this.findOrganization(organizationId);
      const nextSlug = input.slug === undefined ? organization.slug : normalizeSlug(input.slug);

      if (input.name !== undefined && !input.name.trim()) {
        throw badRequest("organization_name_required", "Organization name is required.");
      }

      if (!nextSlug) {
        throw badRequest("organization_slug_required", "Organization slug is required.");
      }

      if (
        nextSlug !== organization.slug &&
        this.store.organizations().some((candidate) => candidate.slug === nextSlug)
      ) {
        throw conflict("organization_slug_duplicate", "Organization slug already exists.");
      }

      organization.name = input.name?.trim() ?? organization.name;
      organization.slug = nextSlug;
      organization.legalName =
        input.legalName === undefined ? organization.legalName : input.legalName;
      organization.taxId = input.taxId === undefined ? organization.taxId : input.taxId;
      organization.description =
        input.description === undefined ? organization.description : input.description;
      organization.updatedAt = this.store.now();

      this.audit(actor, organization.id, "organization.updated", "allowed", null, {
        organizationId
      });

      return organization;
    });
  }

  archiveOrganization(actor: Actor, organizationId: string) {
    return this.withDeniedAudit(actor, organizationId, "organization.archive_denied", () => {
      authorize(this.store, { actor, permission: "platform.organization.archive" });
      const organization = this.findOrganization(organizationId);
      const now = this.store.now();

      organization.status = "archived";
      organization.archivedAt = now;
      organization.archivedByUserId = actor.userId;
      organization.updatedAt = now;

      this.audit(actor, organization.id, "organization.archived", "allowed", null, {
        organizationId
      });

      return organization;
    });
  }

  reactivateOrganization(actor: Actor, organizationId: string) {
    return this.withDeniedAudit(actor, organizationId, "organization.reactivate_denied", () => {
      authorize(this.store, { actor, permission: "platform.organization.reactivate" });
      const organization = this.findOrganization(organizationId);
      const now = this.store.now();

      organization.status = "active";
      organization.reactivatedAt = now;
      organization.reactivatedByUserId = actor.userId;
      organization.updatedAt = now;

      this.audit(actor, organization.id, "organization.reactivated", "allowed", null, {
        organizationId
      });

      return organization;
    });
  }

  listMemberships(actor: Actor, organizationId: string) {
    return this.withDeniedAudit(actor, organizationId, "membership.read_denied", () => {
      authorize(this.store, { actor, organizationId, permission: "membership.read" });
      return this.store
        .memberships()
        .filter((membership) => membership.organizationId === organizationId)
        .map((membership) => ({
          ...membership,
          user: this.store.users().find((user) => user.id === membership.userId) ?? null
        }));
    });
  }

  createMembership(actor: Actor, input: CreateMembershipInput) {
    return this.store.transaction(async (store) => {
      const scopedService = new CoreService(store);

      return scopedService.withDeniedAudit(
        actor,
        input.organizationId,
        "membership.create_denied",
        () => {
          const authorization = authorize(store, {
            actor,
            organizationId: input.organizationId,
            permission: input.role === "owner" ? "membership.manage_owner" : "membership.create"
          });
          const user = store.users().find((candidate) => candidate.id === input.userId);

          if (!user) {
            throw badRequest("membership_user_missing", "User does not exist.");
          }

          if (user.status !== "active") {
            throw badRequest("membership_user_inactive", "User must be active.");
          }

          if (!["owner", "admin", "member"].includes(input.role)) {
            throw badRequest("membership_role_invalid", "Membership role is invalid.");
          }

          if (authorization.role === "admin" && input.role !== "member") {
            throw forbidden("permission_denied", "Admin can only add members.");
          }

          if (
            store
              .memberships()
              .some(
                (membership) =>
                  membership.organizationId === input.organizationId &&
                  membership.userId === input.userId
              )
          ) {
            throw conflict("membership_duplicate", "Membership already exists.");
          }

          const now = store.now();
          const membership: Membership = {
            id: store.nextId("mem"),
            organizationId: input.organizationId,
            userId: input.userId,
            role: input.role,
            status: "active",
            joinedAt: now,
            createdAt: now,
            updatedAt: now
          };

          store.addMembership(membership);
          scopedService.audit(actor, input.organizationId, "membership.created", "allowed", null, {
            membershipId: membership.id,
            userId: input.userId
          });

          return membership;
        }
      );
    });
  }

  updateMembership(actor: Actor, membershipId: string, input: UpdateMembershipInput) {
    return this.store.transaction(async (store) => {
      const scopedService = new CoreService(store);
      const membership = store.memberships().find((candidate) => candidate.id === membershipId);

      if (!membership) {
        throw notFound("membership_not_found", "Membership not found.");
      }

      return scopedService.withDeniedAudit(
        actor,
        membership.organizationId,
        "membership.update_denied",
        () => {
          const targetRole = input.role ?? membership.role;
          const permission: Permission =
            membership.role === "owner" || targetRole === "owner"
              ? "membership.manage_owner"
              : "membership.update";
          const authorization = authorize(store, {
            actor,
            organizationId: membership.organizationId,
            permission
          });

          if (input.role && !["owner", "admin", "member"].includes(input.role)) {
            throw badRequest("membership_role_invalid", "Membership role is invalid.");
          }

          if (input.status && !["active", "inactive"].includes(input.status)) {
            throw badRequest("membership_status_invalid", "Membership status is invalid.");
          }

          if (authorization.role === "admin" && membership.role !== "member") {
            throw forbidden("permission_denied", "Admin can only manage members.");
          }

          if (authorization.role === "admin" && input.role && input.role !== "member") {
            throw forbidden("permission_denied", "Admin can only keep members as members.");
          }

          const wouldChangeLastOwner =
            membership.role === "owner" &&
            membership.status === "active" &&
            (input.status === "inactive" || (input.role !== undefined && input.role !== "owner"));

          if (
            wouldChangeLastOwner &&
            this.countActiveOwners(store, membership.organizationId) === 1
          ) {
            scopedService.audit(
              actor,
              membership.organizationId,
              "membership.last_owner_change_denied",
              "denied",
              "last_owner",
              { membershipId }
            );
            throw conflict("last_owner_required", "Last active owner cannot be changed.");
          }

          membership.role = input.role ?? membership.role;
          membership.status = input.status ?? membership.status;
          membership.updatedAt = store.now();

          scopedService.audit(
            actor,
            membership.organizationId,
            "membership.role_changed",
            "allowed",
            null,
            {
              membershipId
            }
          );

          if (input.status === "active") {
            scopedService.audit(
              actor,
              membership.organizationId,
              "membership.activated",
              "allowed",
              null,
              {
                membershipId
              }
            );
          }

          if (input.status === "inactive") {
            scopedService.audit(
              actor,
              membership.organizationId,
              "membership.deactivated",
              "allowed",
              null,
              {
                membershipId
              }
            );
          }

          return membership;
        }
      );
    });
  }

  auditEvents() {
    return this.store.auditEvents();
  }

  private ensureActiveUser(userId: string) {
    const user = this.store.users().find((candidate) => candidate.id === userId);

    if (!user || user.status !== "active") {
      throw forbidden("user_inactive_or_missing", "Active user is required.");
    }

    return user;
  }

  private findOrganization(organizationId: string) {
    const organization = this.store
      .organizations()
      .find((candidate) => candidate.id === organizationId);

    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }

    return organization;
  }

  private countActiveOwners(store: CoreStore, organizationId: string) {
    return store
      .memberships()
      .filter(
        (membership) =>
          membership.organizationId === organizationId &&
          membership.role === "owner" &&
          membership.status === "active"
      ).length;
  }

  private audit(
    actor: Actor,
    organizationId: string | null,
    action: string,
    result: AuditEvent["result"],
    reason: string | null,
    metadata: AuditEvent["metadata"] = {}
  ) {
    this.store.addAuditEvent({
      id: this.store.nextId("aud"),
      organizationId,
      actorUserId: actor.userId,
      action,
      result,
      reason,
      metadata,
      createdAt: this.store.now()
    });
  }

  private withDeniedAudit<T>(
    actor: Actor,
    organizationId: string | null,
    deniedAction: string,
    callback: () => T
  ) {
    try {
      return callback();
    } catch (error) {
      this.audit(
        actor,
        organizationId,
        deniedAction,
        "denied",
        error instanceof Error ? error.message : null
      );
      throw error;
    }
  }
}

export function createCoreService() {
  return new CoreService();
}
