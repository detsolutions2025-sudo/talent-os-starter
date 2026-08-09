import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { BlueprintRepository } from "../blueprints/repository";
import type {
  BlueprintVersion,
  ComponentType,
  ManifestItem,
  ReadinessResult
} from "../blueprints/types";

export class PostgresBlueprintRepository implements BlueprintRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async lockBlueprintVersions(organizationId: string) {
    await this.connection.query(
      "SELECT id FROM organization_blueprint_versions WHERE organization_id = $1 FOR UPDATE",
      [organizationId]
    );
  }

  async createVersion(version: BlueprintVersion) {
    await this.connection.query(
      `
        INSERT INTO organization_blueprint_versions (
          id, organization_id, version_number, status,
          created_by_user_id, created_source, activated_by_user_id,
          created_at, updated_at, activated_at, archived_at, activation_readiness_snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      `,
      [
        version.id,
        version.organizationId,
        version.versionNumber,
        version.status,
        version.createdByUserId,
        version.createdSource,
        version.activatedByUserId,
        version.createdAt,
        version.updatedAt,
        version.activatedAt,
        version.archivedAt,
        version.activationReadinessSnapshot
          ? JSON.stringify(version.activationReadinessSnapshot)
          : null
      ]
    );
  }

  async updateVersion(version: BlueprintVersion) {
    await this.connection.query(
      `
        UPDATE organization_blueprint_versions
        SET status = $2,
            activated_by_user_id = $3,
            updated_at = $4,
            activated_at = $5,
            archived_at = $6,
            activation_readiness_snapshot = $7::jsonb
        WHERE id = $1
      `,
      [
        version.id,
        version.status,
        version.activatedByUserId,
        version.updatedAt,
        version.activatedAt,
        version.archivedAt,
        version.activationReadinessSnapshot
          ? JSON.stringify(version.activationReadinessSnapshot)
          : null
      ]
    );
  }

  async findVersionById(versionId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_blueprint_versions WHERE id = $1",
      [versionId]
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async findActive(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_blueprint_versions WHERE organization_id = $1 AND status = 'active'",
      [organizationId]
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async findActiveDraft(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_blueprint_versions WHERE organization_id = $1 AND status = 'draft'",
      [organizationId]
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async listVersions(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_blueprint_versions WHERE organization_id = $1 ORDER BY version_number",
      [organizationId]
    );
    return result.rows.map(mapVersion);
  }

  async maxVersionNumber(organizationId: string) {
    const result = await this.connection.query(
      "SELECT COALESCE(MAX(version_number), 0)::int AS max FROM organization_blueprint_versions WHERE organization_id = $1",
      [organizationId]
    );
    return Number(result.rows[0]?.max ?? 0);
  }

  async replaceManifestItems(blueprintVersionId: string, items: ManifestItem[]) {
    await this.connection.query(
      "DELETE FROM organization_blueprint_manifest_items WHERE blueprint_version_id = $1",
      [blueprintVersionId]
    );

    for (const item of items) {
      await this.connection.query(
        `
          INSERT INTO organization_blueprint_manifest_items (
            id, blueprint_version_id, component_type, component_ref_id, component_version_id,
            snapshot_metadata, content_fingerprint, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
        `,
        [
          item.id,
          item.blueprintVersionId,
          item.componentType,
          item.componentRefId,
          item.componentVersionId,
          JSON.stringify(item.snapshotMetadata),
          item.contentFingerprint,
          item.createdAt
        ]
      );
    }
  }

  async listManifestItems(blueprintVersionId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_blueprint_manifest_items WHERE blueprint_version_id = $1 ORDER BY created_at, id",
      [blueprintVersionId]
    );
    return result.rows.map(mapManifestItem);
  }
}

function mapVersion(row: Record<string, unknown>): BlueprintVersion {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    versionNumber: Number(row.version_number),
    status: row.status as BlueprintVersion["status"],
    createdByUserId: nullableString(row.created_by_user_id),
    createdSource: row.created_source as BlueprintVersion["createdSource"],
    activatedByUserId: nullableString(row.activated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    activatedAt: nullableIso(row.activated_at),
    archivedAt: nullableIso(row.archived_at),
    activationReadinessSnapshot: parseReadinessSnapshot(row.activation_readiness_snapshot)
  };
}

function mapManifestItem(row: Record<string, unknown>): ManifestItem {
  return {
    id: String(row.id),
    blueprintVersionId: String(row.blueprint_version_id),
    componentType: row.component_type as ComponentType,
    componentRefId: nullableString(row.component_ref_id),
    componentVersionId: nullableString(row.component_version_id),
    snapshotMetadata: parseJsonObject(row.snapshot_metadata),
    contentFingerprint: nullableString(row.content_fingerprint),
    createdAt: toIso(row.created_at)
  };
}

function parseReadinessSnapshot(value: unknown): ReadinessResult | null {
  if (value === null || value === undefined) {
    return null;
  }

  return (typeof value === "string" ? JSON.parse(value) : value) as ReadinessResult;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  return (typeof value === "string" ? JSON.parse(value) : value) as Record<string, unknown>;
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
