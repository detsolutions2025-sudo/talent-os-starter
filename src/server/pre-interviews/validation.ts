import { badRequest } from "../core/errors";
import {
  preInterviewQuestionCategories,
  preInterviewQuestionTypes,
  type PreInterviewQuestionType,
  type PreInterviewReasonInput,
  type PreInterviewResponseInput,
  type PreInterviewSettingsInput
} from "./types";

const freeTextTypes = new Set<PreInterviewQuestionType>([
  "open_text",
  "long_text",
  "situational",
  "behavioral",
  "technical"
]);

export function validateSettingsInput(input: PreInterviewSettingsInput) {
  ensureNoProtectedAssignment(input, ["enabled", "questions"]);
  const enabled = Boolean(input.enabled ?? false);
  const rawQuestions = Array.isArray(input.questions) ? input.questions : [];

  if (rawQuestions.length > 100) {
    throw badRequest("pre_interview_settings_question_limit", "Too many questions configured.");
  }

  const seen = new Set<string>();
  const questions = rawQuestions.map((entry, index) => {
    const record = normalizeInputObject(entry, "pre_interview_settings_question_invalid");
    const questionCatalogItemId = validateId(
      record.questionCatalogItemId ?? record.question_catalog_item_id,
      "question_catalog_item_id"
    );
    if (seen.has(questionCatalogItemId)) {
      throw badRequest(
        "pre_interview_settings_question_duplicate",
        "Question catalog item is duplicated in the settings."
      );
    }
    seen.add(questionCatalogItemId);
    return {
      questionCatalogItemId,
      displayOrder: validateInteger(
        record.displayOrder ?? record.display_order ?? index,
        0,
        1000,
        "display_order"
      ),
      required: Boolean(record.required ?? false)
    };
  });

  return { enabled, questions };
}

// Revisao destrutiva (Plano Tecnico, correcao final, item 26/27): a validacao anterior
// reaproveitava, sem revisar, o mesmo coercitivo `String(value ?? "")` de
// `interviews/validation.ts` para todo tipo de texto -- o que faz um array ou objeto enviado
// como resposta ser silenciosamente convertido em texto (ex.: `["a","b"]` -> `"a,b"`) em vez de
// recusado. Esta versao e estritamente mais rigorosa que a de Interview (nunca o contrario) e
// vive em um arquivo proprio, nunca importado por `interviews/`, portanto esta correcao nao
// altera nem arrisca nenhuma regressao do modulo de Entrevistas.
export function validateResponseInput(
  input: PreInterviewResponseInput,
  question: { snapshotType: PreInterviewQuestionType; snapshotOptions: unknown[] }
) {
  ensureNoProtectedAssignment(input, ["responseValue", "response_value"]);
  const rawValue = input.responseValue ?? input.response_value;
  const responseValue = validateResponseValue(
    rawValue,
    question.snapshotType,
    question.snapshotOptions
  );
  return { responseValue };
}

function validateResponseValue(
  value: unknown,
  questionType: PreInterviewQuestionType,
  options: unknown[]
): unknown {
  if (freeTextTypes.has(questionType)) {
    return validateStrictText(value, 10000);
  }
  if (questionType === "single_choice") {
    const text = validateStrictText(value, 1000);
    ensureValidOption(text, options);
    return text;
  }
  if (questionType === "multiple_choice") {
    if (!Array.isArray(value) || value.length === 0) {
      throw badRequest(
        "pre_interview_response_value_invalid",
        "Pre-interview response is invalid."
      );
    }
    const seen = new Set<string>();
    return value.map((item) => {
      const text = validateStrictText(item, 1000);
      ensureValidOption(text, options);
      if (seen.has(text)) {
        throw badRequest(
          "pre_interview_response_value_invalid",
          "Pre-interview response is invalid."
        );
      }
      seen.add(text);
      return text;
    });
  }
  if (questionType === "yes_no") {
    if (typeof value !== "boolean") {
      throw badRequest(
        "pre_interview_response_value_invalid",
        "Pre-interview response is invalid."
      );
    }
    return value;
  }
  if (questionType === "numeric" || questionType === "scale") {
    // `Number.isFinite` (nunca apenas `!Number.isNaN`) -- rejeita tambem Infinity/-Infinity,
    // que a checagem anterior deixava passar silenciosamente.
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw badRequest(
        "pre_interview_response_value_invalid",
        "Pre-interview response is invalid."
      );
    }
    return value;
  }
  if (questionType === "date") {
    const text = validateStrictText(value, 100);
    if (Number.isNaN(Date.parse(text))) {
      throw badRequest(
        "pre_interview_response_value_invalid",
        "Pre-interview response is invalid."
      );
    }
    return text;
  }
  throw badRequest("pre_interview_response_value_invalid", "Pre-interview response is invalid.");
}

// Nunca coage array/object para string via `String(value)` -- exige `typeof === "string"`
// estritamente antes de qualquer outra checagem.
function validateStrictText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    throw badRequest("pre_interview_response_value_invalid", "Pre-interview response is invalid.");
  }
  const text = value.trim();
  if (!text || text.length > maxLength) {
    throw badRequest("pre_interview_response_value_invalid", "Pre-interview response is invalid.");
  }
  return text;
}

// Valida a resposta de single_choice/multiple_choice contra as opcoes reais do snapshot da
// pergunta -- nunca aceita qualquer texto livre para um tipo que a propria pergunta restringe
// a um conjunto fechado de opcoes.
function ensureValidOption(value: string, options: unknown[]) {
  const validIds = new Set(
    options
      .map((option) =>
        option && typeof option === "object" ? (option as { id?: unknown }).id : undefined
      )
      .filter((id): id is string => typeof id === "string")
  );
  if (validIds.size > 0 && !validIds.has(value)) {
    throw badRequest("pre_interview_response_value_invalid", "Pre-interview response is invalid.");
  }
}

export function validateReason(input: PreInterviewReasonInput, code = "reason") {
  return validateText(input.reason, 1000, code);
}

export function validateAdminReason(input: PreInterviewReasonInput) {
  return validateText(input.reason, 500, "admin_reason");
}

export function validateId(value: unknown, code: string) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 120) {
    throw badRequest(`pre_interview_${code}_invalid`, "Pre-interview id is invalid.");
  }
  return text;
}

function validateText(value: unknown, maxLength: number, code: string) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw badRequest(`pre_interview_${code}_invalid`, "Pre-interview text is invalid.");
  }
  return text;
}

function validateInteger(value: unknown, min: number, max: number, code: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw badRequest(`pre_interview_${code}_invalid`, "Pre-interview number is invalid.");
  }
  return number;
}

function ensureNoProtectedAssignment(input: unknown, allowedKeys: string[]) {
  const entry = normalizeInputObject(input, "pre_interview_input_invalid");
  const allowed = new Set(allowedKeys);
  const protectedKeys = [
    "id",
    "organizationId",
    "organization_id",
    "candidateApplicationId",
    "candidate_application_id",
    "jobOpeningId",
    "job_opening_id",
    "jobOpeningVersionId",
    "job_opening_version_id",
    "blueprintVersionId",
    "blueprint_version_id",
    "previousAttemptId",
    "previous_attempt_id",
    "attemptNumber",
    "attempt_number",
    "status",
    "createdSource",
    "created_source",
    "createdByUserId",
    "created_by_user_id",
    "updatedByUserId",
    "updated_by_user_id",
    "createdAt",
    "created_at",
    "updatedAt",
    "updated_at",
    "availableAt",
    "available_at",
    "startedAt",
    "started_at",
    "completedAt",
    "completed_at",
    "cancelledAt",
    "cancelled_at",
    "cancelledByUserId",
    "cancelled_by_user_id",
    "expiredAt",
    "expired_at",
    "expiresAt",
    "expires_at",
    "snapshot",
    "snapshotTitle",
    "snapshotText",
    "snapshotType",
    "snapshotCategory",
    "snapshotOptions",
    "snapshotSettings",
    "contentFingerprint",
    "content_fingerprint",
    "tokenHash",
    "token_hash",
    "rawAccessToken",
    "raw_access_token",
    "submitted",
    "submittedAt",
    "submitted_at",
    "metadata",
    "actor",
    "score",
    "ranking",
    "aiExecutionId",
    "ai_execution_id"
  ];
  for (const key of protectedKeys) {
    if (!allowed.has(key) && entry[key] !== undefined) {
      throw badRequest(
        "pre_interview_mass_assignment_denied",
        "Pre-interview protected fields cannot be assigned by client."
      );
    }
  }
  return entry;
}

function normalizeInputObject(value: unknown, code: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(code, "Pre-interview input is invalid.");
  }
  return value as Record<string, unknown>;
}

export { preInterviewQuestionCategories, preInterviewQuestionTypes };
