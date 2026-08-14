import { createHash } from "node:crypto";
import { badRequest } from "../core/errors";
import type {
  CandidateDossierAdminReadInput,
  CandidateDossierGenerateInput,
  CandidateDossierGenerationKind
} from "./types";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;

export function validateId(value: unknown, code: string) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) {
    throw badRequest(code, "Invalid identifier.");
  }
  return value;
}

export function validateIdempotencyKey(value: unknown) {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) {
    throw badRequest("invalid_idempotency_key", "A valid Idempotency-Key header is required.");
  }
  return value;
}

export function hashIdempotencyKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function validateGenerateInput(input: CandidateDossierGenerateInput) {
  const candidateApplicationId = validateId(
    input.candidateApplicationId ?? input.candidate_application_id,
    "candidate_application_id_invalid"
  );
  const rawKind = input.generationKind ?? input.generation_kind ?? "regular";
  if (rawKind !== "regular" && rawKind !== "final_record") {
    throw badRequest("candidate_dossier_generation_kind_invalid", "Invalid generation kind.");
  }
  const generationKind = rawKind as CandidateDossierGenerationKind;
  const rawReason = input.finalRecordReason ?? input.final_record_reason ?? null;
  const finalRecordReason =
    rawReason === null || rawReason === undefined ? null : String(rawReason).trim();
  if (generationKind === "final_record" && !finalRecordReason) {
    throw badRequest(
      "candidate_dossier_final_record_reason_required",
      "Final record reason is required."
    );
  }
  if (generationKind === "regular" && finalRecordReason) {
    throw badRequest(
      "candidate_dossier_final_record_reason_forbidden",
      "Final record reason is only allowed for final records."
    );
  }
  if (finalRecordReason && finalRecordReason.length > 1000) {
    throw badRequest(
      "candidate_dossier_final_record_reason_too_long",
      "Final record reason is too long."
    );
  }
  return { candidateApplicationId, generationKind, finalRecordReason };
}

export function validateAdminReadInput(input: CandidateDossierAdminReadInput) {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < 5 || reason.length > 1000) {
    throw badRequest("candidate_dossier_admin_read_reason_required", "A reason is required.");
  }
  const candidateDossierId = validateId(
    input.candidateDossierId ?? input.candidate_dossier_id,
    "candidate_dossier_id_invalid"
  );
  return { reason, candidateDossierId };
}
