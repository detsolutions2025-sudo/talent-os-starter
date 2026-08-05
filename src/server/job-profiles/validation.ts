import { badRequest } from "../core/errors";
import type {
  JobCertification,
  JobEducation,
  JobLanguage,
  JobProfileCompetencyInput,
  JobProfileDraftInput,
  JobProfileInput,
  JobRequirement,
  JobTool,
  NormalizedJobProfileContent,
  OrderedText,
  SalaryRange,
  TravelRequirement,
  WorkModel,
  WorkSchedule
} from "./types";

const codePattern = /^[A-Za-z0-9_-]+$/;
const requirementTypes = new Set([
  "education",
  "experience",
  "certification",
  "license",
  "availability",
  "travel",
  "location",
  "language",
  "tool",
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
  "not_required"
]);
const languageLevels = new Set(["basic", "intermediate", "advanced", "fluent", "native"]);
const toolLevels = new Set(["basic", "intermediate", "advanced", "expert"]);
const workModels = new Set(["onsite", "hybrid", "remote", "flexible"]);
const travelRequirements = new Set(["none", "occasional", "frequent"]);
const salaryPeriodicities = new Set(["monthly", "hourly", "annual"]);

export function normalizeJobProfileCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function validateCreateJobProfile(input: JobProfileInput) {
  const code = validateDisplayCode(input.code);

  return {
    code,
    normalizedCode: normalizeJobProfileCode(code),
    name: validateName(input.name)
  };
}

export function validateUpdateJobProfile(input: JobProfileInput) {
  return {
    code: input.code === undefined ? undefined : validateDisplayCode(input.code),
    normalizedCode:
      input.code === undefined
        ? undefined
        : normalizeJobProfileCode(validateDisplayCode(input.code)),
    name: input.name === undefined ? undefined : validateName(input.name)
  };
}

export function validateDraftInput(input: JobProfileDraftInput) {
  rejectWeight(input);

  return {
    content: {
      title: input.title === undefined ? "" : validateTitle(input.title),
      mission: input.mission === undefined ? "" : validateText(input.mission, 2000, "mission"),
      summary: input.summary === undefined ? "" : validateText(input.summary, 4000, "summary"),
      responsibilities: validateOrderedTextList(
        input.responsibilities ?? [],
        "responsibilities",
        50,
        1000
      ),
      requirements: validateRequirements(input.requirements ?? []),
      education: validateEducation(input.education ?? {}),
      certifications: validateCertifications(input.certifications ?? []),
      languages: validateLanguages(input.languages ?? []),
      tools: validateTools(input.tools ?? []),
      workModel: validateWorkModel(input.workModel ?? "onsite"),
      workSchedule: validateWorkSchedule(input.workSchedule ?? {}),
      travelRequirement: validateTravelRequirement(input.travelRequirement ?? "none"),
      salaryRange: validateSalaryRange(input.salaryRange ?? null),
      notes: validateText(input.notes ?? "", 4000, "notes")
    },
    competencies: validateCompetencies(input.competencies ?? [])
  };
}

export function mergeDraftInput(
  base: NormalizedJobProfileContent,
  currentCompetencies: JobProfileCompetencyInput[],
  input: JobProfileDraftInput
) {
  rejectWeight(input);
  const nextContent: NormalizedJobProfileContent = {
    title: input.title === undefined ? base.title : validateTitle(input.title),
    mission:
      input.mission === undefined ? base.mission : validateText(input.mission, 2000, "mission"),
    summary:
      input.summary === undefined ? base.summary : validateText(input.summary, 4000, "summary"),
    responsibilities:
      input.responsibilities === undefined
        ? base.responsibilities
        : validateOrderedTextList(input.responsibilities, "responsibilities", 50, 1000),
    requirements:
      input.requirements === undefined
        ? base.requirements
        : validateRequirements(input.requirements),
    education: input.education === undefined ? base.education : validateEducation(input.education),
    certifications:
      input.certifications === undefined
        ? base.certifications
        : validateCertifications(input.certifications),
    languages: input.languages === undefined ? base.languages : validateLanguages(input.languages),
    tools: input.tools === undefined ? base.tools : validateTools(input.tools),
    workModel: input.workModel === undefined ? base.workModel : validateWorkModel(input.workModel),
    workSchedule:
      input.workSchedule === undefined
        ? base.workSchedule
        : validateWorkSchedule(input.workSchedule),
    travelRequirement:
      input.travelRequirement === undefined
        ? base.travelRequirement
        : validateTravelRequirement(input.travelRequirement),
    salaryRange:
      input.salaryRange === undefined ? base.salaryRange : validateSalaryRange(input.salaryRange),
    notes: input.notes === undefined ? base.notes : validateText(input.notes, 4000, "notes")
  };

  return {
    content: nextContent,
    competencies:
      input.competencies === undefined
        ? currentCompetencies
        : validateCompetencies(input.competencies)
  };
}

export function validatePublishable(
  content: NormalizedJobProfileContent,
  competencies: JobProfileCompetencyInput[]
) {
  if (!content.mission.trim()) {
    throw badRequest("job_profile_mission_required", "Mission is required.");
  }

  if (!content.summary.trim()) {
    throw badRequest("job_profile_summary_required", "Summary is required.");
  }

  if (!content.responsibilities.length) {
    throw badRequest(
      "job_profile_responsibility_required",
      "At least one responsibility is required."
    );
  }

  validateDuplicateCompetencies(competencies);
}

export function requireAdminReason(reason: unknown) {
  const text = normalizeText(reason);

  if (!text) {
    throw badRequest("admin_reason_required", "Administrative reason is required.");
  }

  return text;
}

export function rejectWeight(input: Record<string, unknown>) {
  if ("weight" in input || "peso" in input) {
    throw badRequest(
      "job_profile_competency_weight_forbidden",
      "Competency weight is not allowed."
    );
  }
}

function validateDisplayCode(value: unknown) {
  const code = String(value ?? "").trim();

  if (code.length < 2 || code.length > 50 || !codePattern.test(code)) {
    throw badRequest("job_profile_code_invalid", "Job profile code is invalid.");
  }

  return code;
}

function validateName(value: unknown) {
  const name = String(value ?? "").trim();

  if (name.length < 2 || name.length > 150) {
    throw badRequest("job_profile_name_invalid", "Job profile name is invalid.");
  }

  return name;
}

function validateTitle(value: unknown) {
  const title = String(value ?? "").trim();

  if (title.length > 150) {
    throw badRequest("job_profile_title_invalid", "Job profile title is invalid.");
  }

  return title;
}

function validateText(value: unknown, maxLength: number, code: string) {
  const text = String(value ?? "").trim();

  if (text.length > maxLength) {
    throw badRequest(`job_profile_${code}_too_long`, "Job profile text is too long.");
  }

  return text;
}

function validateOrderedTextList(
  value: unknown,
  code: string,
  maxItems: number,
  maxTextLength: number
): OrderedText[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw badRequest(`job_profile_${code}_invalid`, "Job profile ordered list is invalid.");
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
      throw badRequest(`job_profile_${code}_invalid`, "Job profile ordered item is invalid.");
    }

    return { text, displayOrder };
  });
}

function validateRequirements(value: unknown): JobRequirement[] {
  if (!Array.isArray(value) || value.length > 50) {
    throw badRequest("job_profile_requirements_invalid", "Job profile requirements are invalid.");
  }

  return value.map((item, index) => {
    const entry = normalizeObject(item, "requirements");
    const text = String(entry.text ?? "").trim();
    const type = String(entry.type ?? "");
    const displayOrder = Number(entry.displayOrder ?? entry.display_order ?? index);

    if (
      !text ||
      text.length > 1000 ||
      !requirementTypes.has(type) ||
      typeof entry.required !== "boolean" ||
      !Number.isInteger(displayOrder) ||
      displayOrder < 0
    ) {
      throw badRequest("job_profile_requirements_invalid", "Job profile requirement is invalid.");
    }

    return { text, type: type as JobRequirement["type"], required: entry.required, displayOrder };
  });
}

function validateEducation(value: unknown): JobEducation {
  const entry = normalizeObject(value, "education");
  const level = String(entry.level ?? "not_required");

  if (!educationLevels.has(level)) {
    throw badRequest("job_profile_education_invalid", "Job profile education is invalid.");
  }

  return {
    level: level as JobEducation["level"],
    area: normalizeText(entry.area) ?? "",
    required: typeof entry.required === "boolean" ? entry.required : false,
    note: normalizeText(entry.note) ?? ""
  };
}

function validateCertifications(value: unknown): JobCertification[] {
  if (!Array.isArray(value)) {
    throw badRequest("job_profile_certifications_invalid", "Certifications are invalid.");
  }

  return value.map((item) => {
    const entry = normalizeObject(item, "certifications");
    const name = String(entry.name ?? "").trim();

    if (!name || typeof entry.required !== "boolean") {
      throw badRequest("job_profile_certifications_invalid", "Certification is invalid.");
    }

    return {
      name,
      required: entry.required,
      validityRequired:
        typeof entry.validityRequired === "boolean"
          ? entry.validityRequired
          : Boolean(entry.validity_required),
      note: normalizeText(entry.note) ?? ""
    };
  });
}

function validateLanguages(value: unknown): JobLanguage[] {
  if (!Array.isArray(value)) {
    throw badRequest("job_profile_languages_invalid", "Languages are invalid.");
  }

  return value.map((item) => {
    const entry = normalizeObject(item, "languages");
    const language = String(entry.language ?? "").trim();
    const expectedLevel = String(entry.expectedLevel ?? entry.expected_level ?? "");

    if (!language || !languageLevels.has(expectedLevel) || typeof entry.required !== "boolean") {
      throw badRequest("job_profile_languages_invalid", "Language is invalid.");
    }

    return {
      language,
      expectedLevel: expectedLevel as JobLanguage["expectedLevel"],
      required: entry.required
    };
  });
}

function validateTools(value: unknown): JobTool[] {
  if (!Array.isArray(value)) {
    throw badRequest("job_profile_tools_invalid", "Tools are invalid.");
  }

  return value.map((item) => {
    const entry = normalizeObject(item, "tools");
    const name = String(entry.name ?? "").trim();
    const expectedLevel = String(entry.expectedLevel ?? entry.expected_level ?? "");

    if (!name || !toolLevels.has(expectedLevel) || typeof entry.required !== "boolean") {
      throw badRequest("job_profile_tools_invalid", "Tool is invalid.");
    }

    return {
      name,
      expectedLevel: expectedLevel as JobTool["expectedLevel"],
      required: entry.required
    };
  });
}

function validateWorkModel(value: unknown): WorkModel {
  if (!workModels.has(String(value))) {
    throw badRequest("job_profile_work_model_invalid", "Work model is invalid.");
  }

  return value as WorkModel;
}

function validateWorkSchedule(value: unknown): WorkSchedule {
  const entry = normalizeObject(value, "work_schedule");
  const weeklyHours = Number(entry.weeklyHours ?? entry.weekly_hours ?? 0);

  if (!Number.isFinite(weeklyHours) || weeklyHours < 0 || weeklyHours > 168) {
    throw badRequest("job_profile_work_schedule_invalid", "Work schedule is invalid.");
  }

  return {
    weeklyHours,
    description: normalizeText(entry.description) ?? "",
    shift: normalizeText(entry.shift) ?? ""
  };
}

function validateTravelRequirement(value: unknown): TravelRequirement {
  if (!travelRequirements.has(String(value))) {
    throw badRequest("job_profile_travel_requirement_invalid", "Travel requirement is invalid.");
  }

  return value as TravelRequirement;
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
    throw badRequest("job_profile_salary_range_invalid", "Salary range is invalid.");
  }

  return { min, max, currency, periodicity: periodicity as SalaryRange["periodicity"] };
}

function validateCompetencies(value: unknown): JobProfileCompetencyInput[] {
  if (!Array.isArray(value)) {
    throw badRequest("job_profile_competencies_invalid", "Competencies are invalid.");
  }

  const competencies = value.map((item, index) => {
    const entry = normalizeObject(item, "competencies");
    rejectWeight(entry);
    const competencyCatalogItemId = String(
      entry.competencyCatalogItemId ?? entry.competency_catalog_item_id ?? ""
    ).trim();
    const expectedLevel = Number(entry.expectedLevel ?? entry.expected_level);
    const displayOrder = Number(entry.displayOrder ?? entry.display_order ?? index);

    if (
      !competencyCatalogItemId ||
      !Number.isInteger(expectedLevel) ||
      expectedLevel < 1 ||
      expectedLevel > 5 ||
      typeof entry.required !== "boolean" ||
      !Number.isInteger(displayOrder) ||
      displayOrder < 0
    ) {
      throw badRequest("job_profile_competencies_invalid", "Competency link is invalid.");
    }

    return {
      competencyCatalogItemId,
      expectedLevel,
      required: entry.required,
      displayOrder,
      note: normalizeText(entry.note)
    };
  });

  validateDuplicateCompetencies(competencies);
  return competencies;
}

function validateDuplicateCompetencies(competencies: JobProfileCompetencyInput[]) {
  const ids = new Set<string>();

  for (const competency of competencies) {
    if (ids.has(competency.competencyCatalogItemId)) {
      throw badRequest("job_profile_competency_duplicate", "Competency is duplicated.");
    }
    ids.add(competency.competencyCatalogItemId);
  }
}

function normalizeText(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text ? text : null;
}

function normalizeObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`job_profile_${code}_invalid`, "Job profile structured item is invalid.");
  }

  return value as Record<string, unknown>;
}
