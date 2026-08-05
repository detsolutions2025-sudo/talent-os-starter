import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { OrganizationalUnitRepository } from "../organizational-units/repository";
import type { OrganizationalUnit } from "../organizational-units/types";

export class PostgresOrganizationalUnitRepository implements OrganizationalUnitRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async lockOrganizationUnits(organizationId: string) {
    await this.connection.query(
      "SELECT id FROM organizational_units WHERE organization_id = $1 FOR UPDATE",
      [organizationId]
    );
  }

  async createUnit(unit: OrganizationalUnit) {
    await this.connection.query(
      `
        INSERT INTO organizational_units (
          id, organization_id, code, name, type, parent_id, manager_name,
          manager_email, description, display_order, status, created_by_user_id,
          updated_by_user_id, created_at, updated_at, inactivated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16
        )
      `,
      unitParams(unit)
    );
  }

  async updateUnit(unit: OrganizationalUnit) {
    await this.connection.query(
      `
        UPDATE organizational_units
        SET code = $3,
            name = $4,
            type = $5,
            parent_id = $6,
            manager_name = $7,
            manager_email = $8,
            description = $9,
            display_order = $10,
            status = $11,
            created_by_user_id = $12,
            updated_by_user_id = $13,
            created_at = $14,
            updated_at = $15,
            inactivated_at = $16
        WHERE id = $1
          AND organization_id = $2
      `,
      unitParams(unit)
    );
  }

  async findUnitById(unitId: string) {
    const result = await this.connection.query("SELECT * FROM organizational_units WHERE id = $1", [
      unitId
    ]);
    return result.rows[0] ? mapUnit(result.rows[0]) : null;
  }

  async findUnitByCode(organizationId: string, code: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organizational_units
        WHERE organization_id = $1
          AND LOWER(code) = LOWER($2)
        LIMIT 1
      `,
      [organizationId, code]
    );
    return result.rows[0] ? mapUnit(result.rows[0]) : null;
  }

  async listUnits(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organizational_units
        WHERE organization_id = $1
        ORDER BY display_order, name, id
      `,
      [organizationId]
    );
    return result.rows.map(mapUnit);
  }

  async listActiveUnits(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organizational_units
        WHERE organization_id = $1
          AND status = 'active'
        ORDER BY display_order, name, id
      `,
      [organizationId]
    );
    return result.rows.map(mapUnit);
  }

  async countActiveChildren(unitId: string) {
    const result = await this.connection.query(
      `
        SELECT COUNT(*)::int AS count
        FROM organizational_units
        WHERE parent_id = $1
          AND status = 'active'
      `,
      [unitId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

function unitParams(unit: OrganizationalUnit) {
  return [
    unit.id,
    unit.organizationId,
    unit.code,
    unit.name,
    unit.type,
    unit.parentId,
    unit.managerName,
    unit.managerEmail,
    unit.description,
    unit.displayOrder,
    unit.status,
    unit.createdByUserId,
    unit.updatedByUserId,
    unit.createdAt,
    unit.updatedAt,
    unit.inactivatedAt
  ];
}

function mapUnit(row: Record<string, unknown>): OrganizationalUnit {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    code: String(row.code),
    name: String(row.name),
    type: row.type as OrganizationalUnit["type"],
    parentId: nullableString(row.parent_id),
    managerName: nullableString(row.manager_name),
    managerEmail: nullableString(row.manager_email),
    description: nullableString(row.description),
    displayOrder: Number(row.display_order),
    status: row.status as OrganizationalUnit["status"],
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: String(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    inactivatedAt: nullableIso(row.inactivated_at)
  };
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function nullableIso(value: unknown) {
  return value === null || value === undefined ? null : toIso(value);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}
