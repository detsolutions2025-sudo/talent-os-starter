import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { CompetencyRepository } from "../competencies/repository";
import type {
  CompetencyCatalogItem,
  CompetencyEvidence,
  CompetencyExample,
  GlobalCompetency,
  OrganizationAdoptedCompetency,
  OrganizationCompetency,
  ProficiencyLevel,
  UnifiedCatalogItem
} from "../competencies/types";

export class PostgresCompetencyRepository implements CompetencyRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async lockOrganizationCompetencies(organizationId: string) {
    await this.connection.query(
      "SELECT id FROM organization_competencies WHERE organization_id = $1 FOR UPDATE",
      [organizationId]
    );
    await this.connection.query(
      "SELECT id FROM organization_adopted_competencies WHERE organization_id = $1 FOR UPDATE",
      [organizationId]
    );
    await this.connection.query(
      "SELECT id FROM competency_catalog_items WHERE organization_id = $1 FOR UPDATE",
      [organizationId]
    );
  }

  async lockGlobalCompetency(globalCompetencyId: string) {
    await this.connection.query("SELECT id FROM global_competencies WHERE id = $1 FOR UPDATE", [
      globalCompetencyId
    ]);
  }

  async createGlobalCompetency(competency: GlobalCompetency) {
    await this.connection.query(
      `
        INSERT INTO global_competencies (
          id, code, normalized_code, name, category, definition,
          positive_evidences, negative_evidences, practical_examples,
          proficiency_levels, status, created_by_user_id, updated_by_user_id,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb,
          $11, $12, $13, $14, $15
        )
      `,
      competencyParams(competency)
    );
  }

  async updateGlobalCompetency(competency: GlobalCompetency) {
    await this.connection.query(
      `
        UPDATE global_competencies
        SET code = $2,
            normalized_code = $3,
            name = $4,
            category = $5,
            definition = $6,
            positive_evidences = $7::jsonb,
            negative_evidences = $8::jsonb,
            practical_examples = $9::jsonb,
            proficiency_levels = $10::jsonb,
            status = $11,
            created_by_user_id = $12,
            updated_by_user_id = $13,
            created_at = $14,
            updated_at = $15
        WHERE id = $1
      `,
      competencyParams(competency)
    );
  }

  async findGlobalCompetencyById(globalCompetencyId: string) {
    const result = await this.connection.query("SELECT * FROM global_competencies WHERE id = $1", [
      globalCompetencyId
    ]);
    return result.rows[0] ? mapGlobalCompetency(result.rows[0]) : null;
  }

  async findGlobalCompetencyByNormalizedCode(normalizedCode: string) {
    const result = await this.connection.query(
      "SELECT * FROM global_competencies WHERE normalized_code = $1",
      [normalizedCode]
    );
    return result.rows[0] ? mapGlobalCompetency(result.rows[0]) : null;
  }

  async listGlobalCompetencies() {
    const result = await this.connection.query(
      "SELECT * FROM global_competencies ORDER BY name, id"
    );
    return result.rows.map(mapGlobalCompetency);
  }

  async listAvailableGlobalsForOrganization(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT global_competencies.*
        FROM global_competencies
        LEFT JOIN organization_adopted_competencies
          ON organization_adopted_competencies.global_competency_id = global_competencies.id
          AND organization_adopted_competencies.organization_id = $1
        WHERE global_competencies.status = 'active'
          AND organization_adopted_competencies.id IS NULL
        ORDER BY global_competencies.name, global_competencies.id
      `,
      [organizationId]
    );
    return result.rows.map(mapGlobalCompetency);
  }

  async createOrganizationCompetency(competency: OrganizationCompetency) {
    await this.connection.query(
      `
        INSERT INTO organization_competencies (
          id, organization_id, code, normalized_code, name, category, definition,
          positive_evidences, negative_evidences, practical_examples,
          proficiency_levels, status, created_by_user_id, updated_by_user_id,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb,
          $11::jsonb, $12, $13, $14, $15, $16
        )
      `,
      organizationCompetencyParams(competency)
    );
  }

  async updateOrganizationCompetency(competency: OrganizationCompetency) {
    await this.connection.query(
      `
        UPDATE organization_competencies
        SET code = $3,
            normalized_code = $4,
            name = $5,
            category = $6,
            definition = $7,
            positive_evidences = $8::jsonb,
            negative_evidences = $9::jsonb,
            practical_examples = $10::jsonb,
            proficiency_levels = $11::jsonb,
            status = $12,
            created_by_user_id = $13,
            updated_by_user_id = $14,
            created_at = $15,
            updated_at = $16
        WHERE id = $1
          AND organization_id = $2
      `,
      organizationCompetencyParams(competency)
    );
  }

  async findOrganizationCompetencyById(competencyId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_competencies WHERE id = $1",
      [competencyId]
    );
    return result.rows[0] ? mapOrganizationCompetency(result.rows[0]) : null;
  }

  async findOrganizationCompetencyByNormalizedCode(organizationId: string, normalizedCode: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organization_competencies
        WHERE organization_id = $1
          AND normalized_code = $2
      `,
      [organizationId, normalizedCode]
    );
    return result.rows[0] ? mapOrganizationCompetency(result.rows[0]) : null;
  }

  async listOrganizationCompetencies(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organization_competencies
        WHERE organization_id = $1
        ORDER BY name, id
      `,
      [organizationId]
    );
    return result.rows.map(mapOrganizationCompetency);
  }

  async createAdoption(adoption: OrganizationAdoptedCompetency) {
    await this.connection.query(
      `
        INSERT INTO organization_adopted_competencies (
          id, organization_id, global_competency_id, status, adopted_by_user_id,
          updated_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      adoptionParams(adoption)
    );
  }

  async updateAdoption(adoption: OrganizationAdoptedCompetency) {
    await this.connection.query(
      `
        UPDATE organization_adopted_competencies
        SET global_competency_id = $3,
            status = $4,
            adopted_by_user_id = $5,
            updated_by_user_id = $6,
            created_at = $7,
            updated_at = $8
        WHERE id = $1
          AND organization_id = $2
      `,
      adoptionParams(adoption)
    );
  }

  async findAdoptionById(adoptionId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_adopted_competencies WHERE id = $1",
      [adoptionId]
    );
    return result.rows[0] ? mapAdoption(result.rows[0]) : null;
  }

  async findAdoptionByOrganizationAndGlobal(organizationId: string, globalCompetencyId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organization_adopted_competencies
        WHERE organization_id = $1
          AND global_competency_id = $2
      `,
      [organizationId, globalCompetencyId]
    );
    return result.rows[0] ? mapAdoption(result.rows[0]) : null;
  }

  async listAdoptions(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organization_adopted_competencies
        WHERE organization_id = $1
        ORDER BY created_at, id
      `,
      [organizationId]
    );
    return result.rows.map(mapAdoption);
  }

  async createCatalogItem(item: CompetencyCatalogItem) {
    await this.connection.query(
      `
        INSERT INTO competency_catalog_items (
          id, organization_id, origin, global_competency_id, organization_competency_id,
          status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      catalogItemParams(item)
    );
  }

  async updateCatalogItem(item: CompetencyCatalogItem) {
    await this.connection.query(
      `
        UPDATE competency_catalog_items
        SET origin = $3,
            global_competency_id = $4,
            organization_competency_id = $5,
            status = $6,
            created_at = $7,
            updated_at = $8
        WHERE id = $1
          AND organization_id = $2
      `,
      catalogItemParams(item)
    );
  }

  async findCatalogItemById(itemId: string) {
    const result = await this.connection.query(
      "SELECT * FROM competency_catalog_items WHERE id = $1",
      [itemId]
    );
    return result.rows[0] ? mapCatalogItem(result.rows[0]) : null;
  }

  async findCatalogItemForGlobal(organizationId: string, globalCompetencyId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM competency_catalog_items
        WHERE organization_id = $1
          AND origin = 'global'
          AND global_competency_id = $2
      `,
      [organizationId, globalCompetencyId]
    );
    return result.rows[0] ? mapCatalogItem(result.rows[0]) : null;
  }

  async findCatalogItemForOrganizationCompetency(
    organizationId: string,
    organizationCompetencyId: string
  ) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM competency_catalog_items
        WHERE organization_id = $1
          AND origin = 'organization'
          AND organization_competency_id = $2
      `,
      [organizationId, organizationCompetencyId]
    );
    return result.rows[0] ? mapCatalogItem(result.rows[0]) : null;
  }

  async listUnifiedCatalog(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT
          catalog.id AS competency_catalog_item_id,
          catalog.origin,
          catalog.status,
          COALESCE(global_competencies.code, organization_competencies.code) AS code,
          COALESCE(global_competencies.name, organization_competencies.name) AS name,
          COALESCE(global_competencies.category, organization_competencies.category) AS category,
          COALESCE(global_competencies.status, organization_competencies.status) AS source_status,
          global_competencies.status AS global_status,
          CASE WHEN catalog.origin = 'organization' THEN TRUE ELSE FALSE END AS editable,
          CASE WHEN global_competencies.status = 'deprecated' THEN TRUE ELSE FALSE END AS deprecated
        FROM competency_catalog_items catalog
        LEFT JOIN organization_competencies
          ON organization_competencies.id = catalog.organization_competency_id
          AND organization_competencies.organization_id = catalog.organization_id
        LEFT JOIN organization_adopted_competencies adoptions
          ON adoptions.organization_id = catalog.organization_id
          AND adoptions.global_competency_id = catalog.global_competency_id
        LEFT JOIN global_competencies
          ON global_competencies.id = catalog.global_competency_id
        WHERE catalog.organization_id = $1
          AND catalog.status = 'active'
          AND (
            (
              catalog.origin = 'organization'
              AND organization_competencies.status = 'active'
            )
            OR
            (
              catalog.origin = 'global'
              AND adoptions.status = 'active'
              AND global_competencies.status IN ('active', 'deprecated')
            )
          )
        ORDER BY name, competency_catalog_item_id
      `,
      [organizationId]
    );
    return result.rows.map(mapUnifiedCatalogItem);
  }
}

function competencyParams(competency: GlobalCompetency) {
  return [
    competency.id,
    competency.code,
    competency.normalizedCode,
    competency.name,
    competency.category,
    competency.definition,
    JSON.stringify(competency.positiveEvidences),
    JSON.stringify(competency.negativeEvidences),
    JSON.stringify(competency.practicalExamples),
    JSON.stringify(competency.proficiencyLevels),
    competency.status,
    competency.createdByUserId,
    competency.updatedByUserId,
    competency.createdAt,
    competency.updatedAt
  ];
}

function organizationCompetencyParams(competency: OrganizationCompetency) {
  return [
    competency.id,
    competency.organizationId,
    competency.code,
    competency.normalizedCode,
    competency.name,
    competency.category,
    competency.definition,
    JSON.stringify(competency.positiveEvidences),
    JSON.stringify(competency.negativeEvidences),
    JSON.stringify(competency.practicalExamples),
    JSON.stringify(competency.proficiencyLevels),
    competency.status,
    competency.createdByUserId,
    competency.updatedByUserId,
    competency.createdAt,
    competency.updatedAt
  ];
}

function adoptionParams(adoption: OrganizationAdoptedCompetency) {
  return [
    adoption.id,
    adoption.organizationId,
    adoption.globalCompetencyId,
    adoption.status,
    adoption.adoptedByUserId,
    adoption.updatedByUserId,
    adoption.createdAt,
    adoption.updatedAt
  ];
}

function catalogItemParams(item: CompetencyCatalogItem) {
  return [
    item.id,
    item.organizationId,
    item.origin,
    item.globalCompetencyId,
    item.organizationCompetencyId,
    item.status,
    item.createdAt,
    item.updatedAt
  ];
}

function mapGlobalCompetency(row: Record<string, unknown>): GlobalCompetency {
  return {
    ...mapCompetencyContent(row),
    id: String(row.id),
    status: row.status as GlobalCompetency["status"],
    createdByUserId: nullableString(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapOrganizationCompetency(row: Record<string, unknown>): OrganizationCompetency {
  return {
    ...mapCompetencyContent(row),
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: row.status as OrganizationCompetency["status"],
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: String(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapCompetencyContent(row: Record<string, unknown>) {
  return {
    code: String(row.code),
    normalizedCode: String(row.normalized_code),
    name: String(row.name),
    category: row.category as GlobalCompetency["category"],
    definition: String(row.definition),
    positiveEvidences: normalizeArray<CompetencyEvidence>(row.positive_evidences),
    negativeEvidences: normalizeArray<CompetencyEvidence>(row.negative_evidences),
    practicalExamples: normalizeArray<CompetencyExample>(row.practical_examples),
    proficiencyLevels: normalizeArray<ProficiencyLevel>(row.proficiency_levels)
  };
}

function mapAdoption(row: Record<string, unknown>): OrganizationAdoptedCompetency {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    globalCompetencyId: String(row.global_competency_id),
    status: row.status as OrganizationAdoptedCompetency["status"],
    adoptedByUserId: String(row.adopted_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapCatalogItem(row: Record<string, unknown>): CompetencyCatalogItem {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    origin: row.origin as CompetencyCatalogItem["origin"],
    globalCompetencyId: nullableString(row.global_competency_id),
    organizationCompetencyId: nullableString(row.organization_competency_id),
    status: row.status as CompetencyCatalogItem["status"],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapUnifiedCatalogItem(row: Record<string, unknown>): UnifiedCatalogItem {
  return {
    competencyCatalogItemId: String(row.competency_catalog_item_id),
    origin: row.origin as UnifiedCatalogItem["origin"],
    code: String(row.code),
    name: String(row.name),
    category: row.category as UnifiedCatalogItem["category"],
    status: row.status as UnifiedCatalogItem["status"],
    sourceStatus: row.source_status as UnifiedCatalogItem["sourceStatus"],
    globalStatus: nullableString(row.global_status) as UnifiedCatalogItem["globalStatus"],
    editable: Boolean(row.editable),
    deprecated: Boolean(row.deprecated)
  };
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}
