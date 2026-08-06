import { badRequest } from "../core/errors";
import type {
  ApplicationSource,
  ApplicationStage,
  CandidateApplicationAdminReadInput,
  CandidateApplicationFinalizationInput,
  CandidateApplicationInput,
  CandidateApplicationNoteInput,
  CandidateApplicationStageInput
} from "./types";

export const applicationStages: ApplicationStage[] = [
  "applied",
  "screening",
  "interview",
  "assessment",
  "offer",
  "completed"
];

const stageSet = new Set<ApplicationStage>(applicationStages);
const sources = new Set<ApplicationSource>([
  "career_page",
  "referral",
  "recruiter",
  "import",
  "manual",
  "other"
]);

export function validateCreateApplication(input: CandidateApplicationInput) {
  return {
    candidateId: validateId(input.candidateId ?? input.candidate_id, "candidate_id"),
    jobOpeningId: validateId(input.jobOpeningId ?? input.job_opening_id, "job_opening_id"),
    jobOpeningVersionId: validateId(
      input.jobOpeningVersionId ?? input.job_opening_version_id,
      "job_opening_version_id"
    ),
    source: validateSource(input.source)
  };
}

export function validateStageInput(input: CandidateApplicationStageInput) {
  return {
    currentStage: validateStage(input.currentStage ?? input.current_stage),
    reason: validateOptionalText(input.reason ?? input.motive, 1000)
  };
}

export function validateFinalizationInput(input: CandidateApplicationFinalizationInput) {
  return validateText(
    input.reason ?? input.finalizationReason ?? input.finalization_reason,
    1000,
    "finalization_reason"
  );
}

export function validateNoteInput(input: CandidateApplicationNoteInput) {
  return validateText(input.content, 10000, "note");
}

export function requireAdminReason(input: CandidateApplicationAdminReadInput) {
  return validateText(input.reason, 500, "admin_reason");
}

export function validateId(value: unknown, code: string) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 120) {
    throw badRequest(`candidate_application_${code}_invalid`, "Application id is invalid.");
  }
  return text;
}

export function validateStage(value: unknown): ApplicationStage {
  const stage = String(value ?? "");
  if (!stageSet.has(stage as ApplicationStage)) {
    throw badRequest("candidate_application_stage_invalid", "Application stage is invalid.");
  }
  return stage as ApplicationStage;
}

export function ensureNoProtectedAssignment(input: unknown, allowedKeys: string[]) {
  const entry = normalizeInputObject(input);
  const allowed = new Set(allowedKeys);
  const protectedKeys = [
    "id",
    "organizationId",
    "organization_id",
    "applicationStatus",
    "application_status",
    "currentStage",
    "current_stage",
    "appliedAt",
    "applied_at",
    "finalizedAt",
    "finalized_at",
    "finalizedByUserId",
    "finalized_by_user_id",
    "finalizationReason",
    "finalization_reason",
    "createdByUserId",
    "created_by_user_id",
    "updatedByUserId",
    "updated_by_user_id",
    "createdAt",
    "created_at",
    "updatedAt",
    "updated_at"
  ];
  for (const key of protectedKeys) {
    if (!allowed.has(key) && entry[key] !== undefined) {
      throw badRequest(
        "candidate_application_mass_assignment_denied",
        "Application protected fields cannot be assigned by client."
      );
    }
  }
}

function validateSource(value: unknown): ApplicationSource {
  const source = String(value ?? "manual").trim();
  if (!sources.has(source as ApplicationSource)) {
    throw badRequest("candidate_application_source_invalid", "Application source is invalid.");
  }
  return source as ApplicationSource;
}

function validateText(value: unknown, maxLength: number, code: string) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw badRequest(`candidate_application_${code}_invalid`, "Application text is invalid.");
  }
  return text;
}

function validateOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw badRequest("candidate_application_text_too_long", "Application text is too long.");
  }
  return text || null;
}

function normalizeInputObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("candidate_application_input_invalid", "Application input is invalid.");
  }
  return value as Record<string, unknown>;
}
