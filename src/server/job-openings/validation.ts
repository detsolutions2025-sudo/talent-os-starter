import { badRequest } from "../core/errors";
import type {
  JobOpeningCompetencyInput,
  JobOpeningDraftInput,
  JobOpeningInput,
  JobOpeningPublicationInput,
  JobOpeningQuestionInput,
  LocationInfo,
  NormalizedJobOpeningContent,
  OrderedText,
  SalaryRange,
  WorkModel,
  WorkSchedule
} from "./types";

const codePattern = /^[A-Za-z0-9_-]+$/;
const slugPattern = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;
const workModels = new Set(["onsite", "hybrid", "remote", "flexible"]);
const salaryPeriodicities = new Set(["monthly", "hourly", "annual"]);

export function normalizeJobOpeningCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function validateCreateJobOpening(input: JobOpeningInput) {
  const code = validateDisplayCode(input.code);
  return {
    code,
    normalizedCode: normalizeJobOpeningCode(code),
    title: validateTitle(input.title),
    organizationalUnitId: normalizeOptionalId(input.organizationalUnitId),
    jobProfileVersionId: validateRequiredId(input.jobProfileVersionId, "job_profile_version_id"),
    publicTitle:
      input.publicTitle === undefined
        ? validatePublicTitle(input.title)
        : validatePublicTitle(input.publicTitle),
    positionsCount: validatePositionsCount(input.positionsCount ?? 1)
  };
}

export function validateUpdateJobOpening(input: JobOpeningInput) {
  return {
    code: input.code === undefined ? undefined : validateDisplayCode(input.code),
    normalizedCode:
      input.code === undefined
        ? undefined
        : normalizeJobOpeningCode(validateDisplayCode(input.code)),
    title: input.title === undefined ? undefined : validateTitle(input.title),
    organizationalUnitId:
      input.organizationalUnitId === undefined
        ? undefined
        : normalizeOptionalId(input.organizationalUnitId)
  };
}

export function validateInitialDraft(input: JobOpeningInput): NormalizedJobOpeningContent {
  return {
    jobProfileVersionId: validateRequiredId(input.jobProfileVersionId, "job_profile_version_id"),
    publicTitle:
      input.publicTitle === undefined
        ? validatePublicTitle(input.title)
        : validatePublicTitle(input.publicTitle),
    description: "",
    responsibilities: [],
    requirements: [],
    benefits: [],
    location: emptyLocation(),
    workModel: "onsite",
    workSchedule: { weeklyHours: 0, description: "", shift: "" },
    salaryRange: null,
    positionsCount: validatePositionsCount(input.positionsCount ?? 1),
    expectedStartDate: null,
    internalInstructions: "",
    publicInstructions: ""
  };
}

export function mergeDraftInput(
  base: NormalizedJobOpeningContent,
  currentCompetencies: JobOpeningCompetencyInput[],
  currentQuestions: JobOpeningQuestionInput[],
  input: JobOpeningDraftInput
) {
  const content: NormalizedJobOpeningContent = {
    jobProfileVersionId:
      input.jobProfileVersionId === undefined
        ? base.jobProfileVersionId
        : validateRequiredId(input.jobProfileVersionId, "job_profile_version_id"),
    publicTitle:
      input.publicTitle === undefined ? base.publicTitle : validatePublicTitle(input.publicTitle),
    description:
      input.description === undefined
        ? base.description
        : validateText(input.description, 5000, "description"),
    responsibilities:
      input.responsibilities === undefined
        ? base.responsibilities
        : validateOrderedTextList(input.responsibilities, "responsibilities", 50, 1000, false),
    requirements:
      input.requirements === undefined
        ? base.requirements
        : validateOrderedTextList(input.requirements, "requirements", 100, 1000, true),
    benefits:
      input.benefits === undefined
        ? base.benefits
        : validateOrderedTextList(input.benefits, "benefits", 50, 1000, true),
    location: input.location === undefined ? base.location : validateLocation(input.location),
    workModel: input.workModel === undefined ? base.workModel : validateWorkModel(input.workModel),
    workSchedule:
      input.workSchedule === undefined
        ? base.workSchedule
        : validateWorkSchedule(input.workSchedule),
    salaryRange:
      input.salaryRange === undefined ? base.salaryRange : validateSalaryRange(input.salaryRange),
    positionsCount:
      input.positionsCount === undefined
        ? base.positionsCount
        : validatePositionsCount(input.positionsCount),
    expectedStartDate:
      input.expectedStartDate === undefined
        ? base.expectedStartDate
        : validateOptionalDate(input.expectedStartDate, "expected_start_date"),
    internalInstructions:
      input.internalInstructions === undefined
        ? base.internalInstructions
        : validateText(input.internalInstructions, 4000, "internal_instructions"),
    publicInstructions:
      input.publicInstructions === undefined
        ? base.publicInstructions
        : validateText(input.publicInstructions, 4000, "public_instructions")
  };

  return {
    content,
    competencies:
      input.competencies === undefined
        ? currentCompetencies
        : validateCompetencies(input.competencies),
    questions: input.questions === undefined ? currentQuestions : validateQuestions(input.questions)
  };
}

export function validatePublishable(
  content: NormalizedJobOpeningContent,
  competencies: JobOpeningCompetencyInput[],
  questions: JobOpeningQuestionInput[]
) {
  if (!content.publicTitle.trim()) {
    throw badRequest("job_opening_public_title_required", "Public title is required.");
  }

  validateCompetencyWeights(competencies);
  validateDuplicateCompetencies(competencies);
  validateDuplicateQuestions(questions);
}

export function validatePublicationInput(input: JobOpeningPublicationInput, now = new Date()) {
  const isPublic = Boolean(input.isPublic);
  const publicShowSalary = Boolean(input.showSalary);
  const publicSlug =
    input.publicSlug === undefined || input.publicSlug === null
      ? null
      : validateSlug(input.publicSlug);
  const applicationDeadline = validateOptionalDate(
    input.applicationDeadline,
    "application_deadline"
  );

  if (isPublic && !publicSlug) {
    throw badRequest("job_opening_public_slug_required", "Public slug is required.");
  }

  if (isPublic && applicationDeadline && new Date(applicationDeadline).getTime() <= now.getTime()) {
    throw badRequest("job_opening_deadline_expired", "Application deadline must be future.");
  }

  return { isPublic, publicShowSalary, publicSlug, applicationDeadline };
}

export function requireAdminReason(reason: unknown) {
  const text = normalizeText(reason);
  if (!text) {
    throw badRequest("admin_reason_required", "Administrative reason is required.");
  }
  return text;
}

function validateDisplayCode(value: unknown) {
  const code = String(value ?? "").trim();
  if (code.length < 2 || code.length > 50 || !codePattern.test(code)) {
    throw badRequest("job_opening_code_invalid", "Job opening code is invalid.");
  }
  return code;
}

function validateTitle(value: unknown) {
  const title = String(value ?? "").trim();
  if (title.length < 2 || title.length > 150) {
    throw badRequest("job_opening_title_invalid", "Job opening title is invalid.");
  }
  return title;
}

function validatePublicTitle(value: unknown) {
  const title = String(value ?? "").trim();
  if (!title || title.length > 150) {
    throw badRequest("job_opening_public_title_invalid", "Public title is invalid.");
  }
  return title;
}

function validatePositionsCount(value: unknown) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw badRequest("job_opening_positions_count_invalid", "Positions count is invalid.");
  }
  return count;
}

function validateRequiredId(value: unknown, code: string) {
  const id = String(value ?? "").trim();
  if (!id) {
    throw badRequest(`job_opening_${code}_required`, "Required id is missing.");
  }
  return id;
}

function normalizeOptionalId(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value).trim();
}

function validateText(value: unknown, maxLength: number, code: string) {
  const text = String(value ?? "").trim();
  if (text.length > maxLength) {
    throw badRequest(`job_opening_${code}_too_long`, "Job opening text is too long.");
  }
  return text;
}

function validateOrderedTextList(
  value: unknown,
  code: string,
  maxItems: number,
  maxTextLength: number,
  allowEmpty: boolean
): OrderedText[] {
  if (!Array.isArray(value) || value.length > maxItems || (!allowEmpty && value.length === 0)) {
    throw badRequest(`job_opening_${code}_invalid`, "Job opening ordered list is invalid.");
  }
  return value.map((item, index) => {
    const entry = normalizeObject(item, code);
    const text = String(entry.text ?? "").trim();
    const displayOrder = Number(entry.displayOrder ?? entry.display_order ?? index);
    if (
      !text ||
      text.length > maxTextLength ||
      !Number.isInteger(displayOrder) ||
      displayOrder < 0
    ) {
      throw badRequest(`job_opening_${code}_invalid`, "Job opening ordered item is invalid.");
    }
    return { text, displayOrder };
  });
}

function validateLocation(value: unknown): LocationInfo {
  const entry = normalizeObject(value, "location");
  return {
    country: normalizeText(entry.country) ?? "",
    region: normalizeText(entry.region) ?? "",
    city: normalizeText(entry.city) ?? "",
    publicAddress: normalizeText(entry.publicAddress ?? entry.public_address) ?? "",
    note: normalizeText(entry.note) ?? ""
  };
}

function emptyLocation(): LocationInfo {
  return { country: "", region: "", city: "", publicAddress: "", note: "" };
}

function validateWorkModel(value: unknown): WorkModel {
  if (!workModels.has(String(value))) {
    throw badRequest("job_opening_work_model_invalid", "Work model is invalid.");
  }
  return value as WorkModel;
}

function validateWorkSchedule(value: unknown): WorkSchedule {
  const entry = normalizeObject(value, "work_schedule");
  const weeklyHours = Number(entry.weeklyHours ?? entry.weekly_hours ?? 0);
  if (!Number.isFinite(weeklyHours) || weeklyHours < 0 || weeklyHours > 168) {
    throw badRequest("job_opening_work_schedule_invalid", "Work schedule is invalid.");
  }
  return {
    weeklyHours,
    description: normalizeText(entry.description) ?? "",
    shift: normalizeText(entry.shift) ?? ""
  };
}

function validateSalaryRange(value: unknown): SalaryRange | null {
  if (value === null || value === undefined) {
    return null;
  }
  const entry = normalizeObject(value, "salary_range");
  const min = Number(entry.min);
  const max = Number(entry.max);
  const currency = String(entry.currency ?? "")
    .trim()
    .toUpperCase();
  const periodicity = String(entry.periodicity ?? "");
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min < 0 ||
    max < 0 ||
    min > max ||
    !/^[A-Z]{3}$/.test(currency) ||
    !salaryPeriodicities.has(periodicity)
  ) {
    throw badRequest("job_opening_salary_range_invalid", "Salary range is invalid.");
  }
  return { min, max, currency, periodicity: periodicity as SalaryRange["periodicity"] };
}

function validateOptionalDate(value: unknown, code: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw badRequest(`job_opening_${code}_invalid`, "Date is invalid.");
  }
  return date.toISOString();
}

function validateCompetencies(value: unknown): JobOpeningCompetencyInput[] {
  if (!Array.isArray(value) || value.length > 50) {
    throw badRequest("job_opening_competencies_invalid", "Competencies are invalid.");
  }
  const competencies = value.map((item, index) => {
    const entry = normalizeObject(item, "competencies");
    const competencyCatalogItemId = String(
      entry.competencyCatalogItemId ?? entry.competency_catalog_item_id ?? ""
    ).trim();
    const expectedLevel = Number(entry.expectedLevel ?? entry.expected_level);
    const weight = Number(entry.weight);
    const displayOrder = Number(entry.displayOrder ?? entry.display_order ?? index);
    if (
      !competencyCatalogItemId ||
      !Number.isInteger(expectedLevel) ||
      expectedLevel < 1 ||
      expectedLevel > 5 ||
      typeof entry.required !== "boolean" ||
      !Number.isFinite(weight) ||
      weight < 0 ||
      weight > 100 ||
      !Number.isInteger(displayOrder) ||
      displayOrder < 0
    ) {
      throw badRequest("job_opening_competencies_invalid", "Competency link is invalid.");
    }
    return {
      competencyCatalogItemId,
      expectedLevel,
      required: entry.required,
      weight,
      displayOrder,
      note: normalizeText(entry.note)
    };
  });
  validateDuplicateCompetencies(competencies);
  return competencies;
}

function validateQuestions(value: unknown): JobOpeningQuestionInput[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw badRequest("job_opening_questions_invalid", "Questions are invalid.");
  }
  const questions = value.map((item, index) => {
    const entry = normalizeObject(item, "questions");
    const questionCatalogItemId = String(
      entry.questionCatalogItemId ?? entry.question_catalog_item_id ?? ""
    ).trim();
    const displayOrder = Number(entry.displayOrder ?? entry.display_order ?? index);
    const weight =
      entry.weight === undefined || entry.weight === null ? null : Number(entry.weight);
    if (
      !questionCatalogItemId ||
      typeof entry.required !== "boolean" ||
      !Number.isInteger(displayOrder) ||
      displayOrder < 0 ||
      (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 100))
    ) {
      throw badRequest("job_opening_questions_invalid", "Question link is invalid.");
    }
    return {
      questionCatalogItemId,
      required: entry.required,
      displayOrder,
      weight,
      contextSettings: normalizePlainObject(entry.contextSettings ?? entry.context_settings ?? {})
    };
  });
  validateDuplicateQuestions(questions);
  return questions;
}

function validateCompetencyWeights(competencies: JobOpeningCompetencyInput[]) {
  if (!competencies.length) {
    return;
  }
  const sum = competencies.reduce((total, competency) => total + competency.weight, 0);
  if (Math.abs(sum - 100) > 0.0001) {
    throw badRequest(
      "job_opening_competency_weight_sum_invalid",
      "Competency weights must sum 100."
    );
  }
}

function validateDuplicateCompetencies(competencies: JobOpeningCompetencyInput[]) {
  const ids = new Set<string>();
  for (const competency of competencies) {
    if (ids.has(competency.competencyCatalogItemId)) {
      throw badRequest("job_opening_competency_duplicate", "Competency is duplicated.");
    }
    ids.add(competency.competencyCatalogItemId);
  }
}

function validateDuplicateQuestions(questions: JobOpeningQuestionInput[]) {
  const ids = new Set<string>();
  for (const question of questions) {
    if (ids.has(question.questionCatalogItemId)) {
      throw badRequest("job_opening_question_duplicate", "Question is duplicated.");
    }
    ids.add(question.questionCatalogItemId);
  }
}

function validateSlug(value: unknown) {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    !slugPattern.test(slug) ||
    /(?:^|-)(org|job|user|profile|question|competency)_[a-z0-9-]/.test(slug)
  ) {
    throw badRequest("job_opening_public_slug_invalid", "Public slug is invalid.");
  }
  return slug;
}

function normalizeText(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text ? text : null;
}

function normalizeObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`job_opening_${code}_invalid`, "Job opening structured item is invalid.");
  }
  return value as Record<string, unknown>;
}

function normalizePlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("job_opening_context_settings_invalid", "Context settings are invalid.");
  }
  return value as Record<string, unknown>;
}
