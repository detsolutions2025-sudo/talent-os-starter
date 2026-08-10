import { badRequest } from "../core/errors";
import type {
  CandidateAvailability,
  CandidateCertification,
  CandidateConsentInput,
  CandidateEducation,
  CandidateExperience,
  CandidateInput,
  CandidateLanguage,
  CandidateLocation,
  CandidatePatchInput,
  CandidateProfessionalLink,
  CandidateSalaryExpectation,
  CandidateSource,
  CandidateWorkAuthorization,
  ConsentStatus
} from "./types";

const candidateSources = new Set<CandidateSource>([
  "career_page",
  "referral",
  "recruiter",
  "agency",
  "linkedin",
  "job_board",
  "event",
  "import",
  "manual",
  "other"
]);
const educationLevels = new Set([
  "elementary",
  "high_school",
  "technical",
  "undergraduate",
  "postgraduate",
  "masters",
  "doctorate",
  "other"
]);
const languageLevels = new Set(["basic", "intermediate", "advanced", "fluent", "native"]);
const linkTypes = new Set(["linkedin", "github", "portfolio", "website", "other"]);
const workModels = new Set(["onsite", "hybrid", "remote", "flexible"]);
const salaryPeriodicities = new Set(["monthly", "hourly", "annual"]);
const consentStatuses = new Set<ConsentStatus>(["granted", "revoked", "expired", "pending"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+0-9()\-\s]{6,30}$/;

export function normalizeCandidateEmail(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

// Separada de `validateCreateCandidate` (que agrega o consentimento) para que a criacao
// publica (Fase 17, SPEC-020) possa reutilizar exatamente as mesmas regras de validacao do
// Candidate sem ser forcada a moldar um objeto de consentimento no formato interno --
// consentimento publico e registrado em um passo transacional proprio (ver
// `CandidateService.addPublicConsent`), nunca embutido na criacao do Candidate.
export function validateCreateCandidateWithoutConsent(input: CandidateInput) {
  return {
    fullName: validateFullName(input.fullName ?? input.full_name),
    preferredName: validateOptionalText(input.preferredName ?? input.preferred_name, 100),
    email: validateEmail(input.email),
    normalizedEmail: normalizeCandidateEmail(input.email),
    phone: validateOptionalPhone(input.phone),
    secondaryPhone: validateOptionalPhone(input.secondaryPhone ?? input.secondary_phone),
    source: validateSource(input.source),
    sourceDetails: validateOptionalText(input.sourceDetails ?? input.source_details, 500),
    professionalSummary: validateOptionalText(
      input.professionalSummary ?? input.professional_summary,
      10000
    ),
    location: validateLocation(input.location),
    experiences: validateExperiences(input.experiences),
    education: validateEducation(input.education),
    certifications: validateCertifications(input.certifications),
    languages: validateLanguages(input.languages),
    professionalLinks: validateProfessionalLinks(
      input.professionalLinks ?? input.professional_links
    ),
    declaredCompetencies: validateDeclaredCompetencies(
      input.declaredCompetencies ?? input.declared_competencies
    ),
    availability: validateAvailability(input.availability),
    workAuthorization: validateWorkAuthorization(
      input.workAuthorization ?? input.work_authorization
    ),
    salaryExpectation: validateSalaryExpectation(
      input.salaryExpectation ?? input.salary_expectation
    )
  };
}

export function validateCreateCandidate(input: CandidateInput) {
  return {
    ...validateCreateCandidateWithoutConsent(input),
    consent: validateConsentInput(input.consent)
  };
}

export function validateUpdateCandidate(input: CandidatePatchInput) {
  return {
    fullName:
      input.fullName === undefined && input.full_name === undefined
        ? undefined
        : validateFullName(input.fullName ?? input.full_name),
    preferredName:
      input.preferredName === undefined && input.preferred_name === undefined
        ? undefined
        : validateOptionalText(input.preferredName ?? input.preferred_name, 100),
    phone: input.phone === undefined ? undefined : validateOptionalPhone(input.phone),
    secondaryPhone:
      input.secondaryPhone === undefined && input.secondary_phone === undefined
        ? undefined
        : validateOptionalPhone(input.secondaryPhone ?? input.secondary_phone),
    source: input.source === undefined ? undefined : validateSource(input.source),
    sourceDetails:
      input.sourceDetails === undefined && input.source_details === undefined
        ? undefined
        : validateOptionalText(input.sourceDetails ?? input.source_details, 500),
    professionalSummary:
      input.professionalSummary === undefined && input.professional_summary === undefined
        ? undefined
        : validateOptionalText(input.professionalSummary ?? input.professional_summary, 10000),
    location: input.location === undefined ? undefined : validateLocation(input.location),
    experiences:
      input.experiences === undefined ? undefined : validateExperiences(input.experiences),
    education: input.education === undefined ? undefined : validateEducation(input.education),
    certifications:
      input.certifications === undefined ? undefined : validateCertifications(input.certifications),
    languages: input.languages === undefined ? undefined : validateLanguages(input.languages),
    professionalLinks:
      input.professionalLinks === undefined && input.professional_links === undefined
        ? undefined
        : validateProfessionalLinks(input.professionalLinks ?? input.professional_links),
    declaredCompetencies:
      input.declaredCompetencies === undefined && input.declared_competencies === undefined
        ? undefined
        : validateDeclaredCompetencies(input.declaredCompetencies ?? input.declared_competencies),
    availability:
      input.availability === undefined ? undefined : validateAvailability(input.availability),
    workAuthorization:
      input.workAuthorization === undefined && input.work_authorization === undefined
        ? undefined
        : validateWorkAuthorization(input.workAuthorization ?? input.work_authorization),
    salaryExpectation:
      input.salaryExpectation === undefined && input.salary_expectation === undefined
        ? undefined
        : validateSalaryExpectation(input.salaryExpectation ?? input.salary_expectation)
  };
}

export function validateEmail(value: unknown) {
  const email = String(value ?? "").trim();
  if (!emailPattern.test(email) || email.length > 320) {
    throw badRequest("candidate_email_invalid", "Candidate email is invalid.");
  }
  return email;
}

// Reservado exclusivamente ao fluxo publico da SPEC-020 (SPEC-011 v1.2, secao 8.14.1,
// RN-061 a RN-065): unico valor de `source` que a constraint fisica de `candidate_consents`
// (migration 0018) aceita com `created_by_user_id` nulo. Correcao pontual (revisao final):
// o fluxo interno tambem precisa recusar esse valor na camada de aplicacao -- confiar apenas
// na constraint do banco produziria um erro de violacao de CHECK generico e menos claro do
// que uma validacao de negocio explicita.
export const PUBLIC_CONSENT_SOURCE = "public_application";

export function validateConsentInput(
  value: unknown,
  options: { allowPublicOrigin?: boolean } = {}
): Required<CandidateConsentInput> {
  const entry = normalizeObject(value, "consent");
  const status = String(entry.status ?? "");
  const consentAt = validateOptionalDate(entry.consentAt ?? entry.consent_at, "consent_at");
  const source = validateText(entry.source, 200, "consent_source");
  if (source === PUBLIC_CONSENT_SOURCE && !options.allowPublicOrigin) {
    // Nunca alcancavel pelo fluxo publico legitimo (que nunca aceita `source` do cliente --
    // ver `public-applications/validation.ts`), apenas por um User interno tentando fornecer
    // esse valor manualmente via criacao/atualizacao de Consent.
    throw badRequest(
      "candidate_consent_source_reserved",
      "This consent source is reserved for the public application flow."
    );
  }
  const termsVersion = validateText(
    entry.termsVersion ?? entry.terms_version,
    100,
    "terms_version"
  );
  const purpose = validateText(entry.purpose, 500, "purpose");
  const expiresAt = validateOptionalDate(entry.expiresAt ?? entry.expires_at, "expires_at");
  if (!consentStatuses.has(status as ConsentStatus)) {
    throw badRequest("candidate_consent_status_invalid", "Consent status is invalid.");
  }
  return {
    status,
    consentAt: consentAt ?? new Date().toISOString(),
    consent_at: consentAt ?? new Date().toISOString(),
    source,
    termsVersion,
    terms_version: termsVersion,
    purpose,
    expiresAt,
    expires_at: expiresAt
  };
}

export function requireAdminReason(reason: unknown) {
  return validateText(reason, 500, "admin_reason");
}

export function validateInternalNote(value: unknown) {
  return validateText(value, 10000, "internal_note");
}

function validateFullName(value: unknown) {
  const text = String(value ?? "").trim();
  if (text.length < 2 || text.length > 200) {
    throw badRequest("candidate_full_name_invalid", "Candidate full name is invalid.");
  }
  return text;
}

function validateSource(value: unknown): CandidateSource {
  const source = String(value ?? "");
  if (!candidateSources.has(source as CandidateSource)) {
    throw badRequest("candidate_source_invalid", "Candidate source is invalid.");
  }
  return source as CandidateSource;
}

function validateOptionalPhone(value: unknown) {
  const phone = normalizeText(value);
  if (phone && !phonePattern.test(phone)) {
    throw badRequest("candidate_phone_invalid", "Candidate phone is invalid.");
  }
  return phone;
}

function validateLocation(value: unknown): CandidateLocation {
  const entry = optionalObject(value, "location");
  return {
    country: validateOptionalText(entry.country, 100) ?? "",
    state: validateOptionalText(entry.state ?? entry.region, 100) ?? "",
    city: validateOptionalText(entry.city, 100) ?? "",
    neighborhood: validateOptionalText(entry.neighborhood, 100) ?? "",
    postalCode: validateOptionalText(entry.postalCode ?? entry.postal_code, 30) ?? "",
    address: validateOptionalText(entry.address, 500) ?? ""
  };
}

function validateExperiences(value: unknown): CandidateExperience[] {
  const items = optionalArray(value, "experiences", 50);
  return items.map((item) => {
    const entry = normalizeObject(item, "experience");
    const startDate = validateRequiredDate(entry.startDate ?? entry.start_date, "start_date");
    const endDate = validateOptionalDate(entry.endDate ?? entry.end_date, "end_date");
    const current = Boolean(entry.current);
    if (endDate && new Date(endDate).getTime() < new Date(startDate).getTime()) {
      throw badRequest("candidate_experience_dates_invalid", "Experience dates are invalid.");
    }
    if (current && endDate) {
      throw badRequest("candidate_experience_current_invalid", "Current experience has end date.");
    }
    return {
      company: validateText(entry.company, 200, "company"),
      title: validateText(entry.title, 200, "title"),
      startDate,
      endDate,
      current,
      description: validateOptionalText(entry.description, 5000) ?? "",
      location: validateOptionalText(entry.location, 200) ?? ""
    };
  });
}

function validateEducation(value: unknown): CandidateEducation[] {
  const items = optionalArray(value, "education", 30);
  return items.map((item) => {
    const entry = normalizeObject(item, "education");
    const level = String(entry.level ?? "");
    if (!educationLevels.has(level)) {
      throw badRequest("candidate_education_level_invalid", "Education level is invalid.");
    }
    const startDate = validateOptionalDate(entry.startDate ?? entry.start_date, "start_date");
    const endDate = validateOptionalDate(entry.endDate ?? entry.end_date, "end_date");
    const current = Boolean(entry.current);
    if (startDate && endDate && new Date(endDate).getTime() < new Date(startDate).getTime()) {
      throw badRequest("candidate_education_dates_invalid", "Education dates are invalid.");
    }
    if (current && endDate) {
      throw badRequest("candidate_education_current_invalid", "Current education has end date.");
    }
    return {
      institution: validateText(entry.institution, 200, "institution"),
      course: validateText(entry.course, 200, "course"),
      level: level as CandidateEducation["level"],
      startDate,
      endDate,
      current,
      description: validateOptionalText(entry.description, 5000) ?? ""
    };
  });
}

function validateCertifications(value: unknown): CandidateCertification[] {
  const items = optionalArray(value, "certifications", 50);
  return items.map((item) => {
    const entry = normalizeObject(item, "certification");
    const issuedAt = validateOptionalDate(entry.issuedAt ?? entry.issued_at, "issued_at");
    const expiresAt = validateOptionalDate(entry.expiresAt ?? entry.expires_at, "expires_at");
    if (issuedAt && expiresAt && new Date(expiresAt).getTime() < new Date(issuedAt).getTime()) {
      throw badRequest("candidate_certification_dates_invalid", "Certification dates are invalid.");
    }
    return {
      name: validateText(entry.name, 200, "certification_name"),
      issuer: validateOptionalText(entry.issuer, 200) ?? "",
      issuedAt,
      expiresAt,
      credentialCode:
        validateOptionalText(entry.credentialCode ?? entry.credential_code, 200) ?? "",
      verificationUrl: validateOptionalUrl(entry.verificationUrl ?? entry.verification_url) ?? ""
    };
  });
}

function validateLanguages(value: unknown): CandidateLanguage[] {
  const items = optionalArray(value, "languages", 50);
  const seen = new Set<string>();
  return items.map((item) => {
    const entry = normalizeObject(item, "language");
    const language = validateText(entry.language, 100, "language");
    const normalized = language.toLowerCase();
    const level = String(entry.level ?? "");
    if (seen.has(normalized)) {
      throw badRequest("candidate_language_duplicate", "Language is duplicated.");
    }
    if (!languageLevels.has(level)) {
      throw badRequest("candidate_language_level_invalid", "Language level is invalid.");
    }
    seen.add(normalized);
    return { language, level: level as CandidateLanguage["level"] };
  });
}

function validateProfessionalLinks(value: unknown): CandidateProfessionalLink[] {
  const items = optionalArray(value, "professional_links", 20);
  return items.map((item) => {
    const entry = normalizeObject(item, "professional_link");
    const type = String(entry.type ?? "");
    if (!linkTypes.has(type)) {
      throw badRequest("candidate_link_type_invalid", "Professional link type is invalid.");
    }
    return {
      type: type as CandidateProfessionalLink["type"],
      url: validateUrl(entry.url),
      description: validateOptionalText(entry.description, 200) ?? ""
    };
  });
}

function validateDeclaredCompetencies(value: unknown) {
  const items = optionalArray(value, "declared_competencies", 100).map((item) =>
    validateText(item, 150, "declared_competency")
  );
  const seen = new Set<string>();
  for (const item of items) {
    const normalized = item.toLowerCase();
    if (seen.has(normalized)) {
      throw badRequest("candidate_declared_competency_duplicate", "Competency is duplicated.");
    }
    seen.add(normalized);
  }
  return items;
}

function validateAvailability(value: unknown): CandidateAvailability {
  const entry = optionalObject(value, "availability");
  const preferred = normalizeText(entry.preferredWorkModel ?? entry.preferred_work_model);
  if (preferred && !workModels.has(preferred)) {
    throw badRequest("candidate_availability_invalid", "Availability is invalid.");
  }
  const notice = entry.noticePeriodDays ?? entry.notice_period_days;
  const noticePeriodDays = notice === undefined || notice === null ? null : Number(notice);
  if (
    noticePeriodDays !== null &&
    (!Number.isInteger(noticePeriodDays) || noticePeriodDays < 0 || noticePeriodDays > 365)
  ) {
    throw badRequest("candidate_availability_invalid", "Availability is invalid.");
  }
  return {
    immediate: Boolean(entry.immediate),
    availableAt: validateOptionalDate(entry.availableAt ?? entry.available_at, "available_at"),
    noticePeriodDays,
    relocation: Boolean(entry.relocation),
    travel: Boolean(entry.travel),
    preferredWorkModel: preferred as CandidateAvailability["preferredWorkModel"]
  };
}

function validateWorkAuthorization(value: unknown): CandidateWorkAuthorization {
  const entry = optionalObject(value, "work_authorization");
  return {
    country: validateOptionalText(entry.country, 100) ?? "",
    authorized: Boolean(entry.authorized),
    sponsorshipRequired: Boolean(entry.sponsorshipRequired ?? entry.sponsorship_required),
    note: validateOptionalText(entry.note, 500) ?? ""
  };
}

function validateSalaryExpectation(value: unknown): CandidateSalaryExpectation | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const entry = normalizeObject(value, "salary_expectation");
  const min = entry.min === undefined || entry.min === null ? null : Number(entry.min);
  const max = entry.max === undefined || entry.max === null ? null : Number(entry.max);
  const currency = String(entry.currency ?? "")
    .trim()
    .toUpperCase();
  const periodicity = String(entry.periodicity ?? "");
  if (
    (min !== null && (!Number.isFinite(min) || min < 0)) ||
    (max !== null && (!Number.isFinite(max) || max < 0)) ||
    (min !== null && max !== null && min > max) ||
    !/^[A-Z]{3}$/.test(currency) ||
    !salaryPeriodicities.has(periodicity)
  ) {
    throw badRequest("candidate_salary_expectation_invalid", "Salary expectation is invalid.");
  }
  return {
    min,
    max,
    currency,
    periodicity: periodicity as CandidateSalaryExpectation["periodicity"]
  };
}

function validateText(value: unknown, maxLength: number, code: string) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw badRequest(`candidate_${code}_invalid`, "Candidate text is invalid.");
  }
  return text;
}

function validateOptionalText(value: unknown, maxLength: number) {
  const text = normalizeText(value);
  if (text && text.length > maxLength) {
    throw badRequest("candidate_text_too_long", "Candidate text is too long.");
  }
  return text;
}

function validateRequiredDate(value: unknown, code: string) {
  const date = validateOptionalDate(value, code);
  if (!date) {
    throw badRequest(`candidate_${code}_required`, "Date is required.");
  }
  return date;
}

function validateOptionalDate(value: unknown, code: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw badRequest(`candidate_${code}_invalid`, "Date is invalid.");
  }
  return date.toISOString();
}

function validateUrl(value: unknown) {
  const url = String(value ?? "").trim();
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("invalid protocol");
    }
    return parsed.toString();
  } catch {
    throw badRequest("candidate_link_url_invalid", "Professional link URL is invalid.");
  }
}

function validateOptionalUrl(value: unknown) {
  return value === undefined || value === null || value === "" ? null : validateUrl(value);
}

function optionalArray(value: unknown, code: string, maxLength: number) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > maxLength) {
    throw badRequest(`candidate_${code}_invalid`, "Candidate list is invalid.");
  }
  return value;
}

function optionalObject(value: unknown, code: string) {
  if (value === undefined || value === null) {
    return {};
  }
  return normalizeObject(value, code);
}

function normalizeObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`candidate_${code}_invalid`, "Candidate structured data is invalid.");
  }
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text ? text : null;
}
