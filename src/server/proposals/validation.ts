import { badRequest } from "../core/errors";
import type {
  ProposalAdminReadInput,
  ProposalDraftInput,
  ProposalIssueInput,
  ProposalPublicActionInput,
  ProposalReasonInput
} from "./types";

const MAX_JSON_LENGTH = 20000;
const MAX_REASON_LENGTH = 1000;

export function validateDraftInput(input: ProposalDraftInput) {
  ensureAllowedKeys(input, [
    "contentSnapshot",
    "content_snapshot",
    "compensationSnapshot",
    "compensation_snapshot",
    "validUntil",
    "valid_until"
  ]);
  const content = objectValue(input.contentSnapshot ?? input.content_snapshot, "content_snapshot");
  const compensation = objectValue(
    input.compensationSnapshot ?? input.compensation_snapshot,
    "compensation_snapshot"
  );
  const validUntil = optionalIsoDate(input.validUntil ?? input.valid_until, "valid_until");
  return { contentSnapshot: content, compensationSnapshot: compensation, validUntil };
}

export function validateIssueInput(input: ProposalIssueInput) {
  ensureAllowedKeys(input, [
    "proposalVersionId",
    "proposal_version_id",
    "stageChangeReason",
    "stage_change_reason"
  ]);
  const proposalVersionId = requiredText(
    input.proposalVersionId ?? input.proposal_version_id,
    "proposal_version_id",
    200
  );
  const stageChangeReason = optionalText(
    input.stageChangeReason ?? input.stage_change_reason,
    "stage_change_reason",
    MAX_REASON_LENGTH
  );
  return { proposalVersionId, stageChangeReason };
}

export function validateReasonInput(input: ProposalReasonInput, code: string) {
  ensureAllowedKeys(input, ["reason"]);
  const reason = optionalText(input.reason, "reason", MAX_REASON_LENGTH);
  if (!reason) {
    throw badRequest(code, "Reason is required.");
  }
  return reason;
}

export function validatePublicActionInput(input: ProposalPublicActionInput) {
  ensureAllowedKeys(input, ["declineReason", "decline_reason"]);
  return {
    declineReason: optionalText(
      input.declineReason ?? input.decline_reason,
      "decline_reason",
      MAX_REASON_LENGTH
    )
  };
}

export function validateAdminReason(input: ProposalAdminReadInput) {
  ensureAllowedKeys(input, ["reason"]);
  return validateReasonInput(input, "proposal_admin_reason_required");
}

export function validateIdempotencyKey(value: unknown) {
  const text = requiredText(value, "idempotency_key", 200);
  if (text.length < 8) {
    throw badRequest("idempotency_key_invalid", "Idempotency-Key is invalid.");
  }
  return text;
}

function objectValue(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`${field}_invalid`, `${field} must be an object.`);
  }
  const json = JSON.stringify(value);
  if (json.length > MAX_JSON_LENGTH) {
    throw badRequest(`${field}_too_large`, `${field} is too large.`);
  }
  return value as Record<string, unknown>;
}

function optionalIsoDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value);
  const time = new Date(text).getTime();
  if (!Number.isFinite(time)) {
    throw badRequest(`${field}_invalid`, `${field} must be a valid date.`);
  }
  return new Date(time).toISOString();
}

function requiredText(value: unknown, field: string, limit: number) {
  const text = optionalText(value, field, limit);
  if (!text) {
    throw badRequest(`${field}_required`, `${field} is required.`);
  }
  return text;
}

function optionalText(value: unknown, field: string, limit: number) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (text.length === 0 || text.length > limit) {
    throw badRequest(`${field}_invalid`, `${field} is invalid.`);
  }
  return text;
}

function ensureAllowedKeys(input: Record<string, unknown>, allowed: string[]) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(input ?? {})) {
    if (!allowedSet.has(key)) {
      throw badRequest("proposal_mass_assignment", "Request contains protected fields.");
    }
  }
}
