import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { JobProfileRepository } from "../job-profiles/repository";
import type {
  JobCertification,
  JobEducation,
  JobLanguage,
  JobProfile,
  JobProfileVersion,
  JobProfileVersionCompetency,
  JobRequirement,
  JobTool,
  OrderedText,
  SalaryRange,
  WorkSchedule
} from "../job-profiles/types";

export class PostgresJobProfileRepository implements JobProfileRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async lockJobProfiles(organizationId: string) {
    await this.connection.query(
      "SELECT id FROM job_profiles WHERE organization_id = $1 FOR UPDATE",
      [organizationId]
    );
  }

  async lockVersions(jobProfileId: string) {
    await this.connection.query(
      "SELECT id FROM job_profile_versions WHERE job_profile_id = $1 FOR UPDATE",
      [jobProfileId]
    );
  }

  async createJobProfile(profile: JobProfile) {
    await this.connection.query(
      `
        INSERT INTO job_profiles (
          id, organization_id, code, normalized_code, name, status,
          created_by_user_id, updated_by_user_id, created_at, updated_at, inactivated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      profileParams(profile)
    );
  }

  async updateJobProfile(profile: JobProfile) {
    await this.connection.query(
      `
        UPDATE job_profiles
        SET code = $3,
            normalized_code = $4,
            name = $5,
            status = $6,
            created_by_user_id = $7,
            updated_by_user_id = $8,
            created_at = $9,
            updated_at = $10,
            inactivated_at = $11
        WHERE id = $1
          AND organization_id = $2
      `,
      profileParams(profile)
    );
  }

  async findJobProfileById(jobProfileId: string) {
    const result = await this.connection.query("SELECT * FROM job_profiles WHERE id = $1", [
      jobProfileId
    ]);
    return result.rows[0] ? mapJobProfile(result.rows[0]) : null;
  }

  async findJobProfileByNormalizedCode(organizationId: string, normalizedCode: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_profiles
        WHERE organization_id = $1
          AND normalized_code = $2
      `,
      [organizationId, normalizedCode]
    );
    return result.rows[0] ? mapJobProfile(result.rows[0]) : null;
  }

  async listJobProfiles(organizationId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_profiles
        WHERE organization_id = $1
        ORDER BY name, id
      `,
      [organizationId]
    );
    return result.rows.map(mapJobProfile);
  }

  async listJobProfilesByStatus(organizationId: string, status: JobProfile["status"]) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_profiles
        WHERE organization_id = $1
          AND status = $2
        ORDER BY name, id
      `,
      [organizationId, status]
    );
    return result.rows.map(mapJobProfile);
  }

  async createVersion(version: JobProfileVersion) {
    await this.connection.query(
      `
        INSERT INTO job_profile_versions (
          id, job_profile_id, organization_id, version_number, status, title, mission, summary,
          responsibilities, requirements, education, certifications, languages, tools,
          work_model, work_schedule, travel_requirement, salary_range, notes,
          created_by_user_id, updated_by_user_id, published_by_user_id, discarded_by_user_id,
          created_at, updated_at, published_at, discarded_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb,
          $12::jsonb, $13::jsonb, $14::jsonb, $15, $16::jsonb, $17, $18::jsonb,
          $19, $20, $21, $22, $23, $24, $25, $26, $27
        )
      `,
      versionParams(version)
    );
  }

  async updateVersion(version: JobProfileVersion) {
    await this.connection.query(
      `
        UPDATE job_profile_versions
        SET version_number = $4,
            status = $5,
            title = $6,
            mission = $7,
            summary = $8,
            responsibilities = $9::jsonb,
            requirements = $10::jsonb,
            education = $11::jsonb,
            certifications = $12::jsonb,
            languages = $13::jsonb,
            tools = $14::jsonb,
            work_model = $15,
            work_schedule = $16::jsonb,
            travel_requirement = $17,
            salary_range = $18::jsonb,
            notes = $19,
            created_by_user_id = $20,
            updated_by_user_id = $21,
            published_by_user_id = $22,
            discarded_by_user_id = $23,
            created_at = $24,
            updated_at = $25,
            published_at = $26,
            discarded_at = $27
        WHERE id = $1
          AND job_profile_id = $2
          AND organization_id = $3
      `,
      versionParams(version)
    );
  }

  async findVersionById(versionId: string) {
    const result = await this.connection.query("SELECT * FROM job_profile_versions WHERE id = $1", [
      versionId
    ]);
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async findActiveDraft(jobProfileId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_profile_versions
        WHERE job_profile_id = $1
          AND status = 'draft'
          AND discarded_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [jobProfileId]
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async findPublished(jobProfileId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_profile_versions
        WHERE job_profile_id = $1
          AND status = 'published'
        LIMIT 1
      `,
      [jobProfileId]
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async listVersions(jobProfileId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_profile_versions
        WHERE job_profile_id = $1
        ORDER BY COALESCE(version_number, 0) DESC, created_at DESC, id DESC
      `,
      [jobProfileId]
    );
    return result.rows.map(mapVersion);
  }

  async maxVersionNumber(jobProfileId: string) {
    const result = await this.connection.query(
      `
        SELECT COALESCE(MAX(version_number), 0)::int AS max_version
        FROM job_profile_versions
        WHERE job_profile_id = $1
      `,
      [jobProfileId]
    );
    return Number(result.rows[0]?.max_version ?? 0);
  }

  async replaceCompetencies(versionId: string, competencies: JobProfileVersionCompetency[]) {
    await this.connection.query(
      "DELETE FROM job_profile_version_competencies WHERE job_profile_version_id = $1",
      [versionId]
    );

    for (const competency of competencies) {
      await this.connection.query(
        `
          INSERT INTO job_profile_version_competencies (
            id, organization_id, job_profile_version_id, competency_catalog_item_id,
            expected_level, required, display_order, note, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        competencyParams(competency)
      );
    }
  }

  async listCompetencies(versionId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM job_profile_version_competencies
        WHERE job_profile_version_id = $1
        ORDER BY display_order, id
      `,
      [versionId]
    );
    return result.rows.map(mapCompetency);
  }
}

function profileParams(profile: JobProfile) {
  return [
    profile.id,
    profile.organizationId,
    profile.code,
    profile.normalizedCode,
    profile.name,
    profile.status,
    profile.createdByUserId,
    profile.updatedByUserId,
    profile.createdAt,
    profile.updatedAt,
    profile.inactivatedAt
  ];
}

function versionParams(version: JobProfileVersion) {
  return [
    version.id,
    version.jobProfileId,
    version.organizationId,
    version.versionNumber,
    version.status,
    version.title,
    version.mission,
    version.summary,
    JSON.stringify(version.responsibilities),
    JSON.stringify(version.requirements),
    JSON.stringify(version.education),
    JSON.stringify(version.certifications),
    JSON.stringify(version.languages),
    JSON.stringify(version.tools),
    version.workModel,
    JSON.stringify(version.workSchedule),
    version.travelRequirement,
    version.salaryRange ? JSON.stringify(version.salaryRange) : null,
    version.notes,
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

function competencyParams(competency: JobProfileVersionCompetency) {
  return [
    competency.id,
    competency.organizationId,
    competency.jobProfileVersionId,
    competency.competencyCatalogItemId,
    competency.expectedLevel,
    competency.required,
    competency.displayOrder,
    competency.note,
    competency.createdAt,
    competency.updatedAt
  ];
}

function mapJobProfile(row: Record<string, unknown>): JobProfile {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    code: String(row.code),
    normalizedCode: String(row.normalized_code),
    name: String(row.name),
    status: row.status as JobProfile["status"],
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    inactivatedAt: nullableIso(row.inactivated_at)
  };
}

function mapVersion(row: Record<string, unknown>): JobProfileVersion {
  return {
    id: String(row.id),
    jobProfileId: String(row.job_profile_id),
    organizationId: String(row.organization_id),
    versionNumber: row.version_number === null ? null : Number(row.version_number),
    status: row.status as JobProfileVersion["status"],
    title: String(row.title),
    mission: String(row.mission),
    summary: String(row.summary),
    responsibilities: normalizeArray<OrderedText>(row.responsibilities),
    requirements: normalizeArray<JobRequirement>(row.requirements),
    education: normalizeObject<JobEducation>(row.education),
    certifications: normalizeArray<JobCertification>(row.certifications),
    languages: normalizeArray<JobLanguage>(row.languages),
    tools: normalizeArray<JobTool>(row.tools),
    workModel: row.work_model as JobProfileVersion["workModel"],
    workSchedule: normalizeObject<WorkSchedule>(row.work_schedule),
    travelRequirement: row.travel_requirement as JobProfileVersion["travelRequirement"],
    salaryRange: row.salary_range ? normalizeObject<SalaryRange>(row.salary_range) : null,
    notes: String(row.notes),
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

function mapCompetency(row: Record<string, unknown>): JobProfileVersionCompetency {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    jobProfileVersionId: String(row.job_profile_version_id),
    competencyCatalogItemId: String(row.competency_catalog_item_id),
    expectedLevel: Number(row.expected_level),
    required: Boolean(row.required),
    displayOrder: Number(row.display_order),
    note: nullableString(row.note),
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
