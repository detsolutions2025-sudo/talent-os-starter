import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { CandidateRepository } from "../candidates/repository";
import type {
  Candidate,
  CandidateConsent,
  CandidateInternalNote,
  CandidateStatus
} from "../candidates/types";

export class PostgresCandidateRepository implements CandidateRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async lockCandidates(organizationId: string) {
    await this.connection.query("SELECT id FROM candidates WHERE organization_id = $1 FOR UPDATE", [
      organizationId
    ]);
  }

  async createCandidate(candidate: Candidate) {
    await this.connection.query(
      `
        INSERT INTO candidates (
          id, organization_id, full_name, preferred_name, email, normalized_email, phone,
          secondary_phone, status, source, source_details, professional_summary, location,
          experiences, education, certifications, languages, professional_links,
          declared_competencies, availability, work_authorization, salary_expectation,
          creation_origin, created_by_user_id, updated_by_user_id, created_at, updated_at,
          inactivated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb,
          $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb,
          $20::jsonb, $21::jsonb, $22::jsonb, $23, $24, $25, $26, $27, $28
        )
      `,
      candidateParams(candidate)
    );
  }

  async createCandidateIfAbsent(candidate: Candidate) {
    const result = await this.connection.query(
      `
        INSERT INTO candidates (
          id, organization_id, full_name, preferred_name, email, normalized_email, phone,
          secondary_phone, status, source, source_details, professional_summary, location,
          experiences, education, certifications, languages, professional_links,
          declared_competencies, availability, work_authorization, salary_expectation,
          creation_origin, created_by_user_id, updated_by_user_id, created_at, updated_at,
          inactivated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb,
          $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb,
          $20::jsonb, $21::jsonb, $22::jsonb, $23, $24, $25, $26, $27, $28
        )
        ON CONFLICT (organization_id, normalized_email) DO NOTHING
        RETURNING id
      `,
      candidateParams(candidate)
    );
    return (result.rowCount ?? 0) > 0;
  }

  async updateCandidate(candidate: Candidate) {
    await this.connection.query(
      `
        UPDATE candidates
        SET full_name = $3,
            preferred_name = $4,
            email = $5,
            normalized_email = $6,
            phone = $7,
            secondary_phone = $8,
            status = $9,
            source = $10,
            source_details = $11,
            professional_summary = $12,
            location = $13::jsonb,
            experiences = $14::jsonb,
            education = $15::jsonb,
            certifications = $16::jsonb,
            languages = $17::jsonb,
            professional_links = $18::jsonb,
            declared_competencies = $19::jsonb,
            availability = $20::jsonb,
            work_authorization = $21::jsonb,
            salary_expectation = $22::jsonb,
            creation_origin = $23,
            created_by_user_id = $24,
            updated_by_user_id = $25,
            created_at = $26,
            updated_at = $27,
            inactivated_at = $28
        WHERE id = $1
          AND organization_id = $2
      `,
      candidateParams(candidate)
    );
  }

  async findCandidateById(candidateId: string) {
    const result = await this.connection.query("SELECT * FROM candidates WHERE id = $1", [
      candidateId
    ]);
    return result.rows[0] ? mapCandidate(result.rows[0]) : null;
  }

  async findCandidateByNormalizedEmail(organizationId: string, normalizedEmail: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM candidates
        WHERE organization_id = $1
          AND normalized_email = $2
      `,
      [organizationId, normalizedEmail]
    );
    return result.rows[0] ? mapCandidate(result.rows[0]) : null;
  }

  async listCandidates(organizationId: string, statuses: CandidateStatus[]) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM candidates
        WHERE organization_id = $1
          AND status = ANY($2::text[])
        ORDER BY updated_at DESC, full_name, id
      `,
      [organizationId, statuses]
    );
    return result.rows.map(mapCandidate);
  }

  async addConsent(consent: CandidateConsent) {
    await this.connection.query(
      `
        INSERT INTO candidate_consents (
          id, organization_id, candidate_id, status, consent_at, source, terms_version, purpose,
          expires_at, revoked_at, created_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      consentParams(consent)
    );
  }

  async listConsents(candidateId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM candidate_consents
        WHERE candidate_id = $1
        ORDER BY consent_at DESC, created_at DESC, id DESC
      `,
      [candidateId]
    );
    return result.rows.map(mapConsent);
  }

  async latestOperationalConsent(candidateId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM candidate_consents
        WHERE candidate_id = $1
        ORDER BY consent_at DESC, created_at DESC, id DESC
        LIMIT 1
      `,
      [candidateId]
    );
    return result.rows[0] ? mapConsent(result.rows[0]) : null;
  }

  async addInternalNote(note: CandidateInternalNote) {
    await this.connection.query(
      `
        INSERT INTO candidate_internal_notes (
          id, organization_id, candidate_id, content, created_by_user_id, updated_by_user_id,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        note.id,
        note.organizationId,
        note.candidateId,
        note.content,
        note.createdByUserId,
        note.updatedByUserId,
        note.createdAt,
        note.updatedAt
      ]
    );
  }

  async listInternalNotes(candidateId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM candidate_internal_notes
        WHERE candidate_id = $1
        ORDER BY created_at DESC, id DESC
      `,
      [candidateId]
    );
    return result.rows.map(mapInternalNote);
  }
}

function candidateParams(candidate: Candidate) {
  return [
    candidate.id,
    candidate.organizationId,
    candidate.fullName,
    candidate.preferredName,
    candidate.email,
    candidate.normalizedEmail,
    candidate.phone,
    candidate.secondaryPhone,
    candidate.status,
    candidate.source,
    candidate.sourceDetails,
    candidate.professionalSummary,
    JSON.stringify(candidate.location),
    JSON.stringify(candidate.experiences),
    JSON.stringify(candidate.education),
    JSON.stringify(candidate.certifications),
    JSON.stringify(candidate.languages),
    JSON.stringify(candidate.professionalLinks),
    JSON.stringify(candidate.declaredCompetencies),
    JSON.stringify(candidate.availability),
    JSON.stringify(candidate.workAuthorization),
    candidate.salaryExpectation ? JSON.stringify(candidate.salaryExpectation) : null,
    candidate.creationOrigin,
    candidate.createdByUserId,
    candidate.updatedByUserId,
    candidate.createdAt,
    candidate.updatedAt,
    candidate.inactivatedAt
  ];
}

function consentParams(consent: CandidateConsent) {
  return [
    consent.id,
    consent.organizationId,
    consent.candidateId,
    consent.status,
    consent.consentAt,
    consent.source,
    consent.termsVersion,
    consent.purpose,
    consent.expiresAt,
    consent.revokedAt,
    consent.createdByUserId,
    consent.createdAt,
    consent.updatedAt
  ];
}

function mapCandidate(row: Record<string, unknown>): Candidate {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    fullName: String(row.full_name),
    preferredName: nullableString(row.preferred_name),
    email: String(row.email),
    normalizedEmail: String(row.normalized_email),
    phone: nullableString(row.phone),
    secondaryPhone: nullableString(row.secondary_phone),
    status: row.status as Candidate["status"],
    source: row.source as Candidate["source"],
    sourceDetails: nullableString(row.source_details),
    professionalSummary: nullableString(row.professional_summary),
    location: normalizeObject(row.location),
    experiences: normalizeArray(row.experiences),
    education: normalizeArray(row.education),
    certifications: normalizeArray(row.certifications),
    languages: normalizeArray(row.languages),
    professionalLinks: normalizeArray(row.professional_links),
    declaredCompetencies: normalizeArray(row.declared_competencies),
    availability: normalizeObject(row.availability),
    workAuthorization: normalizeObject(row.work_authorization),
    salaryExpectation: row.salary_expectation ? normalizeObject(row.salary_expectation) : null,
    creationOrigin: row.creation_origin as Candidate["creationOrigin"],
    createdByUserId: nullableString(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    inactivatedAt: nullableIso(row.inactivated_at)
  };
}

function mapConsent(row: Record<string, unknown>): CandidateConsent {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateId: String(row.candidate_id),
    status: row.status as CandidateConsent["status"],
    consentAt: toIso(row.consent_at),
    source: String(row.source),
    termsVersion: String(row.terms_version),
    purpose: String(row.purpose),
    expiresAt: nullableIso(row.expires_at),
    revokedAt: nullableIso(row.revoked_at),
    createdByUserId: nullableString(row.created_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapInternalNote(row: Record<string, unknown>): CandidateInternalNote {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateId: String(row.candidate_id),
    content: String(row.content),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
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
