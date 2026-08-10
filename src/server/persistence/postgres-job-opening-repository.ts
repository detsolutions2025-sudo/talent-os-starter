import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { JobOpeningRepository } from "../job-openings/repository";
import type {
  JobOpening,
  JobOpeningStatus,
  JobOpeningVersion,
  JobOpeningVersionCompetency,
  JobOpeningVersionQuestion,
  LocationInfo,
  OrderedText,
  SalaryRange,
  WorkSchedule
} from "../job-openings/types";

export class PostgresJobOpeningRepository implements JobOpeningRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async lockJobOpenings(organizationId: string) {
    await this.connection.query(
      "SELECT id FROM job_openings WHERE organization_id = $1 FOR UPDATE",
      [organizationId]
    );
  }

  async lockJobOpening(jobOpeningId: string) {
    await this.connection.query("SELECT id FROM job_openings WHERE id = $1 FOR UPDATE", [
      jobOpeningId
    ]);
  }

  async lockVersions(jobOpeningId: string) {
    await this.connection.query(
      "SELECT id FROM job_opening_versions WHERE job_opening_id = $1 FOR UPDATE",
      [jobOpeningId]
    );
  }

  async createJobOpening(opening: JobOpening) {
    await this.connection.query(
      `
        INSERT INTO job_openings (
          id, organization_id, code, normalized_code, title, status, organizational_unit_id,
          is_public, public_show_salary, public_slug, public_published_at, public_unpublished_at,
          application_deadline, created_by_user_id, updated_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `,
      openingParams(opening)
    );
  }

  async updateJobOpening(opening: JobOpening) {
    await this.connection.query(
      `
        UPDATE job_openings
        SET code = $3,
            normalized_code = $4,
            title = $5,
            status = $6,
            organizational_unit_id = $7,
            is_public = $8,
            public_show_salary = $9,
            public_slug = $10,
            public_published_at = $11,
            public_unpublished_at = $12,
            application_deadline = $13,
            created_by_user_id = $14,
            updated_by_user_id = $15,
            created_at = $16,
            updated_at = $17
        WHERE id = $1
          AND organization_id = $2
      `,
      openingParams(opening)
    );
  }

  async findJobOpeningById(jobOpeningId: string) {
    const result = await this.connection.query("SELECT * FROM job_openings WHERE id = $1", [
      jobOpeningId
    ]);
    return result.rows[0] ? mapOpening(result.rows[0]) : null;
  }

  async findJobOpeningByNormalizedCode(organizationId: string, normalizedCode: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_openings
        WHERE organization_id = $1
          AND normalized_code = $2
      `,
      [organizationId, normalizedCode]
    );
    return result.rows[0] ? mapOpening(result.rows[0]) : null;
  }

  async findJobOpeningByPublicSlug(slug: string) {
    const result = await this.connection.query(
      "SELECT * FROM job_openings WHERE public_slug = $1",
      [slug]
    );
    return result.rows[0] ? mapOpening(result.rows[0]) : null;
  }

  async listJobOpenings(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_openings
        WHERE organization_id = $1
        ORDER BY updated_at DESC, title, id
      `,
      [organizationId]
    );
    return result.rows.map(mapOpening);
  }

  async listJobOpeningsByStatus(organizationId: string, statuses: JobOpeningStatus[]) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_openings
        WHERE organization_id = $1
          AND status = ANY($2::text[])
        ORDER BY updated_at DESC, title, id
      `,
      [organizationId, statuses]
    );
    return result.rows.map(mapOpening);
  }

  async createVersion(version: JobOpeningVersion) {
    await this.connection.query(
      `
        INSERT INTO job_opening_versions (
          id, job_opening_id, organization_id, version_number, status, job_profile_version_id,
          public_title, description, responsibilities, requirements, benefits, location,
          work_model, work_schedule, salary_range, positions_count, expected_start_date,
          internal_instructions, public_instructions, created_by_user_id, updated_by_user_id,
          published_by_user_id, discarded_by_user_id, created_at, updated_at, published_at,
          discarded_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb,
          $12::jsonb, $13, $14::jsonb, $15::jsonb, $16, $17, $18, $19, $20, $21,
          $22, $23, $24, $25, $26, $27
        )
      `,
      versionParams(version)
    );
  }

  async updateVersion(version: JobOpeningVersion) {
    await this.connection.query(
      `
        UPDATE job_opening_versions
        SET version_number = $4,
            status = $5,
            job_profile_version_id = $6,
            public_title = $7,
            description = $8,
            responsibilities = $9::jsonb,
            requirements = $10::jsonb,
            benefits = $11::jsonb,
            location = $12::jsonb,
            work_model = $13,
            work_schedule = $14::jsonb,
            salary_range = $15::jsonb,
            positions_count = $16,
            expected_start_date = $17,
            internal_instructions = $18,
            public_instructions = $19,
            created_by_user_id = $20,
            updated_by_user_id = $21,
            published_by_user_id = $22,
            discarded_by_user_id = $23,
            created_at = $24,
            updated_at = $25,
            published_at = $26,
            discarded_at = $27
        WHERE id = $1
          AND job_opening_id = $2
          AND organization_id = $3
      `,
      versionParams(version)
    );
  }

  async findVersionById(versionId: string) {
    const result = await this.connection.query("SELECT * FROM job_opening_versions WHERE id = $1", [
      versionId
    ]);
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async findActiveDraft(jobOpeningId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_opening_versions
        WHERE job_opening_id = $1
          AND status = 'draft'
          AND discarded_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [jobOpeningId]
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async findPublished(jobOpeningId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_opening_versions
        WHERE job_opening_id = $1
          AND status = 'published'
        LIMIT 1
      `,
      [jobOpeningId]
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async listVersions(jobOpeningId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_opening_versions
        WHERE job_opening_id = $1
        ORDER BY COALESCE(version_number, 0) DESC, created_at DESC, id DESC
      `,
      [jobOpeningId]
    );
    return result.rows.map(mapVersion);
  }

  async maxVersionNumber(jobOpeningId: string) {
    const result = await this.connection.query(
      `
        SELECT COALESCE(MAX(version_number), 0)::int AS max_version
        FROM job_opening_versions
        WHERE job_opening_id = $1
      `,
      [jobOpeningId]
    );
    return Number(result.rows[0]?.max_version ?? 0);
  }

  async replaceCompetencies(versionId: string, competencies: JobOpeningVersionCompetency[]) {
    await this.connection.query(
      "DELETE FROM job_opening_version_competencies WHERE job_opening_version_id = $1",
      [versionId]
    );
    for (const competency of competencies) {
      await this.connection.query(
        `
          INSERT INTO job_opening_version_competencies (
            id, organization_id, job_opening_version_id, competency_catalog_item_id,
            expected_level, required, weight, display_order, note, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        competencyParams(competency)
      );
    }
  }

  async listCompetencies(versionId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_opening_version_competencies
        WHERE job_opening_version_id = $1
        ORDER BY display_order, id
      `,
      [versionId]
    );
    return result.rows.map(mapCompetency);
  }

  async replaceQuestions(versionId: string, questions: JobOpeningVersionQuestion[]) {
    await this.connection.query(
      "DELETE FROM job_opening_version_questions WHERE job_opening_version_id = $1",
      [versionId]
    );
    for (const question of questions) {
      await this.connection.query(
        `
          INSERT INTO job_opening_version_questions (
            id, organization_id, job_opening_version_id, question_catalog_item_id,
            required, display_order, weight, context_settings, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
        `,
        questionParams(question)
      );
    }
  }

  async listQuestions(versionId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_opening_version_questions
        WHERE job_opening_version_id = $1
        ORDER BY display_order, id
      `,
      [versionId]
    );
    return result.rows.map(mapQuestion);
  }
}

function openingParams(opening: JobOpening) {
  return [
    opening.id,
    opening.organizationId,
    opening.code,
    opening.normalizedCode,
    opening.title,
    opening.status,
    opening.organizationalUnitId,
    opening.isPublic,
    opening.publicShowSalary,
    opening.publicSlug,
    opening.publicPublishedAt,
    opening.publicUnpublishedAt,
    opening.applicationDeadline,
    opening.createdByUserId,
    opening.updatedByUserId,
    opening.createdAt,
    opening.updatedAt
  ];
}

function versionParams(version: JobOpeningVersion) {
  return [
    version.id,
    version.jobOpeningId,
    version.organizationId,
    version.versionNumber,
    version.status,
    version.jobProfileVersionId,
    version.publicTitle,
    version.description,
    JSON.stringify(version.responsibilities),
    JSON.stringify(version.requirements),
    JSON.stringify(version.benefits),
    JSON.stringify(version.location),
    version.workModel,
    JSON.stringify(version.workSchedule),
    version.salaryRange ? JSON.stringify(version.salaryRange) : null,
    version.positionsCount,
    version.expectedStartDate,
    version.internalInstructions,
    version.publicInstructions,
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

function competencyParams(competency: JobOpeningVersionCompetency) {
  return [
    competency.id,
    competency.organizationId,
    competency.jobOpeningVersionId,
    competency.competencyCatalogItemId,
    competency.expectedLevel,
    competency.required,
    competency.weight,
    competency.displayOrder,
    competency.note,
    competency.createdAt,
    competency.updatedAt
  ];
}

function questionParams(question: JobOpeningVersionQuestion) {
  return [
    question.id,
    question.organizationId,
    question.jobOpeningVersionId,
    question.questionCatalogItemId,
    question.required,
    question.displayOrder,
    question.weight,
    JSON.stringify(question.contextSettings),
    question.createdAt,
    question.updatedAt
  ];
}

function mapOpening(row: Record<string, unknown>): JobOpening {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    code: String(row.code),
    normalizedCode: String(row.normalized_code),
    title: String(row.title),
    status: row.status as JobOpening["status"],
    organizationalUnitId: nullableString(row.organizational_unit_id),
    isPublic: Boolean(row.is_public),
    publicShowSalary: Boolean(row.public_show_salary),
    publicSlug: nullableString(row.public_slug),
    publicPublishedAt: nullableIso(row.public_published_at),
    publicUnpublishedAt: nullableIso(row.public_unpublished_at),
    applicationDeadline: nullableIso(row.application_deadline),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapVersion(row: Record<string, unknown>): JobOpeningVersion {
  return {
    id: String(row.id),
    jobOpeningId: String(row.job_opening_id),
    organizationId: String(row.organization_id),
    versionNumber: row.version_number === null ? null : Number(row.version_number),
    status: row.status as JobOpeningVersion["status"],
    jobProfileVersionId: String(row.job_profile_version_id),
    publicTitle: String(row.public_title),
    description: String(row.description),
    responsibilities: normalizeArray<OrderedText>(row.responsibilities),
    requirements: normalizeArray<OrderedText>(row.requirements),
    benefits: normalizeArray<OrderedText>(row.benefits),
    location: normalizeObject<LocationInfo>(row.location),
    workModel: row.work_model as JobOpeningVersion["workModel"],
    workSchedule: normalizeObject<WorkSchedule>(row.work_schedule),
    salaryRange: row.salary_range ? normalizeObject<SalaryRange>(row.salary_range) : null,
    positionsCount: Number(row.positions_count),
    expectedStartDate: nullableIso(row.expected_start_date),
    internalInstructions: String(row.internal_instructions),
    publicInstructions: String(row.public_instructions),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    publishedByUserId: nullableString(row.published_by_user_id),
    discardedByUserId: nullableString(row.discarded_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    publishedAt: nullableIso(row.published_at),
    discardedAt: nullableIso(row.discarded_at)
  };
}

function mapCompetency(row: Record<string, unknown>): JobOpeningVersionCompetency {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    competencyCatalogItemId: String(row.competency_catalog_item_id),
    expectedLevel: Number(row.expected_level),
    required: Boolean(row.required),
    weight: Number(row.weight),
    displayOrder: Number(row.display_order),
    note: nullableString(row.note),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapQuestion(row: Record<string, unknown>): JobOpeningVersionQuestion {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    questionCatalogItemId: String(row.question_catalog_item_id),
    required: Boolean(row.required),
    displayOrder: Number(row.display_order),
    weight: row.weight === null ? null : Number(row.weight),
    contextSettings: normalizeObject<Record<string, unknown>>(row.context_settings),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeObject<T>(value: unknown): T {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : ({} as T);
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
