import { badRequest } from "../core/errors";
import type {
  AccessGrantAdminReadInput,
  AccessGrantCreateInput,
  AccessGrantProvenanceType,
  AccessGrantRevocationReasonCategory,
  AccessGrantRevokeInput
} from "./types";

const MAX_GRANT_REASON_LENGTH = 1000;
const PROVENANCE_TYPES: AccessGrantProvenanceType[] = ["employment", "administrative"];
const REVOCATION_REASON_CATEGORIES: AccessGrantRevocationReasonCategory[] = [
  "employment_ended",
  "role_change",
  "security_concern",
  "administrative_correction",
  "other_minimized"
];

// SPEC-027 s31: allow-list explicita. Nunca aceita organizationId, status, createdByUserId,
// timestamps, role ou qualquer metadata de auditoria vinda do payload.
export function validateCreateInput(input: AccessGrantCreateInput) {
  ensureAllowedKeys(input, [
    "organizationPersonId",
    "organization_person_id",
    "membershipId",
    "membership_id",
    "provenanceType",
    "provenance_type",
    "employmentId",
    "employment_id",
    "grantReason",
    "grant_reason"
  ]);

  const organizationPersonId = requiredText(
    input.organizationPersonId ?? input.organization_person_id,
    "organization_person_id",
    200
  );
  const membershipId = requiredText(
    input.membershipId ?? input.membership_id,
    "membership_id",
    200
  );
  const provenanceType = requiredProvenanceType(input.provenanceType ?? input.provenance_type);
  const employmentId = optionalId(input.employmentId ?? input.employment_id, "employment_id");
  const grantReason = optionalText(
    input.grantReason ?? input.grant_reason,
    "grant_reason",
    MAX_GRANT_REASON_LENGTH
  );

  // SPEC-027 s6/s9: exclusividade mutua fechada na aplicacao alem do CHECK fisico
  // (`access_grants_provenance_payload_check`) -- defesa em profundidade, erro de negocio
  // legivel em vez de um 23514 cru.
  if (provenanceType === "employment") {
    if (!employmentId) {
      throw badRequest("access_grant_employment_id_required", "employment_id is required.");
    }
    if (grantReason) {
      throw badRequest(
        "access_grant_grant_reason_not_allowed",
        "grant_reason is not allowed when provenance_type is employment."
      );
    }
  } else {
    if (employmentId) {
      throw badRequest(
        "access_grant_employment_id_not_allowed",
        "employment_id is not allowed when provenance_type is administrative."
      );
    }
    if (!grantReason) {
      throw badRequest("access_grant_grant_reason_required", "grant_reason is required.");
    }
  }

  return { organizationPersonId, membershipId, provenanceType, employmentId, grantReason };
}

export function validateRevokeInput(input: AccessGrantRevokeInput) {
  ensureAllowedKeys(input, ["revocationReasonCategory", "revocation_reason_category"]);
  const value = input.revocationReasonCategory ?? input.revocation_reason_category;
  if (
    typeof value !== "string" ||
    !REVOCATION_REASON_CATEGORIES.includes(value as AccessGrantRevocationReasonCategory)
  ) {
    throw badRequest(
      "revocation_reason_category_invalid",
      "revocation_reason_category is invalid."
    );
  }
  return { revocationReasonCategory: value as AccessGrantRevocationReasonCategory };
}

export function validateAdminReason(input: AccessGrantAdminReadInput) {
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
      throw badRequest("access_grant_unknown_field", `${key} is not allowed.`);
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

function requiredProvenanceType(value: unknown): AccessGrantProvenanceType {
  if (typeof value !== "string" || !PROVENANCE_TYPES.includes(value as AccessGrantProvenanceType)) {
    throw badRequest("provenance_type_invalid", "provenance_type is invalid.");
  }
  return value as AccessGrantProvenanceType;
}
