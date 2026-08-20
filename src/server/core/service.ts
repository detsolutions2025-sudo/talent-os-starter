import { authorize } from "./authorization";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { MemoryCoreRepository } from "./memory-repository";
import { normalizeEmail, normalizeSlug } from "./normalization";
import type { CoreRepository } from "./repository";
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

// Fase 15 (SPEC-018, RN-001/RN-002; Plano Tecnico Revisado, item 21): hook generico, opcional
// e neutro de persistencia -- `core/service.ts` nunca importa nada do modulo `blueprints/`.
// Recebe o `CoreRepository` transacional ja usado por `createOrganization` (o mesmo client
// fisico), permitindo que um chamador de wiring (ver
// `blueprints/organization-onboarding.ts`) crie o primeiro Blueprint Version `draft` da
// Organization na MESMA transacao: se o hook lancar, a excecao propaga para o
// `catch`/`ROLLBACK` ja existente de `CoreRepository.transaction()`, revertendo a criacao da
// Organization tambem.
export type OnOrganizationCreatedHook = (
  repository: CoreRepository,
  organization: Organization
) => Promise<void>;

export class CoreService {
  constructor(
    private readonly repository: CoreRepository,
    private readonly onOrganizationCreated?: OnOrganizationCreatedHook
  ) {}

  getRepository() {
    return this.repository;
  }

  async createUser(actor: Actor, input: CreateUserInput) {
    return this.withDeniedAudit(actor, null, "user.create_denied", async () => {
      await authorize(this.repository, { actor, permission: "platform.user.create" });

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

      if (await this.repository.findUserByEmail(email)) {
        throw conflict("user_email_duplicate", "Email already exists.");
      }

      const now = this.repository.now();
      const user: User = {
        id: this.repository.nextId("usr"),
        name: input.name.trim(),
        email,
        status: input.status ?? "active",
        createdAt: now,
        updatedAt: now
      };

      await this.repository.addUser(user);
      await this.audit(actor, null, "user.created", "allowed", null, { userId: user.id });

      return user;
    });
  }

  async listUsers(actor: Actor) {
    return this.withDeniedAudit(actor, null, "user.list_denied", async () => {
      await authorize(this.repository, { actor, permission: "platform.user.create" });
      return this.repository.listUsers();
    });
  }

  async getCurrentUser(actor: Actor) {
    if (actor.kind === "platform") {
      return { kind: "platform", userId: actor.userId };
    }

    const user = await this.repository.findUserById(actor.userId);

    if (!user) {
      throw notFound("user_not_found", "User not found.");
    }

    return user;
  }

  async createOrganization(actor: Actor, input: CreateOrganizationInput) {
    return this.repository.transaction(async (repository) => {
      const scopedService = new CoreService(repository, this.onOrganizationCreated);

      return scopedService.withDeniedAudit(actor, null, "organization.create_denied", async () => {
        await authorize(repository, { actor, permission: "platform.organization.create" });

        const name = input.name.trim();
        const slug = normalizeSlug(input.slug);
        const owner = await repository.findUserById(input.initialOwnerUserId);

        if (!name) {
          throw badRequest("organization_name_required", "Organization name is required.");
        }

        if (!slug) {
          throw badRequest("organization_slug_required", "Organization slug is required.");
        }

        if (await repository.findOrganizationBySlug(slug)) {
          throw conflict("organization_slug_duplicate", "Organization slug already exists.");
        }

        if (!owner) {
          throw badRequest("initial_owner_missing", "Initial owner user does not exist.");
        }

        if (owner.status !== "active") {
          throw badRequest("initial_owner_inactive", "Initial owner user must be active.");
        }

        const now = repository.now();
        const organization: Organization = {
          id: repository.nextId("org"),
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
          id: repository.nextId("mem"),
          organizationId: organization.id,
          userId: owner.id,
          role: "owner",
          status: "active",
          joinedAt: now,
          createdAt: now,
          updatedAt: now
        };

        await repository.addOrganization(organization);
        await repository.addMembership(membership);

        const ownerCount = await repository.countActiveOwners(organization.id);

        if (ownerCount !== 1) {
          throw conflict("initial_owner_count_invalid", "Organization must start with one owner.");
        }

        await scopedService.audit(actor, organization.id, "organization.created", "allowed", null, {
          organizationId: organization.id
        });
        await scopedService.audit(
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

        // SPEC-018 RN-001/RN-002: o primeiro Blueprint Version `draft` nasce na mesma
        // transacao fisica da Organization. Falha aqui reverte tambem a criacao da
        // Organization (mesmo catch/ROLLBACK do `repository.transaction()` acima).
        if (scopedService.onOrganizationCreated) {
          await scopedService.onOrganizationCreated(repository, organization);
        }

        return { organization, membership };
      });
    });
  }

  async listOrganizations(actor: Actor) {
    if (actor.kind === "platform") {
      return this.repository.listOrganizations();
    }

    const user = await this.ensureActiveUser(actor.userId);
    return this.repository.listOrganizationsForUser(user.id);
  }

  async getOrganization(actor: Actor, organizationId: string) {
    return this.withDeniedAudit(actor, organizationId, "organization.access_denied", async () => {
      await authorize(this.repository, { actor, organizationId, permission: "organization.read" });
      return this.findOrganization(organizationId);
    });
  }

  async updateOrganization(actor: Actor, organizationId: string, input: UpdateOrganizationInput) {
    return this.withDeniedAudit(actor, organizationId, "organization.update_denied", async () => {
      await authorize(this.repository, {
        actor,
        organizationId,
        permission: "organization.update_operational_fields"
      });

      const organization = await this.findOrganization(organizationId);
      const nextSlug = input.slug === undefined ? organization.slug : normalizeSlug(input.slug);

      if (input.name !== undefined && !input.name.trim()) {
        throw badRequest("organization_name_required", "Organization name is required.");
      }

      if (!nextSlug) {
        throw badRequest("organization_slug_required", "Organization slug is required.");
      }

      const existingSlugOwner = await this.repository.findOrganizationBySlug(nextSlug);

      if (existingSlugOwner && existingSlugOwner.id !== organization.id) {
        throw conflict("organization_slug_duplicate", "Organization slug already exists.");
      }

      const updated: Organization = {
        ...organization,
        name: input.name?.trim() ?? organization.name,
        slug: nextSlug,
        legalName: input.legalName === undefined ? organization.legalName : input.legalName,
        taxId: input.taxId === undefined ? organization.taxId : input.taxId,
        description: input.description === undefined ? organization.description : input.description,
        updatedAt: this.repository.now()
      };

      await this.repository.updateOrganization(updated);
      await this.audit(actor, updated.id, "organization.updated", "allowed", null, {
        organizationId
      });

      return updated;
    });
  }

  async archiveOrganization(actor: Actor, organizationId: string) {
    return this.repository.transaction(async (repository) => {
      const scopedService = new CoreService(repository);

      return scopedService.withDeniedAudit(
        actor,
        organizationId,
        "organization.archive_denied",
        async () => {
          await authorize(repository, { actor, permission: "platform.organization.archive" });
          const organization = await scopedService.findOrganization(organizationId);
          const now = repository.now();
          const archived: Organization = {
            ...organization,
            status: "archived",
            archivedAt: now,
            archivedByUserId: actor.userId,
            updatedAt: now
          };

          await repository.updateOrganization(archived);
          await scopedService.audit(actor, archived.id, "organization.archived", "allowed", null, {
            organizationId
          });

          return archived;
        }
      );
    });
  }

  async reactivateOrganization(actor: Actor, organizationId: string) {
    return this.repository.transaction(async (repository) => {
      const scopedService = new CoreService(repository);

      return scopedService.withDeniedAudit(
        actor,
        organizationId,
        "organization.reactivate_denied",
        async () => {
          await authorize(repository, { actor, permission: "platform.organization.reactivate" });
          const organization = await scopedService.findOrganization(organizationId);
          const now = repository.now();
          const reactivated: Organization = {
            ...organization,
            status: "active",
            reactivatedAt: now,
            reactivatedByUserId: actor.userId,
            updatedAt: now
          };

          await repository.updateOrganization(reactivated);
          await scopedService.audit(
            actor,
            reactivated.id,
            "organization.reactivated",
            "allowed",
            null,
            {
              organizationId
            }
          );

          return reactivated;
        }
      );
    });
  }

  async listMemberships(actor: Actor, organizationId: string) {
    return this.withDeniedAudit(actor, organizationId, "membership.read_denied", async () => {
      await authorize(this.repository, { actor, organizationId, permission: "membership.read" });
      return this.repository.listMembershipsWithUsersByOrganization(organizationId);
    });
  }

  async createMembership(actor: Actor, input: CreateMembershipInput) {
    return this.repository.transaction(async (repository) => {
      const scopedService = new CoreService(repository);

      return scopedService.withDeniedAudit(
        actor,
        input.organizationId,
        "membership.create_denied",
        async () => {
          const authorization = await authorize(repository, {
            actor,
            organizationId: input.organizationId,
            permission: input.role === "owner" ? "membership.manage_owner" : "membership.create"
          });
          const user = await repository.findUserById(input.userId);

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
            await repository.findMembershipByOrganizationAndUser(input.organizationId, input.userId)
          ) {
            throw conflict("membership_duplicate", "Membership already exists.");
          }

          const now = repository.now();
          const membership: Membership = {
            id: repository.nextId("mem"),
            organizationId: input.organizationId,
            userId: input.userId,
            role: input.role,
            status: "active",
            joinedAt: now,
            createdAt: now,
            updatedAt: now
          };

          await repository.addMembership(membership);
          await scopedService.audit(
            actor,
            input.organizationId,
            "membership.created",
            "allowed",
            null,
            {
              membershipId: membership.id,
              userId: input.userId
            }
          );

          return membership;
        }
      );
    });
  }

  async updateMembership(actor: Actor, membershipId: string, input: UpdateMembershipInput) {
    return this.repository.transaction(async (repository) => {
      const scopedService = new CoreService(repository);
      const membership = await repository.findMembershipById(membershipId);

      if (!membership) {
        throw notFound("membership_not_found", "Membership not found.");
      }

      return scopedService.withDeniedAudit(
        actor,
        membership.organizationId,
        "membership.update_denied",
        async () => {
          const targetRole = input.role ?? membership.role;
          const permission: Permission =
            membership.role === "owner" || targetRole === "owner"
              ? "membership.manage_owner"
              : "membership.update";
          const authorization = await authorize(repository, {
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

          await repository.lockMembershipsByOrganization(membership.organizationId);
          // Achado de concorrencia real (Fase 28, gate de concorrencia): a partir daqui, uma
          // releitura FRESCA (ja sob o lock org-wide acima) e obrigatoria. `membership` (lido no
          // topo do metodo, ANTES do lock) pode estar desatualizado se OUTRA chamada concorrente
          // e independente de `updateMembership` -- por exemplo, uma mudanca de `role` correndo
          // ao mesmo tempo que esta mudanca de `status` -- ja tiver commitado nesse intervalo.
          // Sem esta releitura, o merge abaixo (`{...membership, role: input.role ?? ...}`)
          // sobrescrevia com o valor ANTIGO de `role`/`status` (o campo que ESTA chamada nao
          // pretendia tocar), REVERTENDO silenciosamente a mutacao concorrente -- um lost
          // update classico. Bug pre-existente da Fase 1 (`CoreService`), nunca exercitado por
          // nenhum dominio ate `AccessGrant.revoke` (SPEC-027) tornar-se, pela primeira vez, um
          // segundo chamador concorrente e independente deste metodo sobre a mesma linha.
          const current = (await repository.findMembershipById(membershipId)) ?? membership;
          const wouldChangeLastOwner =
            current.role === "owner" &&
            current.status === "active" &&
            (input.status === "inactive" || (input.role !== undefined && input.role !== "owner"));

          if (
            wouldChangeLastOwner &&
            (await repository.countActiveOwners(membership.organizationId)) === 1
          ) {
            await scopedService.audit(
              actor,
              membership.organizationId,
              "membership.last_owner_change_denied",
              "denied",
              "last_owner",
              { membershipId }
            );
            throw conflict("last_owner_required", "Last active owner cannot be changed.");
          }

          const updated: Membership = {
            ...current,
            role: input.role ?? current.role,
            status: input.status ?? current.status,
            updatedAt: repository.now()
          };

          await repository.updateMembership(updated);
          await scopedService.audit(
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
            await scopedService.audit(
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
            await scopedService.audit(
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

          return updated;
        }
      );
    });
  }

  async auditEvents() {
    return this.repository.listAuditEvents();
  }

  private async ensureActiveUser(userId: string) {
    const user = await this.repository.findUserById(userId);

    if (!user || user.status !== "active") {
      throw forbidden("user_inactive_or_missing", "Active user is required.");
    }

    return user;
  }

  private async findOrganization(organizationId: string) {
    const organization = await this.repository.findOrganizationById(organizationId);

    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }

    return organization;
  }

  private async audit(
    actor: Actor,
    organizationId: string | null,
    action: string,
    result: AuditEvent["result"],
    reason: string | null,
    metadata: AuditEvent["metadata"] = {}
  ) {
    await this.repository.addAuditEvent({
      id: this.repository.nextId("aud"),
      organizationId,
      actorUserId: actor.userId,
      action,
      result,
      reason,
      metadata,
      createdAt: this.repository.now()
    });
  }

  private async withDeniedAudit<T>(
    actor: Actor,
    organizationId: string | null,
    deniedAction: string,
    callback: () => Promise<T>
  ) {
    try {
      return await callback();
    } catch (error) {
      await this.audit(
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

export function createCoreService(
  repository: CoreRepository,
  onOrganizationCreated?: OnOrganizationCreatedHook
) {
  return new CoreService(repository, onOrganizationCreated);
}

export function createMemoryCoreService() {
  return new CoreService(new MemoryCoreRepository());
}
