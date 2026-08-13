import { badRequest } from "../core/errors";
import type {
  PreAnalysisAdminReadInput,
  PreAnalysisReasonInput,
  PreAnalysisRequestInput
} from "./types";

export function validateId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`pre_analysis_${field}_invalid`, `${field} is required.`);
  }
  return value;
}

export function validateRequestInput(input: PreAnalysisRequestInput) {
  const candidateApplicationId = validateId(
    input.candidateApplicationId ?? input.candidate_application_id,
    "candidate_application_id"
  );
  return { candidateApplicationId };
}

export function validateReasonInput(input: PreAnalysisReasonInput): string {
  const reason = input.reason;
  if (typeof reason !== "string" || reason.trim().length < 3 || reason.length > 1000) {
    throw badRequest(
      "pre_analysis_reason_invalid",
      "A reason between 3 and 1000 characters is required."
    );
  }
  return reason;
}

export function validateAdminReadInput(input: PreAnalysisAdminReadInput): string {
  return validateReasonInput(input as PreAnalysisReasonInput);
}
