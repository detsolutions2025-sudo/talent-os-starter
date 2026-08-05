import type pg from "pg";
import { badRequest, conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, MembershipRole } from "../core/types";
import { PostgresCompetencyRepository } from "../persistence/postgres-competency-repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import type { CompetencyRepository } from "./repository";
import type {
  AdoptGlobalInput,
  CompetencyAdminReadInput,
  CompetencyCatalogItem,
  CompetencyContentInput,
  CompetencyDetails,
  GlobalCompetency,
  GlobalCompetencyStatus,
  OrganizationAdoptedCompetency,
  OrganizationCompetency
} from "./types";
import {
  requireAdminReason,
  validateActiveContent,
  validateContentPatch,
  validateCreateContent,
  validateGlobalStatus,
  validateOrganizationStatus
} from "./validation";

type CompetencyTransaction = {
  core: CoreRepository;
  competencies: CompetencyRepository;
};

type CompetencyTransactionRunner = <T>(
  callback: (transaction: CompetencyTransaction) => Promise<T>
) => Promise<T>;

export class CompetencyService {
  constructor(
    private readonly core: CoreRepository,
    private readonly competencies: CompetencyRepository,
    private readonly runTransaction: CompetencyTransactionRunner
  ) {}

  async createGlobal(actor: Actor, input: CompetencyContentInput) {
    return this.runTransaction(async ({ core, competencies }) => {
      const service = this.scoped(core, competencies);
      await service.authorizePlatform(actor, "competency.global_edit_denied");
      const status = input.status === undefined ? "inactive" : validateGlobalStatus(input.status);
      const content = validateCreateContent({ ...input, status });

      if (status === "active") {
        validateActiveContent(content);
      }

      await service.ensureGlobalCodeAvailable(content.normalizedCode, null);
      const now = competencies.now();
      const global: GlobalCompetency = {
        ...content,
        id: competencies.nextId("gcmp"),
        status,
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId,
        createdAt: now,
        updatedAt: now
      };

      await competencies.createGlobalCompetency(global);
      await service.audit(actor, null, "global_competency.created", {
        globalCompetencyId: global.id
      });

      return global;
    });
  }

  async listGlobals(actor: Actor) {
    if (actor.kind === "platform") {
      return this.competencies.listGlobalCompetencies();
    }

    await this.auditDenied(actor, null, "competency.permission_denied", "permission_denied");
    throw forbidden("permission_denied", "Permission denied.");
  }

  async getGlobal(actor: Actor, globalCompetencyId: string) {
    await this.authorizePlatform(actor);
    return this.findGlobal(globalCompetencyId);
  }

  async updateGlobal(actor: Actor, globalCompetencyId: string, input: CompetencyContentInput) {
    return this.runTransaction(async ({ core, competencies }) => {
      const service = this.scoped(core, competencies);
      await service.authorizePlatform(actor, "competency.global_edit_denied");
      const global = await service.findGlobal(globalCompetencyId);
      const patch = validateContentPatch(input);

      if (patch.normalizedCode && patch.normalizedCode !== global.normalizedCode) {
        await service.ensureGlobalCodeAvailable(patch.normalizedCode, global.id);
      }

      const updated: GlobalCompetency = {
        ...global,
        ...definedPatch(patch),
        updatedByUserId: actor.userId,
        updatedAt: competencies.now()
      };

      if (updated.status === "active") {
        validateActiveContent(updated);
      }

      await competencies.updateGlobalCompetency(updated);
      await service.audit(actor, null, "global_competency.updated", {
        globalCompetencyId,
        fields: changedFields(global, updated).join(",")
      });

      if (global.code !== updated.code) {
        await service.audit(actor, null, "global_competency.code_changed", { globalCompetencyId });
      }

      return updated;
    });
  }

  async setGlobalStatus(actor: Actor, globalCompetencyId: string, status: GlobalCompetencyStatus) {
    return this.runTransaction(async ({ core, competencies }) => {
      const service = this.scoped(core, competencies);
      await service.authorizePlatform(actor, "competency.global_edit_denied");
      await competencies.lockGlobalCompetency(globalCompetencyId);
      const global = await service.findGlobal(globalCompetencyId);

      if (status === "active") {
        validateActiveContent(global);
      }

      const updated = {
        ...global,
        status,
        updatedByUserId: actor.userId,
        updatedAt: competencies.now()
      };
      await competencies.updateGlobalCompetency(updated);

      if (status === "active" || status === "inactive") {
        await service.syncCatalogItemsForGlobal(actor, globalCompetencyId, status);
      }

      await service.audit(actor, null, globalStatusAction(status), { globalCompetencyId });
      return updated;
    });
  }

  async createOrganizationCompetency(
    actor: Actor,
    organizationId: string,
    input: CompetencyContentInput
  ) {
    return this.runTransaction(async ({ core, competencies }) => {
      const service = this.scoped(core, competencies);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await service.ensureNoOrganizationChange(organizationId, input.organizationId);
      await competencies.lockOrganizationCompetencies(organizationId);
      const status =
        input.status === undefined ? "active" : validateOrganizationStatus(input.status);
      const content = validateCreateContent({ ...input, status });
      await service.ensureOrganizationCodeAvailable(organizationId, content.normalizedCode, null);

      const now = competencies.now();
      const userId = requireUserActorId(actor);
      const competency: OrganizationCompetency = {
        ...content,
        id: competencies.nextId("ocmp"),
        organizationId,
        status,
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now
      };

      await competencies.createOrganizationCompetency(competency);
      await service.audit(actor, organizationId, "organization_competency.created", {
        organizationCompetencyId: competency.id
      });

      if (competency.status === "active") {
        await service.ensureOrganizationCatalogItem(actor, organizationId, competency.id, "active");
      }

      return competency;
    });
  }

  async listOrganizationCompetencies(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.competencies.listOrganizationCompetencies(organizationId);
  }

  async updateOrganizationCompetency(
    actor: Actor,
    organizationId: string,
    competencyId: string,
    input: CompetencyContentInput
  ) {
    return this.runTransaction(async ({ core, competencies }) => {
      const service = this.scoped(core, competencies);
      const context = await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await service.ensureNoOrganizationChange(organizationId, input.organizationId);
      const competency = await service.findOrganizationCompetencyInOrganization(
        actor,
        organizationId,
        competencyId
      );
      const patch = validateContentPatch(input);

      if (patch.normalizedCode && patch.normalizedCode !== competency.normalizedCode) {
        if (context.role !== "owner") {
          await service.auditDenied(
            actor,
            organizationId,
            "organization_competency.code_change_denied",
            "permission_denied",
            { organizationCompetencyId: competencyId }
          );
          throw forbidden("permission_denied", "Permission denied.");
        }
        await service.ensureOrganizationCodeAvailable(
          organizationId,
          patch.normalizedCode,
          competency.id
        );
      }

      const updated: OrganizationCompetency = {
        ...competency,
        ...definedPatch(patch),
        updatedByUserId: requireUserActorId(actor),
        updatedAt: competencies.now()
      };

      if (updated.status === "active") {
        validateActiveContent(updated);
      }

      await competencies.updateOrganizationCompetency(updated);
      await service.audit(actor, organizationId, "organization_competency.updated", {
        organizationCompetencyId: competencyId,
        fields: changedFields(competency, updated).join(",")
      });

      if (competency.code !== updated.code) {
        await service.audit(actor, organizationId, "organization_competency.code_changed", {
          organizationCompetencyId: competencyId
        });
      }

      return updated;
    });
  }

  async setOrganizationCompetencyStatus(
    actor: Actor,
    organizationId: string,
    competencyId: string,
    status: OrganizationCompetency["status"]
  ) {
    return this.runTransaction(async ({ core, competencies }) => {
      const service = this.scoped(core, competencies);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await competencies.lockOrganizationCompetencies(organizationId);
      const competency = await service.findOrganizationCompetencyInOrganization(
        actor,
        organizationId,
        competencyId
      );

      if (status === "active") {
        validateActiveContent(competency);
      }

      const updated = {
        ...competency,
        status,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: competencies.now()
      };
      await competencies.updateOrganizationCompetency(updated);
      await service.ensureOrganizationCatalogItem(actor, organizationId, competency.id, status);
      await service.audit(
        actor,
        organizationId,
        status === "active"
          ? "organization_competency.activated"
          : "organization_competency.inactivated",
        { organizationCompetencyId: competencyId }
      );
      return updated;
    });
  }

  async listUnifiedCatalog(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    return this.competencies.listUnifiedCatalog(organizationId);
  }

  async getCatalogItem(actor: Actor, organizationId: string, itemId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const item = await this.competencies.findCatalogItemById(itemId);

    if (!item || item.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "competency_catalog_item.cross_organization_access_denied",
        "catalog_item_organization_mismatch",
        { competencyCatalogItemId: itemId }
      );
      throw notFound("competency_catalog_item_not_found", "Competency catalog item not found.");
    }

    if (item.status !== "active") {
      throw notFound("competency_catalog_item_not_found", "Competency catalog item not found.");
    }

    return this.toCatalogDetails(item);
  }

  async listAvailableGlobals(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.competencies.listAvailableGlobalsForOrganization(organizationId);
  }

  async adoptGlobal(actor: Actor, organizationId: string, input: AdoptGlobalInput) {
    return this.runTransaction(async ({ core, competencies }) => {
      const service = this.scoped(core, competencies);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await competencies.lockOrganizationCompetencies(organizationId);
      await competencies.lockGlobalCompetency(String(input.globalCompetencyId ?? ""));
      const global = await service.findGlobal(String(input.globalCompetencyId ?? ""));

      if (global.status !== "active") {
        throw conflict("global_competency_not_adoptable", "Global competency cannot be adopted.");
      }

      if (await competencies.findAdoptionByOrganizationAndGlobal(organizationId, global.id)) {
        throw conflict("adopted_competency_duplicate", "Global competency already adopted.");
      }

      const now = competencies.now();
      const userId = requireUserActorId(actor);
      const adoption: OrganizationAdoptedCompetency = {
        id: competencies.nextId("adcmp"),
        organizationId,
        globalCompetencyId: global.id,
        status: "active",
        adoptedByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now
      };

      await competencies.createAdoption(adoption);
      const item = await service.ensureGlobalCatalogItem(
        actor,
        organizationId,
        global.id,
        "active"
      );
      await service.audit(actor, organizationId, "adopted_competency.created", {
        adoptionId: adoption.id,
        globalCompetencyId: global.id,
        competencyCatalogItemId: item.id
      });

      return { adoption, catalogItem: item };
    });
  }

  async setAdoptionStatus(
    actor: Actor,
    organizationId: string,
    adoptionId: string,
    status: OrganizationAdoptedCompetency["status"]
  ) {
    return this.runTransaction(async ({ core, competencies }) => {
      const service = this.scoped(core, competencies);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await competencies.lockOrganizationCompetencies(organizationId);
      const adoption = await service.findAdoptionInOrganization(actor, organizationId, adoptionId);
      const global = await service.findGlobal(adoption.globalCompetencyId);

      if (status === "active" && global.status !== "active") {
        throw conflict(
          "adopted_competency_cannot_reactivate",
          "Adoption cannot be reactivated for this global competency status."
        );
      }

      const updated = {
        ...adoption,
        status,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: competencies.now()
      };

      await competencies.updateAdoption(updated);
      const item = await service.ensureGlobalCatalogItem(actor, organizationId, global.id, status);
      await service.audit(
        actor,
        organizationId,
        status === "active" ? "adopted_competency.activated" : "adopted_competency.inactivated",
        { adoptionId, competencyCatalogItemId: item.id }
      );

      return updated;
    });
  }

  async listHistory(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return (await this.core.listAuditEvents()).filter(
      (event) => event.organizationId === organizationId && event.action.includes("competenc")
    );
  }

  async globalHistory(actor: Actor) {
    await this.authorizePlatform(actor);
    return (await this.core.listAuditEvents()).filter((event) =>
      event.action.startsWith("global_competency.")
    );
  }

  async adminRead(actor: Actor, organizationId: string, input: CompetencyAdminReadInput) {
    const reason = requireAdminReason(input.reason);

    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }

    const organization = await this.core.findOrganizationById(organizationId);

    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }

    const [own, adoptions, catalog] = await Promise.all([
      this.competencies.listOrganizationCompetencies(organizationId),
      this.competencies.listAdoptions(organizationId),
      this.competencies.listUnifiedCatalog(organizationId)
    ]);

    await this.audit(actor, organizationId, "competency.administrative_read", {
      reason,
      organizationCompetencyCount: String(own.length),
      adoptionCount: String(adoptions.length),
      catalogItemCount: String(catalog.length)
    });

    return { organizationCompetencies: own, adoptions, catalog };
  }

  private scoped(core: CoreRepository, competencies: CompetencyRepository) {
    return new CompetencyService(core, competencies, this.runTransaction);
  }

  private async authorizePlatform(actor: Actor, deniedAction = "competency.permission_denied") {
    if (actor.kind !== "platform") {
      await this.auditDenied(actor, null, deniedAction, "permission_denied");
      throw forbidden("permission_denied", "Permission denied.");
    }
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[]
  ) {
    if (actor.kind === "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }

    const user = await this.core.findUserById(actor.userId);

    if (!user || user.status !== "active") {
      throw forbidden("user_inactive_or_missing", "Active user is required.");
    }

    const organization = await this.core.findOrganizationById(organizationId);

    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }

    if (organization.status !== "active") {
      await this.auditDenied(
        actor,
        organizationId,
        "competency.archived_organization_denied",
        "organization_archived"
      );
      throw forbidden("organization_archived", "Archived organization cannot be used as context.");
    }

    const membership = await this.core.findMembershipByOrganizationAndUser(
      organization.id,
      user.id
    );

    if (!membership || membership.status !== "active") {
      await this.auditDenied(
        actor,
        organizationId,
        "competency.cross_organization_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }

    if (!allowedRoles.includes(membership.role)) {
      await this.auditDenied(
        actor,
        organizationId,
        "competency.permission_denied",
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }

    return { actor, organization, role: membership.role };
  }

  private async ensureGlobalCodeAvailable(normalizedCode: string, currentId: string | null) {
    const existing = await this.competencies.findGlobalCompetencyByNormalizedCode(normalizedCode);

    if (existing && existing.id !== currentId) {
      throw conflict("global_competency_code_duplicate", "Global competency code exists.");
    }
  }

  private async ensureOrganizationCodeAvailable(
    organizationId: string,
    normalizedCode: string,
    currentId: string | null
  ) {
    const existing = await this.competencies.findOrganizationCompetencyByNormalizedCode(
      organizationId,
      normalizedCode
    );

    if (existing && existing.id !== currentId) {
      throw conflict(
        "organization_competency_code_duplicate",
        "Organization competency code exists."
      );
    }
  }

  private async findGlobal(globalCompetencyId: string) {
    const global = await this.competencies.findGlobalCompetencyById(globalCompetencyId);

    if (!global) {
      throw notFound("global_competency_not_found", "Global competency not found.");
    }

    return global;
  }

  private async findOrganizationCompetencyInOrganization(
    actor: Actor,
    organizationId: string,
    competencyId: string
  ) {
    const competency = await this.competencies.findOrganizationCompetencyById(competencyId);

    if (!competency || competency.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "organization_competency.cross_organization_access_denied",
        "competency_organization_mismatch",
        { organizationCompetencyId: competencyId }
      );
      throw notFound("organization_competency_not_found", "Organization competency not found.");
    }

    return competency;
  }

  private async findAdoptionInOrganization(
    actor: Actor,
    organizationId: string,
    adoptionId: string
  ) {
    const adoption = await this.competencies.findAdoptionById(adoptionId);

    if (!adoption || adoption.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "adopted_competency.cross_organization_access_denied",
        "adoption_organization_mismatch",
        { adoptionId }
      );
      throw notFound("adopted_competency_not_found", "Adopted competency not found.");
    }

    return adoption;
  }

  private async ensureOrganizationCatalogItem(
    actor: Actor,
    organizationId: string,
    organizationCompetencyId: string,
    status: CompetencyCatalogItem["status"]
  ) {
    const existing = await this.competencies.findCatalogItemForOrganizationCompetency(
      organizationId,
      organizationCompetencyId
    );
    const now = this.competencies.now();

    if (existing) {
      const updated = { ...existing, status, updatedAt: now };
      await this.competencies.updateCatalogItem(updated);
      await this.audit(actor, organizationId, catalogItemAction(status), {
        competencyCatalogItemId: updated.id,
        organizationCompetencyId
      });
      return updated;
    }

    const item: CompetencyCatalogItem = {
      id: this.competencies.nextId("ccat"),
      organizationId,
      origin: "organization",
      globalCompetencyId: null,
      organizationCompetencyId,
      status,
      createdAt: now,
      updatedAt: now
    };
    await this.competencies.createCatalogItem(item);
    await this.audit(actor, organizationId, "competency_catalog_item.created", {
      competencyCatalogItemId: item.id,
      organizationCompetencyId
    });
    return item;
  }

  private async ensureGlobalCatalogItem(
    actor: Actor,
    organizationId: string,
    globalCompetencyId: string,
    status: CompetencyCatalogItem["status"]
  ) {
    const existing = await this.competencies.findCatalogItemForGlobal(
      organizationId,
      globalCompetencyId
    );
    const now = this.competencies.now();

    if (existing) {
      const updated = { ...existing, status, updatedAt: now };
      await this.competencies.updateCatalogItem(updated);
      await this.audit(actor, organizationId, catalogItemAction(status), {
        competencyCatalogItemId: updated.id,
        globalCompetencyId
      });
      return updated;
    }

    const item: CompetencyCatalogItem = {
      id: this.competencies.nextId("ccat"),
      organizationId,
      origin: "global",
      globalCompetencyId,
      organizationCompetencyId: null,
      status,
      createdAt: now,
      updatedAt: now
    };
    await this.competencies.createCatalogItem(item);
    await this.audit(actor, organizationId, "competency_catalog_item.created", {
      competencyCatalogItemId: item.id,
      globalCompetencyId
    });
    return item;
  }

  private async syncCatalogItemsForGlobal(
    actor: Actor,
    globalCompetencyId: string,
    globalStatus: Extract<GlobalCompetencyStatus, "active" | "inactive">
  ) {
    const allOrganizations = await this.core.listOrganizations();

    for (const organization of allOrganizations) {
      const item = await this.competencies.findCatalogItemForGlobal(
        organization.id,
        globalCompetencyId
      );

      if (!item) {
        continue;
      }

      const adoption = await this.competencies.findAdoptionByOrganizationAndGlobal(
        organization.id,
        globalCompetencyId
      );
      const nextStatus =
        globalStatus === "active" && adoption?.status === "active" ? "active" : "inactive";

      if (item.status !== nextStatus) {
        await this.competencies.updateCatalogItem({
          ...item,
          status: nextStatus,
          updatedAt: this.competencies.now()
        });
        await this.audit(actor, organization.id, catalogItemAction(nextStatus), {
          competencyCatalogItemId: item.id,
          globalCompetencyId
        });
      }
    }
  }

  private ensureNoOrganizationChange(
    organizationId: string,
    inputOrganizationId: string | undefined
  ) {
    if (inputOrganizationId !== undefined && inputOrganizationId !== organizationId) {
      throw badRequest(
        "organization_competency_organization_immutable",
        "Organization competency cannot change Organization."
      );
    }
  }

  private async toCatalogDetails(item: CompetencyCatalogItem): Promise<CompetencyDetails> {
    const catalog = (await this.competencies.listUnifiedCatalog(item.organizationId)).find(
      (candidate) => candidate.competencyCatalogItemId === item.id
    );

    if (!catalog) {
      throw notFound("competency_catalog_item_not_found", "Competency catalog item not found.");
    }

    if (item.origin === "global" && item.globalCompetencyId) {
      return {
        ...catalog,
        globalCompetency: await this.findGlobal(item.globalCompetencyId),
        organizationCompetency: null
      };
    }

    const organizationCompetency = await this.competencies.findOrganizationCompetencyById(
      String(item.organizationCompetencyId)
    );

    if (!organizationCompetency) {
      throw notFound("competency_catalog_item_not_found", "Competency catalog item not found.");
    }

    return { ...catalog, globalCompetency: null, organizationCompetency };
  }

  private async audit(
    actor: Actor,
    organizationId: string | null,
    action: string,
    metadata: AuditEvent["metadata"] = {}
  ) {
    await this.core.addAuditEvent({
      id: this.core.nextId("aud"),
      organizationId,
      actorUserId: actor.userId,
      action,
      result: "allowed",
      reason: null,
      metadata,
      createdAt: this.core.now()
    });
  }

  private async auditDenied(
    actor: Actor,
    organizationId: string | null,
    action: string,
    reason: string,
    metadata: AuditEvent["metadata"] = {}
  ) {
    await this.core.addAuditEvent({
      id: this.core.nextId("aud"),
      organizationId,
      actorUserId: actor.userId,
      action,
      result: "denied",
      reason,
      metadata,
      createdAt: this.core.now()
    });
  }
}

export function createPostgresCompetencyService(pool: pg.Pool) {
  const core = new PostgresCoreRepository(pool);
  const competencies = new PostgresCompetencyRepository(pool);
  const runTransaction: CompetencyTransactionRunner = async (callback) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        competencies: new PostgresCompetencyRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  return new CompetencyService(core, competencies, runTransaction);
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }

  return actor.userId;
}

function globalStatusAction(status: GlobalCompetencyStatus) {
  if (status === "active") {
    return "global_competency.activated";
  }

  if (status === "deprecated") {
    return "global_competency.deprecated";
  }

  return "global_competency.inactivated";
}

function catalogItemAction(status: CompetencyCatalogItem["status"]) {
  return status === "active"
    ? "competency_catalog_item.activated"
    : "competency_catalog_item.inactivated";
}

function changedFields(before: GlobalCompetency | OrganizationCompetency, after: typeof before) {
  return [
    "code",
    "name",
    "category",
    "definition",
    "positiveEvidences",
    "negativeEvidences",
    "practicalExamples",
    "proficiencyLevels"
  ].filter(
    (field) =>
      JSON.stringify(before[field as keyof typeof before]) !==
      JSON.stringify(after[field as keyof typeof after])
  );
}

function definedPatch<T extends Record<string, unknown>>(patch: T) {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}
