import { badRequest } from "../core/errors";
import {
  questionCategories,
  questionTypes,
  type GlobalQuestionStatus,
  type NormalizedQuestionContent,
  type NumericSettings,
  type OrganizationQuestionStatus,
  type QuestionCategory,
  type QuestionContentInput,
  type QuestionContentPatch,
  type QuestionOption,
  type QuestionSettings,
  type QuestionType,
  type ScaleSettings
} from "./types";

const codePattern = /^[A-Za-z0-9_-]+$/;
const choiceTypes: QuestionType[] = ["single_choice", "multiple_choice"];

export function normalizeQuestionCode(value: unknown) {
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

export function validateCreateQuestion(
  input: QuestionContentInput,
  allowCompetency: boolean
): NormalizedQuestionContent {
  rejectOutOfScopeFields(input);
  const code = validateDisplayCode(input.code);
  const type = validateQuestionType(input.type);

  return {
    code,
    normalizedCode: normalizeQuestionCode(code),
    title: validateTitle(input.title),
    questionText: validateQuestionText(input.questionText ?? input.question_text),
    description: validateLongOptionalText(input.description, "question_description_too_long"),
    type,
    category: validateQuestionCategory(input.category),
    instructions: validateLongOptionalText(input.instructions, "question_instructions_too_long"),
    options: validateOptionsForType(type, input.options),
    settings: validateSettingsForType(type, input.settings),
    competencyCatalogItemId: validateCompetencyCatalogItemId(
      input.competencyCatalogItemId ?? input.competency_catalog_item_id,
      allowCompetency
    )
  };
}

export function validateQuestionPatch(
  input: QuestionContentInput,
  existing: NormalizedQuestionContent,
  allowCompetency: boolean
): QuestionContentPatch {
  rejectOutOfScopeFields(input);
  const nextType = input.type === undefined ? existing.type : validateQuestionType(input.type);

  const patch: QuestionContentPatch = {
    code: input.code === undefined ? undefined : validateDisplayCode(input.code),
    normalizedCode:
      input.code === undefined ? undefined : normalizeQuestionCode(validateDisplayCode(input.code)),
    title: input.title === undefined ? undefined : validateTitle(input.title),
    questionText:
      input.questionText === undefined && input.question_text === undefined
        ? undefined
        : validateQuestionText(input.questionText ?? input.question_text),
    description:
      input.description === undefined
        ? undefined
        : validateLongOptionalText(input.description, "question_description_too_long"),
    type: input.type === undefined ? undefined : nextType,
    category: input.category === undefined ? undefined : validateQuestionCategory(input.category),
    instructions:
      input.instructions === undefined
        ? undefined
        : validateLongOptionalText(input.instructions, "question_instructions_too_long"),
    options:
      input.options === undefined ? undefined : validateOptionsForType(nextType, input.options),
    settings:
      input.settings === undefined ? undefined : validateSettingsForType(nextType, input.settings),
    competencyCatalogItemId:
      input.competencyCatalogItemId === undefined && input.competency_catalog_item_id === undefined
        ? undefined
        : validateCompetencyCatalogItemId(
            input.competencyCatalogItemId ?? input.competency_catalog_item_id,
            allowCompetency
          )
  };

  if (input.type !== undefined && input.options === undefined) {
    patch.options = validateOptionsForType(nextType, existing.options);
  }

  if (input.type !== undefined && input.settings === undefined) {
    patch.settings = validateSettingsForType(nextType, existing.settings);
  }

  return patch;
}

export function validateGlobalStatus(value: unknown): GlobalQuestionStatus {
  if (!["active", "inactive", "deprecated"].includes(String(value))) {
    throw badRequest("global_question_status_invalid", "Global question status is invalid.");
  }

  return value as GlobalQuestionStatus;
}

export function validateOrganizationStatus(value: unknown): OrganizationQuestionStatus {
  if (!["active", "inactive"].includes(String(value))) {
    throw badRequest(
      "organization_question_status_invalid",
      "Organization question status is invalid."
    );
  }

  return value as OrganizationQuestionStatus;
}

function rejectOutOfScopeFields(input: QuestionContentInput) {
  const forbiddenFields = [
    "weight",
    "score",
    "scoring",
    "required",
    "isRequired",
    "correctAnswer",
    "correct_answer",
    "evaluationCriteria",
    "evaluation_criteria",
    "approvalCriteria",
    "approval_criteria"
  ] as const;

  for (const field of forbiddenFields) {
    if (input[field] !== undefined) {
      throw badRequest(
        "question_contextual_field_forbidden",
        "Contextual question field is forbidden."
      );
    }
  }
}

function validateDisplayCode(value: unknown) {
  const code = String(value ?? "").trim();

  if (code.length < 2 || code.length > 50 || !codePattern.test(code)) {
    throw badRequest("question_code_invalid", "Question code is invalid.");
  }

  return code;
}

function validateTitle(value: unknown) {
  const title = String(value ?? "").trim();

  if (title.length < 2 || title.length > 150) {
    throw badRequest("question_title_invalid", "Question title is invalid.");
  }

  return title;
}

function validateQuestionText(value: unknown) {
  const text = String(value ?? "").trim();

  if (text.length < 2 || text.length > 4000) {
    throw badRequest("question_text_invalid", "Question text is invalid.");
  }

  return text;
}

function validateLongOptionalText(value: unknown, code: string) {
  const text = normalizeText(value) ?? "";

  if (text.length > 4000) {
    throw badRequest(code, "Question text field is too long.");
  }

  return text;
}

function validateQuestionType(value: unknown): QuestionType {
  if (!questionTypes.includes(value as QuestionType)) {
    throw badRequest("question_type_invalid", "Question type is invalid.");
  }

  return value as QuestionType;
}

function validateQuestionCategory(value: unknown): QuestionCategory {
  if (!questionCategories.includes(value as QuestionCategory)) {
    throw badRequest("question_category_invalid", "Question category is invalid.");
  }

  return value as QuestionCategory;
}

function validateOptionsForType(type: QuestionType, value: unknown): QuestionOption[] {
  const rawOptions = value ?? [];

  if (!choiceTypes.includes(type)) {
    if (Array.isArray(rawOptions) && rawOptions.length === 0) {
      return [];
    }

    throw badRequest("question_options_not_allowed", "Question options are not allowed.");
  }

  if (!Array.isArray(rawOptions) || rawOptions.length < 2 || rawOptions.length > 50) {
    throw badRequest("question_options_invalid", "Question options are invalid.");
  }

  const optionIds = new Set<string>();

  return rawOptions.map((item, index) => {
    const entry = normalizeObject(item, "question_options");
    const id = String(entry.id ?? "").trim();
    const text = String(entry.text ?? "").trim();
    const displayOrder = Number(entry.displayOrder ?? entry.display_order ?? index);
    const status = String(entry.status ?? "active");

    if (
      !id ||
      optionIds.has(id) ||
      !text ||
      text.length > 500 ||
      !Number.isInteger(displayOrder) ||
      displayOrder < 0 ||
      status !== "active"
    ) {
      throw badRequest("question_options_invalid", "Question option is invalid.");
    }

    optionIds.add(id);
    return { id, text, displayOrder, status: "active" };
  });
}

function validateSettingsForType(type: QuestionType, value: unknown): QuestionSettings {
  if (type === "scale") {
    return validateScaleSettings(value);
  }

  if (type === "numeric") {
    return validateNumericSettings(value ?? {});
  }

  const settings = value ?? {};

  if (isEmptyObject(settings)) {
    return {};
  }

  throw badRequest("question_settings_not_allowed", "Question settings are not allowed.");
}

function validateScaleSettings(value: unknown): ScaleSettings {
  const settings = normalizeObject(value, "question_scale_settings");
  const min = Number(settings.min);
  const max = Number(settings.max);
  const step = Number(settings.step);
  const pointCount = Math.floor((max - min) / step) + 1;
  const minLabel = nullableLimitedText(settings.minLabel ?? settings.min_label, 100);
  const maxLabel = nullableLimitedText(settings.maxLabel ?? settings.max_label, 100);

  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    !Number.isFinite(step) ||
    min >= max ||
    step <= 0 ||
    pointCount > 20 ||
    !Number.isInteger((max - min) / step)
  ) {
    throw badRequest("question_scale_settings_invalid", "Question scale settings are invalid.");
  }

  return { min, max, step, minLabel, maxLabel };
}

function validateNumericSettings(value: unknown): NumericSettings {
  const settings = normalizeObject(value, "question_numeric_settings");
  const min = optionalFiniteNumber(settings.min, "question_numeric_settings_invalid");
  const max = optionalFiniteNumber(settings.max, "question_numeric_settings_invalid");
  const decimals =
    settings.decimals === undefined || settings.decimals === null
      ? null
      : Number(settings.decimals);
  const unit = nullableLimitedText(settings.unit, 50);

  if (
    (min !== null && max !== null && min > max) ||
    (decimals !== null && (!Number.isInteger(decimals) || decimals < 0))
  ) {
    throw badRequest("question_numeric_settings_invalid", "Question numeric settings are invalid.");
  }

  return { min, max, decimals, unit };
}

function validateCompetencyCatalogItemId(value: unknown, allowCompetency: boolean) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (!allowCompetency) {
    throw badRequest(
      "question_competency_not_allowed",
      "Global questions cannot reference organization competency catalog items."
    );
  }

  return String(value);
}

function optionalFiniteNumber(value: unknown, code: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw badRequest(code, "Question numeric setting is invalid.");
  }

  return number;
}

function nullableLimitedText(value: unknown, maxLength: number) {
  const text = normalizeText(value);

  if (text !== null && text.length > maxLength) {
    throw badRequest("question_setting_label_invalid", "Question setting label is invalid.");
  }

  return text;
}

function normalizeText(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text ? text : null;
}

function normalizeObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`${code}_invalid`, "Question structured field is invalid.");
  }

  return value as Record<string, unknown>;
}

function isEmptyObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.keys(value).length === 0;
}
