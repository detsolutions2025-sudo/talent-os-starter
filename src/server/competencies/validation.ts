import { badRequest } from "../core/errors";
import {
  competencyCategories,
  proficiencyCodes,
  type CompetencyCategory,
  type CompetencyContentInput,
  type CompetencyContentPatch,
  type CompetencyEvidence,
  type CompetencyExample,
  type GlobalCompetencyStatus,
  type NormalizedCompetencyContent,
  type OrganizationCompetencyStatus,
  type ProficiencyLevel
} from "./types";

const codePattern = /^[A-Za-z0-9_-]+$/;

export function normalizeCompetencyCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function requireAdminReason(reason: unknown) {
  const normalized = normalizeText(reason);

  if (!normalized) {
    throw badRequest("admin_reason_required", "Administrative reason is required.");
  }

  return normalized;
}

export function validateCreateContent(input: CompetencyContentInput): NormalizedCompetencyContent {
  const code = validateDisplayCode(input.code);
  const status = input.status;
  const content = {
    code,
    normalizedCode: normalizeCompetencyCode(code),
    name: validateName(input.name),
    category: validateCategory(input.category),
    definition: validateDefinition(input.definition ?? ""),
    positiveEvidences: validateEvidenceList(
      input.positiveEvidences ?? [],
      "positive_evidences",
      30
    ),
    negativeEvidences: validateEvidenceList(
      input.negativeEvidences ?? [],
      "negative_evidences",
      30
    ),
    practicalExamples: validateExampleList(input.practicalExamples ?? []),
    proficiencyLevels: validateProficiencyLevels(input.proficiencyLevels ?? [])
  };

  if (status === "active") {
    validateActiveContent(content);
  }

  return content;
}

export function validateContentPatch(input: CompetencyContentInput): CompetencyContentPatch {
  return {
    code: input.code === undefined ? undefined : validateDisplayCode(input.code),
    normalizedCode:
      input.code === undefined
        ? undefined
        : normalizeCompetencyCode(validateDisplayCode(input.code)),
    name: input.name === undefined ? undefined : validateName(input.name),
    category: input.category === undefined ? undefined : validateCategory(input.category),
    definition: input.definition === undefined ? undefined : validateDefinition(input.definition),
    positiveEvidences:
      input.positiveEvidences === undefined
        ? undefined
        : validateEvidenceList(input.positiveEvidences, "positive_evidences", 30),
    negativeEvidences:
      input.negativeEvidences === undefined
        ? undefined
        : validateEvidenceList(input.negativeEvidences, "negative_evidences", 30),
    practicalExamples:
      input.practicalExamples === undefined
        ? undefined
        : validateExampleList(input.practicalExamples),
    proficiencyLevels:
      input.proficiencyLevels === undefined
        ? undefined
        : validateProficiencyLevels(input.proficiencyLevels)
  };
}

export function validateGlobalStatus(value: unknown): GlobalCompetencyStatus {
  if (!["active", "inactive", "deprecated"].includes(String(value))) {
    throw badRequest("global_competency_status_invalid", "Global competency status is invalid.");
  }

  return value as GlobalCompetencyStatus;
}

export function validateOrganizationStatus(value: unknown): OrganizationCompetencyStatus {
  if (!["active", "inactive"].includes(String(value))) {
    throw badRequest(
      "organization_competency_status_invalid",
      "Organization competency status is invalid."
    );
  }

  return value as OrganizationCompetencyStatus;
}

export function validateActiveContent(content: NormalizedCompetencyContent) {
  if (!content.definition.trim()) {
    throw badRequest("competency_definition_required", "Definition is required for active status.");
  }

  validateCompleteLevels(content.proficiencyLevels);
}

export function normalizeNullableText(value: unknown) {
  const text = normalizeText(value);
  return text ?? "";
}

function normalizeText(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text ? text : null;
}

function validateDisplayCode(value: unknown) {
  const code = String(value ?? "").trim();

  if (code.length < 2 || code.length > 50 || !codePattern.test(code)) {
    throw badRequest("competency_code_invalid", "Competency code is invalid.");
  }

  return code;
}

function validateName(value: unknown) {
  const name = String(value ?? "").trim();

  if (name.length < 2 || name.length > 150) {
    throw badRequest("competency_name_invalid", "Competency name is invalid.");
  }

  return name;
}

function validateCategory(value: unknown): CompetencyCategory {
  if (!competencyCategories.includes(value as CompetencyCategory)) {
    throw badRequest("competency_category_invalid", "Competency category is invalid.");
  }

  return value as CompetencyCategory;
}

function validateDefinition(value: unknown) {
  const definition = String(value ?? "").trim();

  if (definition.length > 4000) {
    throw badRequest("competency_definition_too_long", "Competency definition is too long.");
  }

  return definition;
}

function validateEvidenceList(
  value: unknown,
  code: string,
  maxItems: number
): CompetencyEvidence[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw badRequest(`${code}_invalid`, "Competency evidence list is invalid.");
  }

  return value.map((item, index) => {
    const entry = normalizeObject(item, code);
    const text = String(entry.text ?? "").trim();
    const displayOrder = Number(entry.displayOrder ?? entry.display_order ?? index);

    if (!text || text.length > 500 || !Number.isInteger(displayOrder) || displayOrder < 0) {
      throw badRequest(`${code}_invalid`, "Competency evidence item is invalid.");
    }

    return { text, displayOrder };
  });
}

function validateExampleList(value: unknown): CompetencyExample[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw badRequest("practical_examples_invalid", "Practical examples list is invalid.");
  }

  return value.map((item, index) => {
    const entry = normalizeObject(item, "practical_examples");
    const text = String(entry.text ?? "").trim();
    const displayOrder = Number(entry.displayOrder ?? entry.display_order ?? index);

    if (!text || text.length > 1000 || !Number.isInteger(displayOrder) || displayOrder < 0) {
      throw badRequest("practical_examples_invalid", "Practical example is invalid.");
    }

    return { text, displayOrder };
  });
}

function validateProficiencyLevels(value: unknown): ProficiencyLevel[] {
  if (!Array.isArray(value) || value.length > 5) {
    throw badRequest("proficiency_levels_invalid", "Proficiency levels are invalid.");
  }

  return value.map((item) => {
    const entry = normalizeObject(item, "proficiency_levels");
    const number = Number(entry.number);
    const code = String(entry.code ?? "");
    const displayName = String(entry.displayName ?? entry.display_name ?? "").trim();
    const description = String(entry.description ?? "").trim();
    const observableValue = entry.observableEvidences ?? entry.observable_evidences ?? [];

    if (
      !Number.isInteger(number) ||
      !proficiencyCodes.includes(code as ProficiencyLevel["code"]) ||
      !displayName ||
      !description ||
      description.length > 2000 ||
      !Array.isArray(observableValue)
    ) {
      throw badRequest("proficiency_levels_invalid", "Proficiency level is invalid.");
    }

    const observableEvidences = observableValue.map((evidence) => String(evidence).trim());

    return {
      number,
      code: code as ProficiencyLevel["code"],
      displayName,
      description,
      observableEvidences
    };
  });
}

function validateCompleteLevels(levels: ProficiencyLevel[]) {
  if (levels.length !== 5) {
    throw badRequest("proficiency_levels_incomplete", "Five proficiency levels are required.");
  }

  levels
    .slice()
    .sort((left, right) => left.number - right.number)
    .forEach((level, index) => {
      if (level.number !== index + 1 || level.code !== proficiencyCodes[index]) {
        throw badRequest("proficiency_levels_invalid", "Proficiency levels must be ordered.");
      }
    });

  if (new Set(levels.map((level) => level.number)).size !== 5) {
    throw badRequest("proficiency_level_number_duplicate", "Proficiency level number duplicate.");
  }

  if (new Set(levels.map((level) => level.code)).size !== 5) {
    throw badRequest("proficiency_level_code_duplicate", "Proficiency level code duplicate.");
  }
}

function normalizeObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`${code}_invalid`, "Competency structured item is invalid.");
  }

  return value as Record<string, unknown>;
}
