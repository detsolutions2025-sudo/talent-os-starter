import { badRequest } from "../core/errors";
import type {
  OffboardingAdminReadInput,
  OffboardingAssignInput,
  OffboardingCreateInput,
  OffboardingExitCategory,
  OffboardingReasonInput,
  OffboardingTaskInput
} from "./types";

const MAX_REASON_LENGTH = 1000;
const EXIT_CATEGORIES: OffboardingExitCategory[] = [
  "voluntary_resignation",
  "involuntary_termination",
  "end_of_contract",
  "mutual_agreement",
  "other_minimized"
];

export function validateCreateInput(input: OffboardingCreateInput) {
  ensureAllowedKeys(input, [
    "exitCategory",
    "exit_category",
    "expectedLastDay",
    "expected_last_day"
  ]);
  return {
    exitCategory: optionalExitCategory(input.exitCategory ?? input.exit_category),
    expectedLastDay: optionalDate(
      input.expectedLastDay ?? input.expected_last_day,
      "expected_last_day"
    )
  };
}

export function validateTaskInput(input: unknown, requireInProgressReason: boolean) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw badRequest("offboarding_task_invalid", "Task input is invalid.");
  }
  const value = input as OffboardingTaskInput;
  ensureAllowedKeys(value, [
    "title",
    "description",
    "isRequired",
    "is_required",
    "assigneeMembershipId",
    "assignee_membership_id",
    "dueAt",
    "due_at",
    "displayOrder",
    "display_order",
    "creationReason",
    "creation_reason"
  ]);
  const creationReason = optionalText(
    value.creationReason ?? value.creation_reason,
    "creation_reason",
    MAX_REASON_LENGTH
  );
  if (requireInProgressReason && !creationReason) {
    throw badRequest("offboarding_task_creation_reason_required", "Creation reason is required.");
  }
  return {
    title: requiredText(value.title, "title", 200),
    description: optionalText(value.description, "description", 2000),
    isRequired: (value.isRequired ?? value.is_required ?? true) ? true : false,
    assigneeMembershipId: optionalId(
      value.assigneeMembershipId ?? value.assignee_membership_id,
      "assignee_membership_id"
    ),
    dueAt: optionalDateTime(value.dueAt ?? value.due_at, "due_at"),
    displayOrder: optionalInteger(value.displayOrder ?? value.display_order, "display_order"),
    creationReason
  };
}

export function validateAssignmentInput(input: OffboardingAssignInput) {
  ensureAllowedKeys(input, ["assigneeMembershipId", "assignee_membership_id"]);
  return {
    assigneeMembershipId: requiredText(
      input.assigneeMembershipId ?? input.assignee_membership_id,
      "assignee_membership_id",
      200
    )
  };
}

export function validateReasonInput(input: OffboardingReasonInput, code: string) {
  ensureAllowedKeys(input, ["reason", "cancellationReason", "cancellation_reason"]);
  const reason = optionalText(
    input.reason ?? input.cancellationReason ?? input.cancellation_reason,
    "reason",
    MAX_REASON_LENGTH
  );
  if (!reason) {
    throw badRequest(code, "Reason is required.");
  }
  return reason;
}

export function validateAdminReason(input: OffboardingAdminReadInput) {
  ensureAllowedKeys(input, ["reason"]);
  return requiredText(input.reason, "admin_reason", 500);
}

export function validateIdempotencyKey(value: unknown) {
  const key = requiredText(value, "idempotency_key", 200);
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) {
    throw badRequest("idempotency_key_invalid", "Idempotency-Key is invalid.");
  }
  return key;
}

function ensureAllowedKeys(input: Record<string, unknown>, allowed: string[]) {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw badRequest("offboarding_unknown_field", `${key} is not allowed.`);
    }
  }
}

function requiredText(value: unknown, field: string, max: number) {
  if (typeof value !== "string") {
    throw badRequest(`${field}_invalid`, `${field} is invalid.`);
  }
  const text = value.trim();
  if (!text || text.length > max) {
    throw badRequest(`${field}_invalid`, `${field} is invalid.`);
  }
  return text;
}

function optionalText(value: unknown, field: string, max: number) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, field, max);
}

function optionalId(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, field, 200);
}

function optionalInteger(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw badRequest(`${field}_invalid`, `${field} is invalid.`);
  }
  return number;
}

function optionalDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${field}_invalid`, `${field} is invalid.`);
  }
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(time)) {
    throw badRequest(`${field}_invalid`, `${field} is invalid.`);
  }
  return value;
}

function optionalDateTime(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw badRequest(`${field}_invalid`, `${field} is invalid.`);
  }
  return new Date(value).toISOString();
}

// SPEC-026 s19: exit_category e enum fechado; nunca texto livre. Sem "exit_notes".
function optionalExitCategory(value: unknown): OffboardingExitCategory | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !EXIT_CATEGORIES.includes(value as OffboardingExitCategory)) {
    throw badRequest("exit_category_invalid", "exit_category is invalid.");
  }
  return value as OffboardingExitCategory;
}
