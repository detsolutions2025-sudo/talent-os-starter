import type pg from "pg";
import { conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, MembershipRole } from "../core/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresDnaRepository } from "../persistence/postgres-dna-repository";
import type { DnaRepository } from "./repository";
import type { DnaActorContext, DnaAdminReadInput, DnaDraftInput, DnaVersion } from "./types";
import {
  mergeDraftInput,
  normalizeDraftInput,
  requireAdminReason,
  validatePublishable
} from "./validation";

type DnaTransaction = {
  core: CoreRepository;
  dna: DnaRepository;
};

type DnaTransactionRunner = <T>(
  callback: (transaction: DnaTransaction) => Promise<T>
) => Promise<T>;

export class DnaService {
  constructor(
    private readonly core: CoreRepository,
    private readonly dna: DnaRepository,
    private readonly runTransaction: DnaTransactionRunner
  ) {}

  async createDraft(actor: Actor, organizationId: string, input: DnaDraftInput = {}) {
    return this.runTransaction(async ({ core, dna }) => {
      const service = this.scoped(core, dna);
      const context = await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await dna.lockOrganizationVersions(organizationId);

      if (await dna.findActiveDraft(organizationId)) {
        throw conflict("dna_active_draft_exists", "Organization already has an active DNA draft.");
      }

      const published = await dna.findPublished(organizationId);
      const base = published
        ? toInput(published)
        : {
            mission: "",
            vision: "",
            purpose: "",
            values: [],
            competencies: [],
            culture: "",
            leadershipStyle: "",
            workEnvironment: ""
          };
      const normalized = mergeDraftInput(base, input);
      const now = dna.now();
      const draft: DnaVersion = {
        id: dna.nextId("dna"),
        organizationId,
        versionNumber: null,
        status: "draft",
        mission: normalized.mission,
        vision: normalized.vision,
        purpose: normalized.purpose,
        values: normalized.values,
        competencies: normalized.competencies,
        culture: normalized.culture,
        leadershipStyle: normalized.leadershipStyle,
        workEnvironment: normalized.workEnvironment,
        createdByUserId: actor.userId ?? "",
        updatedByUserId: actor.userId ?? "",
        publishedByUserId: null,
        discardedByUserId: null,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        discardedAt: null
      };

      await dna.createVersion(draft);
      await service.audit(actor, organizationId, draft.id, "organization_dna.draft_created", {
        role: context.role
      });

      return draft;
    });
  }

  async getPublished(actor: Actor, organizationId: string) {
    await this.authorizeReadPublished(actor, organizationId);
    const version = await this.dna.findPublished(organizationId);

    if (!version) {
      throw notFound("dna_published_not_found", "Published DNA was not found.");
    }

    return version;
  }

  async getActiveDraft(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const draft = await this.dna.findActiveDraft(organizationId);

    if (!draft) {
      throw notFound("dna_draft_not_found", "Active DNA draft was not found.");
    }

    return draft;
  }

  async listVersions(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.dna.listVersions(organizationId);
  }

  async getVersion(actor: Actor, organizationId: string, versionId: string) {
    const context = await this.authorizeVersionRead(actor, organizationId);
    const version = await this.findVersionInOrganization(organizationId, versionId);

    if (context.role === "member" && version.status !== "published") {
      await this.auditDenied(
        actor,
        organizationId,
        versionId,
        "organization_dna.read_denied",
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }

    return version;
  }

  async adminRead(actor: Actor, organizationId: string, input: DnaAdminReadInput) {
    const reason = requireAdminReason(input.reason);

    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }

    const organization = await this.core.findOrganizationById(organizationId);

    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }

    const versions = await this.dna.listVersions(organizationId);
    await this.audit(actor, organizationId, null, "organization_dna.admin_read", {
      reason,
      versionCount: String(versions.length)
    });

    return versions;
  }

  async updateDraft(actor: Actor, organizationId: string, versionId: string, input: DnaDraftInput) {
    return this.runTransaction(async ({ core, dna }) => {
      const service = this.scoped(core, dna);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const draft = await service.findActiveDraftInOrganization(organizationId, versionId);
      const next = mergeDraftInput(toInput(draft), input);
      const updated: DnaVersion = {
        ...draft,
        mission: next.mission,
        vision: next.vision,
        purpose: next.purpose,
        values: next.values,
        competencies: next.competencies,
        culture: next.culture,
        leadershipStyle: next.leadershipStyle,
        workEnvironment: next.workEnvironment,
        updatedByUserId: actor.userId ?? draft.updatedByUserId,
        updatedAt: dna.now()
      };

      await dna.updateVersion(updated);
      await service.audit(actor, organizationId, versionId, "organization_dna.draft_updated");

      return updated;
    });
  }

  async discardDraft(actor: Actor, organizationId: string, versionId: string) {
    return this.runTransaction(async ({ core, dna }) => {
      const service = this.scoped(core, dna);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const draft = await service.findActiveDraftInOrganization(organizationId, versionId);
      const now = dna.now();
      const discarded: DnaVersion = {
        ...draft,
        discardedAt: now,
        discardedByUserId: actor.userId ?? draft.discardedByUserId,
        updatedByUserId: actor.userId ?? draft.updatedByUserId,
        updatedAt: now
      };

      await dna.updateVersion(discarded);
      await service.audit(actor, organizationId, versionId, "organization_dna.draft_discarded");

      return discarded;
    });
  }

  async publishDraft(actor: Actor, organizationId: string, versionId: string) {
    return this.runTransaction(async ({ core, dna }) => {
      const service = this.scoped(core, dna);
      await service.authorizeUser(actor, organizationId, ["owner"]);
      await dna.lockOrganizationVersions(organizationId);
      const draft = await service.findActiveDraftInOrganization(organizationId, versionId);
      const normalized = normalizeDraftInput(toInput(draft));
      validatePublishable(normalized);

      const published = await dna.findPublished(organizationId);
      const now = dna.now();

      if (published) {
        await dna.updateVersion({
          ...published,
          status: "archived",
          updatedAt: now
        });
        await service.audit(
          actor,
          organizationId,
          published.id,
          "organization_dna.previous_version_archived"
        );
      }

      const nextVersionNumber = (await dna.maxVersionNumber(organizationId)) + 1;
      const userId = requireUserActorId(actor);
      const next: DnaVersion = {
        ...draft,
        ...normalized,
        versionNumber: nextVersionNumber,
        status: "published",
        updatedByUserId: userId,
        publishedByUserId: userId,
        updatedAt: now,
        publishedAt: now
      };

      await dna.updateVersion(next);
      await service.audit(actor, organizationId, versionId, "organization_dna.published", {
        versionNumber: String(nextVersionNumber)
      });

      return next;
    });
  }

  private scoped(core: CoreRepository, dna: DnaRepository) {
    return new DnaService(core, dna, this.runTransaction);
  }

  private async authorizeReadPublished(actor: Actor, organizationId: string) {
    if (actor.kind === "platform") {
      throw forbidden("dna_admin_reason_required", "Administrative read reason is required.");
    }

    return this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
  }

  private async authorizeVersionRead(actor: Actor, organizationId: string) {
    if (actor.kind === "platform") {
      throw forbidden("dna_admin_reason_required", "Administrative read reason is required.");
    }

    return this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[]
  ): Promise<DnaActorContext> {
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
        null,
        "organization_dna.archived_organization_denied",
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
        null,
        "organization_dna.cross_organization_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }

    if (!allowedRoles.includes(membership.role)) {
      await this.auditDenied(
        actor,
        organizationId,
        null,
        "organization_dna.read_denied",
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }

    return { actor, organization, role: membership.role };
  }

  private async findVersionInOrganization(organizationId: string, versionId: string) {
    const version = await this.dna.findVersionById(versionId);

    if (!version || version.organizationId !== organizationId) {
      throw notFound("dna_version_not_found", "DNA version was not found.");
    }

    return version;
  }

  private async findActiveDraftInOrganization(organizationId: string, versionId: string) {
    const draft = await this.findVersionInOrganization(organizationId, versionId);

    if (draft.status !== "draft" || draft.discardedAt) {
      throw conflict("dna_draft_inactive", "DNA draft is not active.");
    }

    return draft;
  }

  private async audit(
    actor: Actor,
    organizationId: string,
    versionId: string | null,
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
      metadata: { ...metadata, versionId },
      createdAt: this.core.now()
    });
  }

  private async auditDenied(
    actor: Actor,
    organizationId: string,
    versionId: string | null,
    action: string,
    reason: string
  ) {
    await this.core.addAuditEvent({
      id: this.core.nextId("aud"),
      organizationId,
      actorUserId: actor.userId,
      action,
      result: "denied",
      reason,
      metadata: { versionId },
      createdAt: this.core.now()
    });
  }
}

export function createPostgresDnaService(pool: pg.Pool) {
  const core = new PostgresCoreRepository(pool);
  const dna = new PostgresDnaRepository(pool);
  const runTransaction: DnaTransactionRunner = async (callback) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        dna: new PostgresDnaRepository(client, true)
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

  return new DnaService(core, dna, runTransaction);
}

export function createDnaServiceForRepositories(core: CoreRepository, dna: DnaRepository) {
  const runTransaction: DnaTransactionRunner = async (callback) => callback({ core, dna });
  return new DnaService(core, dna, runTransaction);
}

function toInput(version: DnaVersion) {
  return {
    mission: version.mission,
    vision: version.vision,
    purpose: version.purpose,
    values: version.values,
    competencies: version.competencies,
    culture: version.culture,
    leadershipStyle: version.leadershipStyle,
    workEnvironment: version.workEnvironment
  };
}

function requireUserActorId(actor: Actor) {
  if (!actor.userId) {
    throw forbidden("permission_denied", "Permission denied.");
  }

  return actor.userId;
}
