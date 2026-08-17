import { createHash } from "node:crypto";
import { badRequest } from "../core/errors";
import type {
  EmploymentActivationInput,
  EmploymentAdminReadInput,
  EmploymentCreateInput,
  EmploymentOriginType,
  EmploymentReasonInput,
  OrganizationPersonInput
} from "./types";

const MAX_REASON_LENGTH = 1000;

export function validateCreatePersonInput(input: OrganizationPersonInput) {
  ensureAllowedKeys(input, [
    "displayName",
    "display_name",
    "preferredName",
    "preferred_name",
    "primaryEmail",
    "primary_email",
    "originCandidateId",
    "origin_candidate_id"
  ]);
  return {
    displayName: requiredText(input.displayName ?? input.display_name, "display_name", 200),
    preferredName: optionalText(input.preferredName ?? input.preferred_name, "preferred_name", 200),
    primaryEmail: optionalEmail(input.primaryEmail ?? input.primary_email),
    originCandidateId: optionalId(input.originCandidateId ?? input.origin_candidate_id)
  };
}

export function validateCreateEmploymentInput(input: EmploymentCreateInput) {
  ensureAllowedKeys(input, [
    "organizationPersonId",
    "organization_person_id",
    "displayName",
    "display_name",
    "preferredName",
    "preferred_name",
    "primaryEmail",
    "primary_email",
    "originCandidateId",
    "origin_candidate_id",
    "originType",
    "origin_type",
    "originReason",
    "origin_reason",
    "candidateApplicationId",
    "candidate_application_id",
    "proposalVersionId",
    "proposal_version_id",
    "decisionAt",
    "decision_at",
    "effectiveStartDate",
    "effective_start_date"
  ]);
  const originType = requiredOriginType(input.originType ?? input.origin_type);
  const organizationPersonId = optionalId(
    input.organizationPersonId ?? input.organization_person_id
  );
  const originCandidateId = optionalId(input.originCandidateId ?? input.origin_candidate_id);
  const candidateApplicationId = optionalId(
    input.candidateApplicationId ?? input.candidate_application_id
  );
  const proposalVersionId = optionalId(input.proposalVersionId ?? input.proposal_version_id);
  const displayName = optionalText(input.displayName ?? input.display_name, "display_name", 200);
  if (!organizationPersonId && !displayName && originType === "administrative") {
    throw badRequest("organization_person_required", "Organization person data is required.");
  }
  return {
    organizationPersonId,
    displayName,
    preferredName: optionalText(input.preferredName ?? input.preferred_name, "preferred_name", 200),
    primaryEmail: optionalEmail(input.primaryEmail ?? input.primary_email),
    originCandidateId,
    originType,
    originReason: requiredText(input.originReason ?? input.origin_reason, "origin_reason", 1000),
    candidateApplicationId,
    proposalVersionId,
    decisionAt: optionalDateTime(input.decisionAt ?? input.decision_at, "decision_at"),
    effectiveStartDate: requiredDate(
      input.effectiveStartDate ?? input.effective_start_date,
      "effective_start_date"
    )
  };
}

export function validateActivationInput(input: EmploymentActivationInput) {
  ensureAllowedKeys(input, ["reason"]);
  return {
    reasonHash: optionalReasonHash(input.reason)
  };
}

export function validateCancelInput(input: EmploymentReasonInput) {
  ensureAllowedKeys(input, ["reason", "cancellationReason", "cancellation_reason"]);
  const reason = optionalText(
    input.reason ?? input.cancellationReason ?? input.cancellation_reason,
    "reason",
    MAX_REASON_LENGTH
  );
  if (!reason) {
    throw badRequest("employment_cancel_reason_required", "Reason is required.");
  }
  return reason;
}

export function validateEndInput(input: EmploymentReasonInput) {
  ensureAllowedKeys(input, ["reason", "endReason", "end_reason", "endDate", "end_date"]);
  const reason = optionalText(
    input.reason ?? input.endReason ?? input.end_reason,
    "reason",
    MAX_REASON_LENGTH
  );
  if (!reason) {
    throw badRequest("employment_end_reason_required", "Reason is required.");
  }
  return {
    reason,
    endDate: requiredDate(input.endDate ?? input.end_date, "end_date")
  };
}

export function validateAdminReason(input: EmploymentAdminReadInput) {
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

function optionalReasonHash(value: unknown) {
  return reasonHash(optionalText(value, "reason", MAX_REASON_LENGTH));
}

function ensureAllowedKeys(input: Record<string, unknown>, allowed: string[]) {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw badRequest("employment_unknown_field", `${key} is not allowed.`);
    }
  }
}

function requiredOriginType(value: unknown): EmploymentOriginType {
  if (value !== "recruitment" && value !== "administrative") {
    throw badRequest("origin_type_invalid", "origin_type is invalid.");
  }
  return value;
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

function optionalEmail(value: unknown) {
  const email = optionalText(value, "primary_email", 320);
  if (!email) return null;
  const normalized = email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw badRequest("primary_email_invalid", "primary_email is invalid.");
  }
  return normalized;
}

function optionalId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, "id", 200);
}

function requiredDate(value: unknown, field: string) {
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
