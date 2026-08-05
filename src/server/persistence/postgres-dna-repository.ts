import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { DnaRepository } from "../dna/repository";
import type { DnaCompetency, DnaValue, DnaVersion } from "../dna/types";

export class PostgresDnaRepository implements DnaRepository {
  constructor(
    readonly connection: pg.Pool | pg.PoolClient,
    private readonly inTransaction = false
  ) {}

  async transaction<T>(callback: (repository: DnaRepository) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      return callback(this);
    }

    if (!isPool(this.connection)) {
      throw new Error("PostgreSQL transaction requires a pool.");
    }

    const client = await this.connection.connect();

    try {
      await client.query("BEGIN");
      const result = await callback(new PostgresDnaRepository(client, true));
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

  async lockOrganizationVersions(organizationId: string) {
    await this.connection.query(
      "SELECT id FROM organization_dna_versions WHERE organization_id = $1 FOR UPDATE",
      [organizationId]
    );
  }

  async findActiveDraft(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organization_dna_versions
        WHERE organization_id = $1
          AND status = 'draft'
          AND discarded_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [organizationId]
    );

    return result.rows[0] ? mapDnaVersion(result.rows[0]) : null;
  }

  async findPublished(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organization_dna_versions
        WHERE organization_id = $1
          AND status = 'published'
        LIMIT 1
      `,
      [organizationId]
    );

    return result.rows[0] ? mapDnaVersion(result.rows[0]) : null;
  }

  async findVersionById(versionId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_dna_versions WHERE id = $1",
      [versionId]
    );

    return result.rows[0] ? mapDnaVersion(result.rows[0]) : null;
  }

  async listVersions(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organization_dna_versions
        WHERE organization_id = $1
        ORDER BY COALESCE(version_number, 0) DESC, created_at DESC, id DESC
      `,
      [organizationId]
    );

    return result.rows.map(mapDnaVersion);
  }

  async maxVersionNumber(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT COALESCE(MAX(version_number), 0)::int AS max_version
        FROM organization_dna_versions
        WHERE organization_id = $1
      `,
      [organizationId]
    );

    return Number(result.rows[0]?.max_version ?? 0);
  }

  async createVersion(version: DnaVersion) {
    await this.connection.query(
      `
        INSERT INTO organization_dna_versions (
          id, organization_id, version_number, status, mission, vision, purpose,
          values_content, competencies_content, culture_content, leadership_style_content,
          work_environment_content, created_by_user_id, updated_by_user_id,
          published_by_user_id, discarded_by_user_id, created_at, updated_at,
          published_at, discarded_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19, $20
        )
      `,
      versionParams(version)
    );
  }

  async updateVersion(version: DnaVersion) {
    await this.connection.query(
      `
        UPDATE organization_dna_versions
        SET version_number = $3,
            status = $4,
            mission = $5,
            vision = $6,
            purpose = $7,
            values_content = $8::jsonb,
            competencies_content = $9::jsonb,
            culture_content = $10,
            leadership_style_content = $11,
            work_environment_content = $12,
            created_by_user_id = $13,
            updated_by_user_id = $14,
            published_by_user_id = $15,
            discarded_by_user_id = $16,
            created_at = $17,
            updated_at = $18,
            published_at = $19,
            discarded_at = $20
        WHERE id = $1
          AND organization_id = $2
      `,
      versionParams(version)
    );
  }
}

function isPool(connection: pg.Pool | pg.PoolClient): connection is pg.Pool {
  return "connect" in connection;
}

function versionParams(version: DnaVersion) {
  return [
    version.id,
    version.organizationId,
    version.versionNumber,
    version.status,
    version.mission,
    version.vision,
    version.purpose,
    JSON.stringify(version.values),
    JSON.stringify(version.competencies),
    version.culture,
    version.leadershipStyle,
    version.workEnvironment,
    version.createdByUserId,
    version.updatedByUserId,
    version.publishedByUserId,
    version.discardedByUserId,
    version.createdAt,
    version.updatedAt,
    version.publishedAt,
    version.discardedAt
  ];
}

function mapDnaVersion(row: Record<string, unknown>): DnaVersion {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    versionNumber: row.version_number === null ? null : Number(row.version_number),
    status: row.status as DnaVersion["status"],
    mission: String(row.mission),
    vision: String(row.vision),
    purpose: String(row.purpose),
    values: normalizeValues(row.values_content),
    competencies: normalizeCompetencies(row.competencies_content),
    culture: String(row.culture_content),
    leadershipStyle: String(row.leadership_style_content),
    workEnvironment: String(row.work_environment_content),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: String(row.updated_by_user_id),
    publishedByUserId: nullableString(row.published_by_user_id),
    discardedByUserId: nullableString(row.discarded_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    publishedAt: nullableIso(row.published_at),
    discardedAt: nullableIso(row.discarded_at)
  };
}

function normalizeValues(value: unknown): DnaValue[] {
  return Array.isArray(value) ? (value as DnaValue[]) : [];
}

function normalizeCompetencies(value: unknown): DnaCompetency[] {
  return Array.isArray(value) ? (value as DnaCompetency[]) : [];
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
