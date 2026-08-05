import { badRequest } from "../core/errors";
import type { DnaCompetency, DnaDraftInput, DnaValue } from "./types";

const TEXT_LIMIT = 2000;
const NAME_LIMIT = 120;
const VALUE_LIMIT = 20;
const COMPETENCY_LIMIT = 30;
const BEHAVIOR_LIMIT = 20;
const importanceValues = new Set(["low", "medium", "high", "critical"]);

export function normalizeDraftInput(input: DnaDraftInput): Required<DnaDraftInput> {
  return {
    mission: normalizeText(input.mission),
    vision: normalizeText(input.vision),
    purpose: normalizeText(input.purpose),
    values: normalizeValues(input.values ?? []),
    competencies: normalizeCompetencies(input.competencies ?? []),
    culture: normalizeText(input.culture),
    leadershipStyle: normalizeText(input.leadershipStyle),
    workEnvironment: normalizeText(input.workEnvironment)
  };
}

export function mergeDraftInput(current: Required<DnaDraftInput>, input: DnaDraftInput) {
  return normalizeDraftInput({
    mission: input.mission ?? current.mission,
    vision: input.vision ?? current.vision,
    purpose: input.purpose ?? current.purpose,
    values: input.values ?? current.values,
    competencies: input.competencies ?? current.competencies,
    culture: input.culture ?? current.culture,
    leadershipStyle: input.leadershipStyle ?? current.leadershipStyle,
    workEnvironment: input.workEnvironment ?? current.workEnvironment
  });
}

export function validatePublishable(input: Required<DnaDraftInput>) {
  if (!input.mission) {
    throw badRequest("dna_mission_required", "Mission is required to publish DNA.");
  }

  if (!input.vision) {
    throw badRequest("dna_vision_required", "Vision is required to publish DNA.");
  }

  if (!input.purpose) {
    throw badRequest("dna_purpose_required", "Purpose is required to publish DNA.");
  }

  if (input.values.length < 1) {
    throw badRequest("dna_value_required", "At least one value is required to publish DNA.");
  }

  if (input.competencies.length < 1) {
    throw badRequest(
      "dna_competency_required",
      "At least one competency is required to publish DNA."
    );
  }
}

export function requireAdminReason(value: string | undefined) {
  const reason = normalizeText(value);

  if (!reason) {
    throw badRequest("dna_admin_reason_required", "Administrative read reason is required.");
  }

  return reason;
}

function normalizeValues(values: DnaValue[]) {
  if (!Array.isArray(values)) {
    throw badRequest("dna_values_invalid", "Values must be an array.");
  }

  if (values.length > VALUE_LIMIT) {
    throw badRequest("dna_values_limit", "DNA supports up to 20 values.");
  }

  return values.map((value) => {
    const normalized = {
      name: normalizeNamedText(value.name, "dna_value_name_limit", "Value name is too long."),
      description: normalizeText(value.description),
      practicalMeaning: normalizeText(value.practicalMeaning),
      expectedBehaviors: normalizeTextArray(
        value.expectedBehaviors,
        BEHAVIOR_LIMIT,
        "dna_expected_behaviors_limit"
      ),
      incompatibleBehaviors: normalizeTextArray(
        value.incompatibleBehaviors,
        BEHAVIOR_LIMIT,
        "dna_incompatible_behaviors_limit"
      )
    };

    if (normalized.description.length > TEXT_LIMIT) {
      throw badRequest("dna_value_description_limit", "Value description is too long.");
    }

    if (normalized.practicalMeaning.length > TEXT_LIMIT) {
      throw badRequest("dna_value_practical_meaning_limit", "Value practical meaning is too long.");
    }

    if (!normalized.name || !normalized.description) {
      throw badRequest("dna_value_required_fields", "Values require name and description.");
    }

    return normalized;
  });
}

function normalizeCompetencies(competencies: DnaCompetency[]) {
  if (!Array.isArray(competencies)) {
    throw badRequest("dna_competencies_invalid", "Competencies must be an array.");
  }

  if (competencies.length > COMPETENCY_LIMIT) {
    throw badRequest("dna_competencies_limit", "DNA supports up to 30 competencies.");
  }

  return competencies.map((competency) => {
    const importance = normalizeText(competency.importance);
    const normalized = {
      name: normalizeNamedText(
        competency.name,
        "dna_competency_name_limit",
        "Competency name is too long."
      ),
      description: normalizeText(competency.description),
      importance,
      examples: normalizeTextArray(competency.examples, BEHAVIOR_LIMIT, "dna_examples_limit")
    };

    if (normalized.description.length > TEXT_LIMIT) {
      throw badRequest("dna_competency_description_limit", "Competency description is too long.");
    }

    if (!importanceValues.has(normalized.importance)) {
      throw badRequest("dna_competency_importance_invalid", "Competency importance is invalid.");
    }

    if (!normalized.name || !normalized.description) {
      throw badRequest(
        "dna_competency_required_fields",
        "Competencies require name and description."
      );
    }

    return normalized as DnaCompetency;
  });
}

function normalizeText(value: unknown) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw badRequest("dna_text_invalid", "DNA text fields must be strings.");
  }

  const normalized = value.trim();

  if (normalized.length > TEXT_LIMIT) {
    throw badRequest("dna_text_limit", "DNA text field is too long.");
  }

  return normalized;
}

function normalizeNamedText(value: unknown, code: string, message: string) {
  const normalized = normalizeText(value);

  if (normalized.length > NAME_LIMIT) {
    throw badRequest(code, message);
  }

  return normalized;
}

function normalizeTextArray(value: unknown, limit: number, code: string) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw badRequest("dna_text_array_invalid", "DNA list fields must be arrays.");
  }

  if (value.length > limit) {
    throw badRequest(code, "DNA list field has too many items.");
  }

  return value.map((entry) => normalizeText(entry));
}
