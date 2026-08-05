import type pg from "pg";
import { badRequest, conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, MembershipRole } from "../core/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresOrganizationalUnitRepository } from "../persistence/postgres-organizational-unit-repository";
import type { OrganizationalUnitRepository } from "./repository";
import type {
  OrganizationalUnit,
  OrganizationalUnitActorContext,
  OrganizationalUnitAdminReadInput,
  OrganizationalUnitInput,
  OrganizationalUnitMoveInput,
  OrganizationalUnitTreeNode
} from "./types";
import {
  requireAdminReason,
  validateCreateInput,
  validateMoveInput,
  validateUpdateInput
} from "./validation";

type OrganizationalUnitTransaction = {
  core: CoreRepository;
  units: OrganizationalUnitRepository;
};

type OrganizationalUnitTransactionRunner = <T>(
  callback: (transaction: OrganizationalUnitTransaction) => Promise<T>
) => Promise<T>;

const maxDepth = 10;

export class OrganizationalUnitService {
  constructor(
    private readonly core: CoreRepository,
    private readonly units: OrganizationalUnitRepository,
    private readonly runTransaction: OrganizationalUnitTransactionRunner
  ) {}

  async createUnit(actor: Actor, organizationId: string, input: OrganizationalUnitInput) {
    return this.runTransaction(async ({ core, units }) => {
      const service = this.scoped(core, units);
      const context = await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const normalized = validateCreateInput(input);
      await service.ensureNoOrganizationChange(organizationId, input.organizationId);
      await units.lockOrganizationUnits(organizationId);
      await service.ensureCodeAvailable(organizationId, normalized.code, null);
      await service.validateParent(actor, organizationId, normalized.parentId);
      await service.ensureDepthWithinLimit(actor, organizationId, null, normalized.parentId);

      const now = units.now();
      const userId = requireUserActorId(actor);
      const unit: OrganizationalUnit = {
        id: units.nextId("ou"),
        organizationId,
        code: normalized.code,
        name: normalized.name,
        type: normalized.type,
        parentId: normalized.parentId,
        managerName: normalized.managerName,
        managerEmail: normalized.managerEmail,
        description: normalized.description,
        displayOrder: normalized.displayOrder,
        status: "active",
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now,
        inactivatedAt: null
      };

      await units.createUnit(unit);
      await service.audit(actor, organizationId, unit.id, "organizational_unit.created", {
        role: context.role
      });

      return unit;
    });
  }

  async listTree(actor: Actor, organizationId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const units =
      context.role === "member"
        ? await this.units.listActiveUnits(organizationId)
        : await this.units.listUnits(organizationId);

    return buildTree(units);
  }

  async listActive(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    return this.units.listActiveUnits(organizationId);
  }

  async getUnit(actor: Actor, organizationId: string, unitId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const unit = await this.findUnitInOrganization(actor, organizationId, unitId);

    if (context.role === "member" && unit.status !== "active") {
      await this.auditDenied(
        actor,
        organizationId,
        unitId,
        "organizational_unit.read_denied",
        "permission_denied"
      );
      throw notFound("organizational_unit_not_found", "Organizational unit not found.");
    }

    return unit;
  }

  async updateUnit(
    actor: Actor,
    organizationId: string,
    unitId: string,
    input: OrganizationalUnitInput
  ) {
    return this.runTransaction(async ({ core, units }) => {
      const service = this.scoped(core, units);
      const context = await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await service.ensureNoOrganizationChange(organizationId, input.organizationId);
      const unit = await service.findUnitInOrganization(actor, organizationId, unitId);
      const normalized = validateUpdateInput(input);

      if (normalized.code && normalized.code !== unit.code) {
        if (context.role !== "owner") {
          await service.auditDenied(
            actor,
            organizationId,
            unitId,
            "organizational_unit.code_change_denied",
            "permission_denied"
          );
          throw forbidden("permission_denied", "Permission denied.");
        }
        await service.ensureCodeAvailable(organizationId, normalized.code, unit.id);
      }

      const updated: OrganizationalUnit = {
        ...unit,
        code: normalized.code ?? unit.code,
        name: normalized.name ?? unit.name,
        type: normalized.type ?? unit.type,
        managerName:
          normalized.managerName === undefined ? unit.managerName : normalized.managerName,
        managerEmail:
          normalized.managerEmail === undefined ? unit.managerEmail : normalized.managerEmail,
        description:
          normalized.description === undefined ? unit.description : normalized.description,
        displayOrder: normalized.displayOrder ?? unit.displayOrder,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: units.now()
      };

      await units.updateUnit(updated);
      await service.audit(actor, organizationId, unitId, "organizational_unit.updated", {
        fields: changedFields(unit, updated).join(",")
      });

      if (unit.code !== updated.code) {
        await service.audit(actor, organizationId, unitId, "organizational_unit.code_changed");
      }

      return updated;
    });
  }

  async moveUnit(
    actor: Actor,
    organizationId: string,
    unitId: string,
    input: OrganizationalUnitMoveInput
  ) {
    return this.runTransaction(async ({ core, units }) => {
      const service = this.scoped(core, units);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await service.ensureNoOrganizationChange(organizationId, input.organizationId);
      const normalized = validateMoveInput(input);
      await units.lockOrganizationUnits(organizationId);
      const unit = await service.findUnitInOrganization(actor, organizationId, unitId);
      await service.validateParent(actor, organizationId, normalized.parentId);
      await service.ensureDepthWithinLimit(actor, organizationId, unit.id, normalized.parentId);

      const moved: OrganizationalUnit = {
        ...unit,
        parentId: normalized.parentId,
        displayOrder: normalized.displayOrder ?? unit.displayOrder,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: units.now()
      };

      await units.updateUnit(moved);
      await service.audit(actor, organizationId, unitId, "organizational_unit.moved", {
        parentId: moved.parentId
      });

      return moved;
    });
  }

  async inactivateUnit(actor: Actor, organizationId: string, unitId: string) {
    return this.runTransaction(async ({ core, units }) => {
      const service = this.scoped(core, units);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await units.lockOrganizationUnits(organizationId);
      const unit = await service.findUnitInOrganization(actor, organizationId, unitId);

      if (unit.status !== "active") {
        throw conflict("organizational_unit_not_active", "Organizational unit is not active.");
      }

      if ((await units.countActiveChildren(unit.id)) > 0) {
        throw conflict(
          "organizational_unit_has_active_children",
          "Organizational unit has active children."
        );
      }

      const now = units.now();
      const updated: OrganizationalUnit = {
        ...unit,
        status: "inactive",
        inactivatedAt: now,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: now
      };

      await units.updateUnit(updated);
      await service.audit(actor, organizationId, unitId, "organizational_unit.inactivated");

      return updated;
    });
  }

  async reactivateUnit(actor: Actor, organizationId: string, unitId: string) {
    return this.runTransaction(async ({ core, units }) => {
      const service = this.scoped(core, units);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await units.lockOrganizationUnits(organizationId);
      const unit = await service.findUnitInOrganization(actor, organizationId, unitId);

      if (unit.status !== "inactive") {
        throw conflict("organizational_unit_not_inactive", "Organizational unit is not inactive.");
      }

      await service.validateParent(actor, organizationId, unit.parentId);
      const updated: OrganizationalUnit = {
        ...unit,
        status: "active",
        inactivatedAt: null,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: units.now()
      };

      await units.updateUnit(updated);
      await service.audit(actor, organizationId, unitId, "organizational_unit.reactivated");

      return updated;
    });
  }

  async listHistory(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return (await this.core.listAuditEvents()).filter(
      (event) =>
        event.organizationId === organizationId && event.action.startsWith("organizational_unit.")
    );
  }

  async adminRead(actor: Actor, organizationId: string, input: OrganizationalUnitAdminReadInput) {
    const reason = requireAdminReason(input.reason);

    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }

    const organization = await this.core.findOrganizationById(organizationId);

    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }

    const units = await this.units.listUnits(organizationId);
    await this.audit(actor, organizationId, null, "organizational_unit.admin_read", {
      reason,
      unitCount: String(units.length)
    });

    return units;
  }

  private scoped(core: CoreRepository, units: OrganizationalUnitRepository) {
    return new OrganizationalUnitService(core, units, this.runTransaction);
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[]
  ): Promise<OrganizationalUnitActorContext> {
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
        "organizational_unit.archived_organization_denied",
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
        "organizational_unit.cross_organization_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }

    if (!allowedRoles.includes(membership.role)) {
      await this.auditDenied(
        actor,
        organizationId,
        null,
        "organizational_unit.permission_denied",
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }

    return { actor, organization, role: membership.role };
  }

  private async validateParent(actor: Actor, organizationId: string, parentId: string | null) {
    if (!parentId) {
      return null;
    }

    const parent = await this.findUnitInOrganization(actor, organizationId, parentId);

    if (parent.status !== "active") {
      throw conflict("organizational_unit_parent_inactive", "Parent unit is inactive.");
    }

    return parent;
  }

  private async ensureCodeAvailable(
    organizationId: string,
    code: string,
    currentId: string | null
  ) {
    const existing = await this.units.findUnitByCode(organizationId, code);

    if (existing && existing.id !== currentId) {
      throw conflict("organizational_unit_code_duplicate", "Organizational unit code exists.");
    }
  }

  private async findUnitInOrganization(actor: Actor, organizationId: string, unitId: string) {
    const unit = await this.units.findUnitById(unitId);

    if (!unit) {
      throw notFound("organizational_unit_not_found", "Organizational unit not found.");
    }

    if (unit.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        null,
        "organizational_unit.cross_organization_access_denied",
        "unit_organization_mismatch"
      );
      throw notFound("organizational_unit_not_found", "Organizational unit not found.");
    }

    return unit;
  }

  private async ensureDepthWithinLimit(
    actor: Actor,
    organizationId: string,
    movedUnitId: string | null,
    parentId: string | null
  ) {
    const allUnits = await this.units.listUnits(organizationId);
    const parentDepth = parentId ? depthOf(parentId, allUnits) : 0;
    const subtreeHeight = movedUnitId ? heightOf(movedUnitId, allUnits) : 1;

    if (movedUnitId && parentId === movedUnitId) {
      await this.auditDenied(
        actor,
        organizationId,
        movedUnitId,
        "organizational_unit.cycle_denied",
        "self_parent"
      );
      throw conflict("organizational_unit_cycle", "Organizational unit cycle is not allowed.");
    }

    if (movedUnitId && parentId && isDescendant(parentId, movedUnitId, allUnits)) {
      await this.auditDenied(
        actor,
        organizationId,
        movedUnitId,
        "organizational_unit.cycle_denied",
        "cycle"
      );
      throw conflict("organizational_unit_cycle", "Organizational unit cycle is not allowed.");
    }

    if (parentDepth + subtreeHeight > maxDepth) {
      throw conflict("organizational_unit_depth_exceeded", "Organizational unit depth exceeded.");
    }
  }

  private ensureNoOrganizationChange(
    organizationId: string,
    inputOrganizationId: string | undefined
  ) {
    if (inputOrganizationId !== undefined && inputOrganizationId !== organizationId) {
      throw badRequest(
        "organizational_unit_organization_immutable",
        "Organizational unit cannot change Organization."
      );
    }
  }

  private async audit(
    actor: Actor,
    organizationId: string,
    unitId: string | null,
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
      metadata: { ...metadata, unitId },
      createdAt: this.core.now()
    });
  }

  private async auditDenied(
    actor: Actor,
    organizationId: string,
    unitId: string | null,
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
      metadata: { unitId },
      createdAt: this.core.now()
    });
  }
}

export function createPostgresOrganizationalUnitService(pool: pg.Pool) {
  const core = new PostgresCoreRepository(pool);
  const units = new PostgresOrganizationalUnitRepository(pool);
  const runTransaction: OrganizationalUnitTransactionRunner = async (callback) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        units: new PostgresOrganizationalUnitRepository(client)
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

  return new OrganizationalUnitService(core, units, runTransaction);
}

function buildTree(units: OrganizationalUnit[]): OrganizationalUnitTreeNode[] {
  const nodes = new Map<string, OrganizationalUnitTreeNode>();

  for (const unit of units) {
    nodes.set(unit.id, { ...unit, children: [] });
  }

  const roots: OrganizationalUnitTreeNode[] = [];

  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (items: OrganizationalUnitTreeNode[]) => {
    items.sort(
      (left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name)
    );
    for (const item of items) {
      sortNodes(item.children);
    }
  };

  sortNodes(roots);
  return roots;
}

function depthOf(unitId: string, units: OrganizationalUnit[]) {
  let depth = 0;
  let cursor = units.find((unit) => unit.id === unitId) ?? null;
  const seen = new Set<string>();

  while (cursor) {
    if (seen.has(cursor.id)) {
      throw conflict("organizational_unit_cycle", "Organizational unit cycle is not allowed.");
    }
    seen.add(cursor.id);
    depth += 1;
    cursor = cursor.parentId ? (units.find((unit) => unit.id === cursor?.parentId) ?? null) : null;
  }

  return depth;
}

function heightOf(unitId: string, units: OrganizationalUnit[]): number {
  const children = units.filter((unit) => unit.parentId === unitId);

  if (!children.length) {
    return 1;
  }

  return 1 + Math.max(...children.map((child) => heightOf(child.id, units)));
}

function isDescendant(candidateId: string, ancestorId: string, units: OrganizationalUnit[]) {
  let cursor = units.find((unit) => unit.id === candidateId) ?? null;

  while (cursor) {
    if (cursor.id === ancestorId) {
      return true;
    }
    cursor = cursor.parentId ? (units.find((unit) => unit.id === cursor?.parentId) ?? null) : null;
  }

  return false;
}

function changedFields(before: OrganizationalUnit, after: OrganizationalUnit) {
  return [
    "code",
    "name",
    "type",
    "managerName",
    "managerEmail",
    "description",
    "displayOrder"
  ].filter(
    (field) =>
      before[field as keyof OrganizationalUnit] !== after[field as keyof OrganizationalUnit]
  );
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }

  return actor.userId;
}
