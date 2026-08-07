import { badRequest } from "../core/errors";
import type {
  InterviewDraftInput,
  InterviewEvaluationInput,
  InterviewInput,
  InterviewLocationType,
  InterviewParticipantInput,
  InterviewParticipantRole,
  InterviewQuestionInput,
  InterviewQuestionType,
  InterviewReasonInput,
  InterviewRecommendation,
  InterviewResponseInput,
  InterviewScheduleInput,
  InterviewType
} from "./types";

export const interviewTypes: InterviewType[] = [
  "screening",
  "behavioral",
  "technical",
  "cultural",
  "leadership",
  "management",
  "panel",
  "final",
  "other"
];

export const locationTypes: InterviewLocationType[] = ["onsite", "video", "phone", "other"];
export const participantRoles: InterviewParticipantRole[] = ["lead", "interviewer", "observer"];
export const recommendations: InterviewRecommendation[] = [
  "strong_no",
  "no",
  "neutral",
  "yes",
  "strong_yes"
];

const responseTypesWithText = new Set<InterviewQuestionType>([
  "open_text",
  "long_text",
  "situational",
  "behavioral",
  "technical"
]);

export function validateCreateInterview(input: InterviewInput) {
  ensureNoProtectedAssignment(input, [
    "candidateApplicationId",
    "candidate_application_id",
    "title",
    "type",
    "timezone",
    "locationType",
    "location_type",
    "locationDetails",
    "location_details",
    "interviewerInstructions",
    "interviewer_instructions",
    "candidateInstructions",
    "candidate_instructions"
  ]);
  return {
    candidateApplicationId: validateId(
      input.candidateApplicationId ?? input.candidate_application_id,
      "candidate_application_id"
    ),
    title: validateText(input.title, 200, "title"),
    type: validateEnum(input.type, interviewTypes, "type"),
    timezone: validateOptionalText(input.timezone, 100) ?? "UTC",
    locationType: validateEnum(
      input.locationType ?? input.location_type,
      locationTypes,
      "location_type"
    ),
    locationDetails: validateOptionalText(input.locationDetails ?? input.location_details, 2000),
    interviewerInstructions: validateOptionalText(
      input.interviewerInstructions ?? input.interviewer_instructions,
      4000
    ),
    candidateInstructions: validateOptionalText(
      input.candidateInstructions ?? input.candidate_instructions,
      4000
    )
  };
}

export function validateDraftInput(input: InterviewDraftInput) {
  ensureNoProtectedAssignment(input, [
    "title",
    "type",
    "timezone",
    "locationType",
    "location_type",
    "locationDetails",
    "location_details",
    "interviewerInstructions",
    "interviewer_instructions",
    "candidateInstructions",
    "candidate_instructions"
  ]);
  return {
    title: input.title === undefined ? undefined : validateText(input.title, 200, "title"),
    type: input.type === undefined ? undefined : validateEnum(input.type, interviewTypes, "type"),
    timezone:
      input.timezone === undefined ? undefined : validateText(input.timezone, 100, "timezone"),
    locationType:
      input.locationType === undefined && input.location_type === undefined
        ? undefined
        : validateEnum(input.locationType ?? input.location_type, locationTypes, "location_type"),
    locationDetails:
      input.locationDetails === undefined && input.location_details === undefined
        ? undefined
        : validateOptionalText(input.locationDetails ?? input.location_details, 2000),
    interviewerInstructions:
      input.interviewerInstructions === undefined && input.interviewer_instructions === undefined
        ? undefined
        : validateOptionalText(
            input.interviewerInstructions ?? input.interviewer_instructions,
            4000
          ),
    candidateInstructions:
      input.candidateInstructions === undefined && input.candidate_instructions === undefined
        ? undefined
        : validateOptionalText(input.candidateInstructions ?? input.candidate_instructions, 4000)
  };
}

export function validateParticipantInput(input: InterviewParticipantInput) {
  ensureNoProtectedAssignment(input, ["userId", "user_id", "role"]);
  return {
    userId: validateId(input.userId ?? input.user_id, "user_id"),
    role: validateEnum(input.role, participantRoles, "participant_role")
  };
}

export function validateQuestionInput(input: InterviewQuestionInput) {
  ensureNoProtectedAssignment(input, [
    "questionCatalogItemId",
    "question_catalog_item_id",
    "displayOrder",
    "display_order",
    "required",
    "contextualWeight",
    "contextual_weight",
    "contextualCompetencyCatalogItemId",
    "contextual_competency_catalog_item_id"
  ]);
  return {
    questionCatalogItemId: validateId(
      input.questionCatalogItemId ?? input.question_catalog_item_id,
      "question_catalog_item_id"
    ),
    displayOrder: validateInteger(
      input.displayOrder ?? input.display_order ?? 0,
      0,
      1000,
      "display_order"
    ),
    required: Boolean(input.required ?? false),
    contextualWeight:
      input.contextualWeight === undefined && input.contextual_weight === undefined
        ? null
        : validateInteger(
            input.contextualWeight ?? input.contextual_weight,
            0,
            100,
            "contextual_weight"
          ),
    contextualCompetencyCatalogItemId: validateOptionalId(
      input.contextualCompetencyCatalogItemId ?? input.contextual_competency_catalog_item_id,
      "contextual_competency_catalog_item_id"
    )
  };
}

export function validateScheduleInput(input: InterviewScheduleInput) {
  ensureNoProtectedAssignment(input, [
    "scheduledStartAt",
    "scheduled_start_at",
    "scheduledEndAt",
    "scheduled_end_at",
    "timezone",
    "locationType",
    "location_type",
    "locationDetails",
    "location_details"
  ]);
  const scheduledStartAt = validateIso(
    input.scheduledStartAt ?? input.scheduled_start_at,
    "scheduled_start_at"
  );
  const scheduledEndAt = validateIso(
    input.scheduledEndAt ?? input.scheduled_end_at,
    "scheduled_end_at"
  );
  if (new Date(scheduledEndAt).getTime() <= new Date(scheduledStartAt).getTime()) {
    throw badRequest("interview_schedule_invalid", "Interview schedule is invalid.");
  }
  return {
    scheduledStartAt,
    scheduledEndAt,
    timezone: validateText(input.timezone, 100, "timezone"),
    locationType: validateEnum(
      input.locationType ?? input.location_type,
      locationTypes,
      "location_type"
    ),
    locationDetails: validateOptionalText(input.locationDetails ?? input.location_details, 2000)
  };
}

export function validateResponseInput(
  input: InterviewResponseInput,
  questionType: InterviewQuestionType
) {
  ensureNoProtectedAssignment(input, [
    "interviewQuestionId",
    "interview_question_id",
    "responseValue",
    "response_value",
    "interviewerObservation",
    "interviewer_observation"
  ]);
  const value = input.responseValue ?? input.response_value;
  validateResponseValue(value, questionType);
  return {
    interviewQuestionId: validateId(
      input.interviewQuestionId ?? input.interview_question_id,
      "interview_question_id"
    ),
    responseValue: value,
    interviewerObservation: validateOptionalText(
      input.interviewerObservation ?? input.interviewer_observation,
      4000
    )
  };
}

export function validateEvaluationInput(input: InterviewEvaluationInput) {
  ensureNoProtectedAssignment(input, [
    "recommendation",
    "summary",
    "strengths",
    "attentionPoints",
    "attention_points",
    "overallRating",
    "overall_rating"
  ]);
  return {
    recommendation: validateEnum(input.recommendation, recommendations, "recommendation"),
    summary: validateText(input.summary, 4000, "summary"),
    strengths: validateOptionalText(input.strengths, 4000) ?? "",
    attentionPoints:
      validateOptionalText(input.attentionPoints ?? input.attention_points, 4000) ?? "",
    overallRating: validateInteger(
      input.overallRating ?? input.overall_rating,
      1,
      5,
      "overall_rating"
    )
  };
}

export function validateReason(input: InterviewReasonInput, code = "reason") {
  return validateText(input.reason, 1000, code);
}

export function validateAdminReason(input: InterviewReasonInput) {
  return validateText(input.reason, 500, "admin_reason");
}

export function validateId(value: unknown, code: string) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 120) {
    throw badRequest(`interview_${code}_invalid`, "Interview id is invalid.");
  }
  return text;
}

function validateOptionalId(value: unknown, code: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return validateId(value, code);
}

function validateText(value: unknown, maxLength: number, code: string) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw badRequest(`interview_${code}_invalid`, "Interview text is invalid.");
  }
  return text;
}

function validateOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw badRequest("interview_text_too_long", "Interview text is too long.");
  }
  return text || null;
}

function validateEnum<T extends string>(value: unknown, allowed: readonly T[], code: string): T {
  const text = String(value ?? "").trim();
  if (!allowed.includes(text as T)) {
    throw badRequest(`interview_${code}_invalid`, "Interview enum value is invalid.");
  }
  return text as T;
}

function validateInteger(value: unknown, min: number, max: number, code: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw badRequest(`interview_${code}_invalid`, "Interview number is invalid.");
  }
  return number;
}

function validateIso(value: unknown, code: string) {
  const text = String(value ?? "").trim();
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) {
    throw badRequest(`interview_${code}_invalid`, "Interview date is invalid.");
  }
  return date.toISOString();
}

function validateResponseValue(value: unknown, questionType: InterviewQuestionType) {
  if (responseTypesWithText.has(questionType)) {
    validateText(value, 10000, "response_value");
    return;
  }
  if (questionType === "single_choice" || questionType === "date") {
    validateText(value, 1000, "response_value");
    return;
  }
  if (questionType === "multiple_choice") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw badRequest("interview_response_value_invalid", "Interview response is invalid.");
    }
    return;
  }
  if (questionType === "yes_no") {
    if (typeof value !== "boolean") {
      throw badRequest("interview_response_value_invalid", "Interview response is invalid.");
    }
    return;
  }
  if (questionType === "numeric" || questionType === "scale") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw badRequest("interview_response_value_invalid", "Interview response is invalid.");
    }
  }
}

function ensureNoProtectedAssignment(input: unknown, allowedKeys: string[]) {
  const entry = normalizeInputObject(input);
  const allowed = new Set(allowedKeys);
  const protectedKeys = [
    "id",
    "organizationId",
    "organization_id",
    "candidateApplicationId",
    "candidate_application_id",
    "status",
    "startedAt",
    "started_at",
    "completedAt",
    "completed_at",
    "cancelledAt",
    "cancelled_at",
    "cancelledByUserId",
    "cancelled_by_user_id",
    "noShowAt",
    "no_show_at",
    "noShowByUserId",
    "no_show_by_user_id",
    "evaluatorUserId",
    "evaluator_user_id",
    "createdByUserId",
    "created_by_user_id",
    "updatedByUserId",
    "updated_by_user_id",
    "createdAt",
    "created_at",
    "updatedAt",
    "updated_at",
    "actor",
    "metadata"
  ];
  for (const key of protectedKeys) {
    if (!allowed.has(key) && entry[key] !== undefined) {
      throw badRequest(
        "interview_mass_assignment_denied",
        "Interview protected fields cannot be assigned by client."
      );
    }
  }
}

function normalizeInputObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("interview_input_invalid", "Interview input is invalid.");
  }
  return value as Record<string, unknown>;
}
