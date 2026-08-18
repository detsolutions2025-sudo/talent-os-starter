import { createHash } from "node:crypto";
import { badRequest } from "../core/errors";
import type {
  DevelopmentCheckInCreateInput,
  DevelopmentCheckInVisibility,
  DevelopmentGoalCancelInput,
  DevelopmentGoalCreateInput,
  DevelopmentPlanCancelInput,
  DevelopmentPlanCreateInput,
  DevelopmentRetentionAdminReadInput,
  RetentionActionCancelInput,
  RetentionActionCreateInput,
  RetentionActionType,
  RetentionConcernCancelInput,
  RetentionConcernCategory,
  RetentionConcernCreateInput,
  RetentionConcernResolveInput,
  RetentionConcernSource
} from "./types";

const MAX_REASON_LENGTH = 1000;

export function validateCreatePlanInput(input: DevelopmentPlanCreateInput) {
  ensureAllowedKeys(input, ["title", "purpose", "assigneeMembershipId", "assignee_membership_id"]);
  return {
    title: requiredText(input.title, "title", 200),
    purpose: optionalText(input.purpose, "purpose", 1000),
    assigneeMembershipId: optionalId(input.assigneeMembershipId ?? input.assignee_membership_id)
  };
}

export function validateCancelPlanInput(input: DevelopmentPlanCancelInput) {
  ensureAllowedKeys(input, ["reason"]);
  const reason = optionalText(input.reason, "reason", MAX_REASON_LENGTH);
  if (!reason) {
    throw badRequest("development_plan_cancel_reason_required", "Reason is required.");
  }
  return reason;
}

export function validateCreateGoalInput(input: DevelopmentGoalCreateInput) {
  ensureAllowedKeys(input, ["title", "description", "dueDate", "due_date"]);
  return {
    title: requiredText(input.title, "title", 200),
    description: optionalText(input.description, "description", 2000),
    dueDate: optionalDate(input.dueDate ?? input.due_date, "due_date")
  };
}

export function validateCancelGoalInput(input: DevelopmentGoalCancelInput) {
  ensureAllowedKeys(input, ["reason"]);
  const reason = optionalText(input.reason, "reason", MAX_REASON_LENGTH);
  if (!reason) {
    throw badRequest("development_goal_cancel_reason_required", "Reason is required.");
  }
  return reason;
}

export function validateCreateCheckInInput(input: DevelopmentCheckInCreateInput) {
  ensureAllowedKeys(input, ["summary", "visibility"]);
  return {
    summary: requiredText(input.summary, "summary", 2000),
    visibility: requiredVisibility(input.visibility)
  };
}

export function validateCreateConcernInput(input: RetentionConcernCreateInput) {
  ensureAllowedKeys(input, ["source", "category", "description", "visibility"]);
  return {
    source: requiredSource(input.source),
    category: requiredCategory(input.category),
    description: requiredText(input.description, "description", 2000),
    visibility: requiredVisibility(input.visibility)
  };
}

export function validateResolveConcernInput(input: RetentionConcernResolveInput) {
  ensureAllowedKeys(input, ["resolutionSummary", "resolution_summary"]);
  const summary = optionalText(
    input.resolutionSummary ?? input.resolution_summary,
    "resolution_summary",
    MAX_REASON_LENGTH
  );
  if (!summary) {
    throw badRequest(
      "retention_concern_resolution_summary_required",
      "Resolution summary is required."
    );
  }
  return summary;
}

export function validateCancelConcernInput(input: RetentionConcernCancelInput) {
  ensureAllowedKeys(input, ["reason"]);
  const reason = optionalText(input.reason, "reason", MAX_REASON_LENGTH);
  if (!reason) {
    throw badRequest("retention_concern_cancel_reason_required", "Reason is required.");
  }
  return reason;
}

export function validateCreateActionInput(input: RetentionActionCreateInput) {
  ensureAllowedKeys(input, [
    "retentionConcernId",
    "retention_concern_id",
    "actionType",
    "action_type",
    "description"
  ]);
  return {
    retentionConcernId: optionalId(input.retentionConcernId ?? input.retention_concern_id),
    actionType: requiredActionType(input.actionType ?? input.action_type),
    description: requiredText(input.description, "description", 2000)
  };
}

export function validateCancelActionInput(input: RetentionActionCancelInput) {
  ensureAllowedKeys(input, ["reason"]);
  const reason = optionalText(input.reason, "reason", MAX_REASON_LENGTH);
  if (!reason) {
    throw badRequest("retention_action_cancel_reason_required", "Reason is required.");
  }
  return reason;
}

export function validateAdminReason(input: DevelopmentRetentionAdminReadInput) {
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

export function reasonHash(value: string | null) {
  return value ? createHash("sha256").update(value).digest("hex") : null;
}

function ensureAllowedKeys(input: Record<string, unknown>, allowed: string[]) {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw badRequest("development_retention_unknown_field", `${key} is not allowed.`);
    }
  }
}

function requiredVisibility(value: unknown): DevelopmentCheckInVisibility {
  if (value !== "owner_admin_only" && value !== "owner_admin_and_assignee") {
    throw badRequest("visibility_invalid", "visibility is invalid.");
  }
  return value;
}

function requiredSource(value: unknown): RetentionConcernSource {
  const allowed: RetentionConcernSource[] = [
    "person_explicit_statement",
    "human_observation",
    "development_check_in",
    "administrative_decision"
  ];
  if (typeof value !== "string" || !allowed.includes(value as RetentionConcernSource)) {
    throw badRequest("retention_concern_source_invalid", "source is invalid.");
  }
  return value as RetentionConcernSource;
}

function requiredCategory(value: unknown): RetentionConcernCategory {
  const allowed: RetentionConcernCategory[] = [
    "career_growth",
    "work_context",
    "management_attention",
    "role_fit",
    "other_minimized"
  ];
  if (typeof value !== "string" || !allowed.includes(value as RetentionConcernCategory)) {
    throw badRequest("retention_concern_category_invalid", "category is invalid.");
  }
  return value as RetentionConcernCategory;
}

function requiredActionType(value: unknown): RetentionActionType {
  const allowed: RetentionActionType[] = [
    "conversation",
    "follow_up",
    "role_context_review",
    "development_alignment",
    "administrative_support",
    "other_minimized"
  ];
  if (typeof value !== "string" || !allowed.includes(value as RetentionActionType)) {
    throw badRequest("retention_action_type_invalid", "action_type is invalid.");
  }
  return value as RetentionActionType;
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

function optionalId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, "id", 200);
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
