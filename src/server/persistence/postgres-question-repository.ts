import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { QuestionRepository } from "../questions/repository";
import type {
  GlobalQuestion,
  NumericSettings,
  OrganizationAdoptedQuestion,
  OrganizationQuestion,
  QuestionCatalogItem,
  QuestionOption,
  QuestionSettings,
  ScaleSettings,
  UnifiedQuestionCatalogItem
} from "../questions/types";

export class PostgresQuestionRepository implements QuestionRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async lockOrganizationQuestions(organizationId: string) {
    await this.connection.query(
      "SELECT id FROM organization_questions WHERE organization_id = $1 FOR UPDATE",
      [organizationId]
    );
    await this.connection.query(
      "SELECT id FROM organization_adopted_questions WHERE organization_id = $1 FOR UPDATE",
      [organizationId]
    );
    await this.connection.query(
      "SELECT id FROM question_catalog_items WHERE organization_id = $1 FOR UPDATE",
      [organizationId]
    );
  }

  async lockGlobalQuestion(globalQuestionId: string) {
    await this.connection.query("SELECT id FROM global_questions WHERE id = $1 FOR UPDATE", [
      globalQuestionId
    ]);
  }

  async createGlobalQuestion(question: GlobalQuestion) {
    await this.connection.query(
      `
        INSERT INTO global_questions (
          id, code, normalized_code, title, question_text, description, type,
          category, instructions, options, settings, status, created_by_user_id,
          updated_by_user_id, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12,
          $13, $14, $15, $16
        )
      `,
      globalQuestionParams(question)
    );
  }

  async updateGlobalQuestion(question: GlobalQuestion) {
    await this.connection.query(
      `
        UPDATE global_questions
        SET code = $2,
            normalized_code = $3,
            title = $4,
            question_text = $5,
            description = $6,
            type = $7,
            category = $8,
            instructions = $9,
            options = $10::jsonb,
            settings = $11::jsonb,
            status = $12,
            created_by_user_id = $13,
            updated_by_user_id = $14,
            created_at = $15,
            updated_at = $16
        WHERE id = $1
      `,
      globalQuestionParams(question)
    );
  }

  async findGlobalQuestionById(globalQuestionId: string) {
    const result = await this.connection.query("SELECT * FROM global_questions WHERE id = $1", [
      globalQuestionId
    ]);
    return result.rows[0] ? mapGlobalQuestion(result.rows[0]) : null;
  }

  async findGlobalQuestionByNormalizedCode(normalizedCode: string) {
    const result = await this.connection.query(
      "SELECT * FROM global_questions WHERE normalized_code = $1",
      [normalizedCode]
    );
    return result.rows[0] ? mapGlobalQuestion(result.rows[0]) : null;
  }

  async listGlobalQuestions() {
    const result = await this.connection.query("SELECT * FROM global_questions ORDER BY title, id");
    return result.rows.map(mapGlobalQuestion);
  }

  async listAvailableGlobalsForOrganization(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT global_questions.*
        FROM global_questions
        LEFT JOIN organization_adopted_questions
          ON organization_adopted_questions.global_question_id = global_questions.id
          AND organization_adopted_questions.organization_id = $1
        WHERE global_questions.status = 'active'
          AND organization_adopted_questions.id IS NULL
        ORDER BY global_questions.title, global_questions.id
      `,
      [organizationId]
    );
    return result.rows.map(mapGlobalQuestion);
  }

  async createOrganizationQuestion(question: OrganizationQuestion) {
    await this.connection.query(
      `
        INSERT INTO organization_questions (
          id, organization_id, code, normalized_code, title, question_text,
          description, type, category, instructions, options, settings,
          competency_catalog_item_id, status, created_by_user_id, updated_by_user_id,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb,
          $13, $14, $15, $16, $17, $18
        )
      `,
      organizationQuestionParams(question)
    );
  }

  async updateOrganizationQuestion(question: OrganizationQuestion) {
    await this.connection.query(
      `
        UPDATE organization_questions
        SET code = $3,
            normalized_code = $4,
            title = $5,
            question_text = $6,
            description = $7,
            type = $8,
            category = $9,
            instructions = $10,
            options = $11::jsonb,
            settings = $12::jsonb,
            competency_catalog_item_id = $13,
            status = $14,
            created_by_user_id = $15,
            updated_by_user_id = $16,
            created_at = $17,
            updated_at = $18
        WHERE id = $1
          AND organization_id = $2
      `,
      organizationQuestionParams(question)
    );
  }

  async findOrganizationQuestionById(questionId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_questions WHERE id = $1",
      [questionId]
    );
    return result.rows[0] ? mapOrganizationQuestion(result.rows[0]) : null;
  }

  async findOrganizationQuestionByNormalizedCode(organizationId: string, normalizedCode: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organization_questions
        WHERE organization_id = $1
          AND normalized_code = $2
      `,
      [organizationId, normalizedCode]
    );
    return result.rows[0] ? mapOrganizationQuestion(result.rows[0]) : null;
  }

  async listOrganizationQuestions(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organization_questions
        WHERE organization_id = $1
        ORDER BY title, id
      `,
      [organizationId]
    );
    return result.rows.map(mapOrganizationQuestion);
  }

  async createAdoption(adoption: OrganizationAdoptedQuestion) {
    await this.connection.query(
      `
        INSERT INTO organization_adopted_questions (
          id, organization_id, global_question_id, status, adopted_by_user_id,
          updated_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      adoptionParams(adoption)
    );
  }

  async updateAdoption(adoption: OrganizationAdoptedQuestion) {
    await this.connection.query(
      `
        UPDATE organization_adopted_questions
        SET global_question_id = $3,
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
      "SELECT * FROM organization_adopted_questions WHERE id = $1",
      [adoptionId]
    );
    return result.rows[0] ? mapAdoption(result.rows[0]) : null;
  }

  async findAdoptionByOrganizationAndGlobal(organizationId: string, globalQuestionId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organization_adopted_questions
        WHERE organization_id = $1
          AND global_question_id = $2
      `,
      [organizationId, globalQuestionId]
    );
    return result.rows[0] ? mapAdoption(result.rows[0]) : null;
  }

  async listAdoptions(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM organization_adopted_questions
        WHERE organization_id = $1
        ORDER BY created_at, id
      `,
      [organizationId]
    );
    return result.rows.map(mapAdoption);
  }

  async createCatalogItem(item: QuestionCatalogItem) {
    await this.connection.query(
      `
        INSERT INTO question_catalog_items (
          id, organization_id, origin, global_question_id, organization_question_id,
          status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      catalogItemParams(item)
    );
  }

  async updateCatalogItem(item: QuestionCatalogItem) {
    await this.connection.query(
      `
        UPDATE question_catalog_items
        SET origin = $3,
            global_question_id = $4,
            organization_question_id = $5,
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
      "SELECT * FROM question_catalog_items WHERE id = $1",
      [itemId]
    );
    return result.rows[0] ? mapCatalogItem(result.rows[0]) : null;
  }

  async findCatalogItemForGlobal(organizationId: string, globalQuestionId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM question_catalog_items
        WHERE organization_id = $1
          AND origin = 'global'
          AND global_question_id = $2
      `,
      [organizationId, globalQuestionId]
    );
    return result.rows[0] ? mapCatalogItem(result.rows[0]) : null;
  }

  async findCatalogItemForOrganizationQuestion(
    organizationId: string,
    organizationQuestionId: string
  ) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM question_catalog_items
        WHERE organization_id = $1
          AND origin = 'organization'
          AND organization_question_id = $2
      `,
      [organizationId, organizationQuestionId]
    );
    return result.rows[0] ? mapCatalogItem(result.rows[0]) : null;
  }

  async listUnifiedCatalog(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT
          catalog.id AS question_catalog_item_id,
          catalog.origin,
          catalog.status,
          COALESCE(global_questions.code, organization_questions.code) AS code,
          COALESCE(global_questions.title, organization_questions.title) AS title,
          COALESCE(global_questions.question_text, organization_questions.question_text)
            AS question_text,
          COALESCE(global_questions.type, organization_questions.type) AS type,
          COALESCE(global_questions.category, organization_questions.category) AS category,
          COALESCE(global_questions.status, organization_questions.status) AS source_status,
          global_questions.status AS global_status,
          CASE WHEN catalog.origin = 'organization' THEN TRUE ELSE FALSE END AS editable,
          CASE WHEN global_questions.status = 'deprecated' THEN TRUE ELSE FALSE END AS deprecated,
          organization_questions.competency_catalog_item_id AS competency_catalog_item_id
        FROM question_catalog_items catalog
        LEFT JOIN organization_questions
          ON organization_questions.id = catalog.organization_question_id
          AND organization_questions.organization_id = catalog.organization_id
        LEFT JOIN organization_adopted_questions adoptions
          ON adoptions.organization_id = catalog.organization_id
          AND adoptions.global_question_id = catalog.global_question_id
        LEFT JOIN global_questions
          ON global_questions.id = catalog.global_question_id
        WHERE catalog.organization_id = $1
          AND catalog.status = 'active'
          AND (
            (
              catalog.origin = 'organization'
              AND organization_questions.status = 'active'
            )
            OR
            (
              catalog.origin = 'global'
              AND adoptions.status = 'active'
              AND global_questions.status IN ('active', 'deprecated')
            )
          )
        ORDER BY title, question_catalog_item_id
      `,
      [organizationId]
    );
    return result.rows.map(mapUnifiedCatalogItem);
  }
}

function globalQuestionParams(question: GlobalQuestion) {
  return [
    question.id,
    question.code,
    question.normalizedCode,
    question.title,
    question.questionText,
    question.description,
    question.type,
    question.category,
    question.instructions,
    JSON.stringify(question.options),
    JSON.stringify(question.settings),
    question.status,
    question.createdByUserId,
    question.updatedByUserId,
    question.createdAt,
    question.updatedAt
  ];
}

function organizationQuestionParams(question: OrganizationQuestion) {
  return [
    question.id,
    question.organizationId,
    question.code,
    question.normalizedCode,
    question.title,
    question.questionText,
    question.description,
    question.type,
    question.category,
    question.instructions,
    JSON.stringify(question.options),
    JSON.stringify(question.settings),
    question.competencyCatalogItemId,
    question.status,
    question.createdByUserId,
    question.updatedByUserId,
    question.createdAt,
    question.updatedAt
  ];
}

function adoptionParams(adoption: OrganizationAdoptedQuestion) {
  return [
    adoption.id,
    adoption.organizationId,
    adoption.globalQuestionId,
    adoption.status,
    adoption.adoptedByUserId,
    adoption.updatedByUserId,
    adoption.createdAt,
    adoption.updatedAt
  ];
}

function catalogItemParams(item: QuestionCatalogItem) {
  return [
    item.id,
    item.organizationId,
    item.origin,
    item.globalQuestionId,
    item.organizationQuestionId,
    item.status,
    item.createdAt,
    item.updatedAt
  ];
}

function mapGlobalQuestion(row: Record<string, unknown>): GlobalQuestion {
  return {
    ...mapQuestionContent(row),
    id: String(row.id),
    status: row.status as GlobalQuestion["status"],
    createdByUserId: nullableString(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapOrganizationQuestion(row: Record<string, unknown>): OrganizationQuestion {
  return {
    ...mapQuestionContent(row),
    id: String(row.id),
    organizationId: String(row.organization_id),
    competencyCatalogItemId: nullableString(row.competency_catalog_item_id),
    status: row.status as OrganizationQuestion["status"],
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: String(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapQuestionContent(row: Record<string, unknown>) {
  return {
    code: String(row.code),
    normalizedCode: String(row.normalized_code),
    title: String(row.title),
    questionText: String(row.question_text),
    description: String(row.description),
    type: row.type as GlobalQuestion["type"],
    category: row.category as GlobalQuestion["category"],
    instructions: String(row.instructions),
    options: normalizeArray<QuestionOption>(row.options),
    settings: normalizeSettings(row.settings)
  };
}

function mapAdoption(row: Record<string, unknown>): OrganizationAdoptedQuestion {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    globalQuestionId: String(row.global_question_id),
    status: row.status as OrganizationAdoptedQuestion["status"],
    adoptedByUserId: String(row.adopted_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapCatalogItem(row: Record<string, unknown>): QuestionCatalogItem {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    origin: row.origin as QuestionCatalogItem["origin"],
    globalQuestionId: nullableString(row.global_question_id),
    organizationQuestionId: nullableString(row.organization_question_id),
    status: row.status as QuestionCatalogItem["status"],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapUnifiedCatalogItem(row: Record<string, unknown>): UnifiedQuestionCatalogItem {
  return {
    questionCatalogItemId: String(row.question_catalog_item_id),
    origin: row.origin as UnifiedQuestionCatalogItem["origin"],
    code: String(row.code),
    title: String(row.title),
    questionText: String(row.question_text),
    type: row.type as UnifiedQuestionCatalogItem["type"],
    category: row.category as UnifiedQuestionCatalogItem["category"],
    status: row.status as UnifiedQuestionCatalogItem["status"],
    sourceStatus: row.source_status as UnifiedQuestionCatalogItem["sourceStatus"],
    globalStatus: nullableString(row.global_status) as UnifiedQuestionCatalogItem["globalStatus"],
    editable: Boolean(row.editable),
    deprecated: Boolean(row.deprecated),
    competencyCatalogItemId: nullableString(row.competency_catalog_item_id)
  };
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeSettings(value: unknown): QuestionSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as ScaleSettings | NumericSettings | Record<string, never>;
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}
