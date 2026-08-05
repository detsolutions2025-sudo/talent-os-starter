import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { CoreRepository, MembershipWithUser } from "../core/repository";
import type { AuditEvent, Membership, Organization, User } from "../core/types";

export class PostgresCoreRepository implements CoreRepository {
  constructor(
    readonly connection: pg.Pool | pg.PoolClient,
    private readonly inTransaction = false
  ) {}

  async transaction<T>(callback: (repository: CoreRepository) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      return callback(this);
    }

    if (!isPool(this.connection)) {
      throw new Error("PostgreSQL transaction requires a pool.");
    }

    const client = await this.connection.connect();

    try {
      await client.query("BEGIN");
      const result = await callback(new PostgresCoreRepository(client, true));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async findUserById(userId: string) {
    const result = await this.connection.query("SELECT * FROM users WHERE id = $1", [userId]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findUserByEmail(email: string) {
    const result = await this.connection.query("SELECT * FROM users WHERE email = $1", [email]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async listUsers() {
    const result = await this.connection.query("SELECT * FROM users ORDER BY created_at, id");
    return result.rows.map(mapUser);
  }

  async addUser(user: User) {
    await this.connection.query(
      `
        INSERT INTO users (id, name, email, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [user.id, user.name, user.email, user.status, user.createdAt, user.updatedAt]
    );
  }

  async findOrganizationById(organizationId: string) {
    const result = await this.connection.query("SELECT * FROM organizations WHERE id = $1", [
      organizationId
    ]);
    return result.rows[0] ? mapOrganization(result.rows[0]) : null;
  }

  async findOrganizationBySlug(slug: string) {
    const result = await this.connection.query("SELECT * FROM organizations WHERE slug = $1", [
      slug
    ]);
    return result.rows[0] ? mapOrganization(result.rows[0]) : null;
  }

  async listOrganizations() {
    const result = await this.connection.query(
      "SELECT * FROM organizations ORDER BY created_at, id"
    );
    return result.rows.map(mapOrganization);
  }

  async listOrganizationsForUser(userId: string) {
    const result = await this.connection.query(
      `
        SELECT organizations.*
        FROM organizations
        INNER JOIN memberships ON memberships.organization_id = organizations.id
        WHERE memberships.user_id = $1
          AND memberships.status = 'active'
          AND organizations.status = 'active'
        ORDER BY organizations.created_at, organizations.id
      `,
      [userId]
    );

    return result.rows.map(mapOrganization);
  }

  async addOrganization(organization: Organization) {
    await this.connection.query(
      `
        INSERT INTO organizations (
          id, name, slug, status, legal_name, tax_id, description,
          archived_at, archived_by_user_id, reactivated_at, reactivated_by_user_id,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        organization.id,
        organization.name,
        organization.slug,
        organization.status,
        organization.legalName,
        organization.taxId,
        organization.description,
        organization.archivedAt,
        organization.archivedByUserId,
        organization.reactivatedAt,
        organization.reactivatedByUserId,
        organization.createdAt,
        organization.updatedAt
      ]
    );
  }

  async updateOrganization(organization: Organization) {
    await this.connection.query(
      `
        UPDATE organizations
        SET name = $2,
            slug = $3,
            status = $4,
            legal_name = $5,
            tax_id = $6,
            description = $7,
            archived_at = $8,
            archived_by_user_id = $9,
            reactivated_at = $10,
            reactivated_by_user_id = $11,
            updated_at = $12
        WHERE id = $1
      `,
      [
        organization.id,
        organization.name,
        organization.slug,
        organization.status,
        organization.legalName,
        organization.taxId,
        organization.description,
        organization.archivedAt,
        organization.archivedByUserId,
        organization.reactivatedAt,
        organization.reactivatedByUserId,
        organization.updatedAt
      ]
    );
  }

  async findMembershipById(membershipId: string) {
    const result = await this.connection.query("SELECT * FROM memberships WHERE id = $1", [
      membershipId
    ]);
    return result.rows[0] ? mapMembership(result.rows[0]) : null;
  }

  async findMembershipByOrganizationAndUser(organizationId: string, userId: string) {
    const result = await this.connection.query(
      "SELECT * FROM memberships WHERE organization_id = $1 AND user_id = $2",
      [organizationId, userId]
    );
    return result.rows[0] ? mapMembership(result.rows[0]) : null;
  }

  async listMembershipsByOrganization(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM memberships WHERE organization_id = $1 ORDER BY created_at, id",
      [organizationId]
    );
    return result.rows.map(mapMembership);
  }

  async listMembershipsWithUsersByOrganization(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT
          memberships.*,
          users.id AS user_id_for_map,
          users.name AS user_name,
          users.email AS user_email,
          users.status AS user_status,
          users.created_at AS user_created_at,
          users.updated_at AS user_updated_at
        FROM memberships
        LEFT JOIN users ON users.id = memberships.user_id
        WHERE memberships.organization_id = $1
        ORDER BY memberships.created_at, memberships.id
      `,
      [organizationId]
    );

    return result.rows.map((row) => ({
      ...mapMembership(row),
      user: row.user_id_for_map
        ? {
            id: String(row.user_id_for_map),
            name: String(row.user_name),
            email: String(row.user_email),
            status: row.user_status as User["status"],
            createdAt: toIso(row.user_created_at),
            updatedAt: toIso(row.user_updated_at)
          }
        : null
    })) satisfies MembershipWithUser[];
  }

  async addMembership(membership: Membership) {
    await this.connection.query(
      `
        INSERT INTO memberships (
          id, organization_id, user_id, role, status, joined_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        membership.id,
        membership.organizationId,
        membership.userId,
        membership.role,
        membership.status,
        membership.joinedAt,
        membership.createdAt,
        membership.updatedAt
      ]
    );
  }

  async updateMembership(membership: Membership) {
    await this.connection.query(
      `
        UPDATE memberships
        SET role = $2,
            status = $3,
            updated_at = $4
        WHERE id = $1
      `,
      [membership.id, membership.role, membership.status, membership.updatedAt]
    );
  }

  async countActiveOwners(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT COUNT(*)::int AS count
        FROM memberships
        WHERE organization_id = $1
          AND role = 'owner'
          AND status = 'active'
      `,
      [organizationId]
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async lockMembershipsByOrganization(organizationId: string) {
    await this.connection.query(
      "SELECT id FROM memberships WHERE organization_id = $1 FOR UPDATE",
      [organizationId]
    );
  }

  async addAuditEvent(event: AuditEvent) {
    await this.connection.query(
      `
        INSERT INTO audit_events (
          id, organization_id, actor_user_id, action, result, reason, metadata, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      `,
      [
        event.id,
        event.organizationId,
        event.actorUserId,
        event.action,
        event.result,
        event.reason,
        JSON.stringify(event.metadata),
        event.createdAt
      ]
    );
  }

  async listAuditEvents() {
    const result = await this.connection.query(
      "SELECT * FROM audit_events ORDER BY created_at, id"
    );
    return result.rows.map(mapAuditEvent);
  }
}

function isPool(connection: pg.Pool | pg.PoolClient): connection is pg.Pool {
  return "connect" in connection;
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    status: row.status as User["status"],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapOrganization(row: Record<string, unknown>): Organization {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    status: row.status as Organization["status"],
    legalName: nullableString(row.legal_name),
    taxId: nullableString(row.tax_id),
    description: nullableString(row.description),
    archivedAt: nullableIso(row.archived_at),
    archivedByUserId: nullableString(row.archived_by_user_id),
    reactivatedAt: nullableIso(row.reactivated_at),
    reactivatedByUserId: nullableString(row.reactivated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapMembership(row: Record<string, unknown>): Membership {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    role: row.role as Membership["role"],
    status: row.status as Membership["status"],
    joinedAt: toIso(row.joined_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapAuditEvent(row: Record<string, unknown>): AuditEvent {
  return {
    id: String(row.id),
    organizationId: nullableString(row.organization_id),
    actorUserId: nullableString(row.actor_user_id),
    action: String(row.action),
    result: row.result as AuditEvent["result"],
    reason: nullableString(row.reason),
    metadata: normalizeMetadata(row.metadata),
    createdAt: toIso(row.created_at)
  };
}

function normalizeMetadata(value: unknown): AuditEvent["metadata"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, entry === null ? null : String(entry)])
  );
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
