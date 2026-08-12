import { badRequest } from "../core/errors";
import { behavioralInstrumentItemTypes, type BehavioralInstrumentItemType } from "./types";

const freeTextTypes = new Set<BehavioralInstrumentItemType>(["open_text"]);

export function validateId(value: unknown, code: string) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 120) {
    throw badRequest(`behavioral_assessment_${code}_invalid`, "Identifier is invalid.");
  }
  return text;
}

export function validateReason(
  input: { [key: string]: unknown; reason?: unknown },
  code = "reason"
) {
  return validateText(input.reason, 1000, code);
}

export function validateAdminReason(input: { [key: string]: unknown; reason?: unknown }) {
  return validateText(input.reason, 500, "admin_reason");
}

function validateText(value: unknown, maxLength: number, code: string) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw badRequest(`behavioral_assessment_${code}_invalid`, "Text is invalid.");
  }
  return text;
}

// ------------------------------------------------------------------------------------------
// Instrumento / Versao / Item
// ------------------------------------------------------------------------------------------

export function validateInstrumentInput(input: { [key: string]: unknown }) {
  const entry = ensureNoProtectedAssignment(
    input,
    ["name", "description"],
    INSTRUMENT_PROTECTED_KEYS
  );
  const name = String(entry.name ?? "").trim();
  if (!name || name.length < 2 || name.length > 150) {
    throw badRequest("behavioral_instrument_name_invalid", "Instrument name is invalid.");
  }
  const description = String(entry.description ?? "").trim();
  if (description.length > 4000) {
    throw badRequest(
      "behavioral_instrument_description_invalid",
      "Instrument description is invalid."
    );
  }
  return { name, description };
}

const INSTRUMENT_PROTECTED_KEYS = [
  "id",
  "scope",
  "organizationId",
  "organization_id",
  "status",
  "createdByUserId",
  "created_by_user_id",
  "updatedByUserId",
  "updated_by_user_id",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at"
];

export type ValidatedInstrumentVersionInput = {
  methodologyKey: string;
  calculationMethodVersion: string;
  dimensions: { code: string; name: string; description: string; required: boolean }[];
  instructions: string | null;
  candidateResultVisibility: "none" | "summary" | "full";
  rawResponseOwnerVisibility: "visible" | "restricted";
  items: ValidatedInstrumentItemInput[];
};

export type ValidatedInstrumentItemInput = {
  itemKey: string;
  itemType: BehavioralInstrumentItemType;
  promptText: string | null;
  externalItemReference: string | null;
  dimensionMapping: string[];
  scoringMetadata: Record<string, unknown>;
  options: unknown[];
  displayOrder: number;
  required: boolean;
};

export function validateInstrumentVersionInput(input: {
  [key: string]: unknown;
}): ValidatedInstrumentVersionInput {
  const entry = ensureNoProtectedAssignment(input, VERSION_ALLOWED_KEYS, VERSION_PROTECTED_KEYS);

  const methodologyKey = String(entry.methodologyKey ?? entry.methodology_key ?? "").trim();
  if (!methodologyKey || methodologyKey.length > 100) {
    throw badRequest(
      "behavioral_instrument_version_methodology_key_invalid",
      "methodologyKey is invalid."
    );
  }
  const calculationMethodVersion = String(
    entry.calculationMethodVersion ?? entry.calculation_method_version ?? ""
  ).trim();
  if (!calculationMethodVersion || calculationMethodVersion.length > 50) {
    throw badRequest(
      "behavioral_instrument_version_calculation_method_version_invalid",
      "calculationMethodVersion is invalid."
    );
  }

  const rawDimensions = Array.isArray(entry.dimensions) ? entry.dimensions : [];
  if (rawDimensions.length === 0 || rawDimensions.length > 20) {
    throw badRequest("behavioral_instrument_version_dimensions_invalid", "dimensions is invalid.");
  }
  const seenDimensionCodes = new Set<string>();
  const dimensions = rawDimensions.map((raw) => {
    const record = normalizeObject(raw, "behavioral_instrument_version_dimensions_invalid");
    const code = String(record.code ?? "").trim();
    if (!code || code.length > 100 || seenDimensionCodes.has(code)) {
      throw badRequest(
        "behavioral_instrument_version_dimensions_invalid",
        "dimension code is invalid."
      );
    }
    seenDimensionCodes.add(code);
    return {
      code,
      name: String(record.name ?? code)
        .trim()
        .slice(0, 150),
      description: String(record.description ?? "")
        .trim()
        .slice(0, 1000),
      required: Boolean(record.required ?? false)
    };
  });

  const instructionsRaw = entry.instructions;
  const instructions =
    instructionsRaw === undefined || instructionsRaw === null || instructionsRaw === ""
      ? null
      : String(instructionsRaw).trim().slice(0, 4000);

  const candidateResultVisibility = validateEnum(
    entry.candidateResultVisibility ?? entry.candidate_result_visibility ?? "none",
    ["none", "summary", "full"] as const,
    "behavioral_instrument_version_candidate_result_visibility_invalid"
  );
  const rawResponseOwnerVisibility = validateEnum(
    entry.rawResponseOwnerVisibility ?? entry.raw_response_owner_visibility ?? "visible",
    ["visible", "restricted"] as const,
    "behavioral_instrument_version_raw_response_owner_visibility_invalid"
  );

  const rawItems = Array.isArray(entry.items) ? entry.items : [];
  if (rawItems.length === 0 || rawItems.length > 100) {
    throw badRequest("behavioral_instrument_version_items_invalid", "items is invalid.");
  }
  const seenItemKeys = new Set<string>();
  const items = rawItems.map((raw, index) => {
    const record = normalizeObject(raw, "behavioral_instrument_version_items_invalid");
    const itemKey = String(record.itemKey ?? record.item_key ?? "").trim();
    if (!itemKey || itemKey.length > 100 || seenItemKeys.has(itemKey)) {
      throw badRequest("behavioral_instrument_item_key_invalid", "Item key is invalid.");
    }
    seenItemKeys.add(itemKey);
    const itemType = validateEnum(
      record.itemType ?? record.item_type,
      behavioralInstrumentItemTypes,
      "behavioral_instrument_item_type_invalid"
    );
    const promptText = record.promptText ?? record.prompt_text;
    const externalItemReference = record.externalItemReference ?? record.external_item_reference;
    const normalizedPrompt =
      promptText === undefined || promptText === null || promptText === ""
        ? null
        : String(promptText).trim();
    const normalizedExternalRef =
      externalItemReference === undefined ||
      externalItemReference === null ||
      externalItemReference === ""
        ? null
        : String(externalItemReference).trim();
    if (!normalizedPrompt && !normalizedExternalRef) {
      throw badRequest(
        "behavioral_instrument_item_content_invalid",
        "Item requires promptText or externalItemReference."
      );
    }
    const dimensionMappingRaw = Array.isArray(record.dimensionMapping ?? record.dimension_mapping)
      ? ((record.dimensionMapping ?? record.dimension_mapping) as unknown[])
      : [];
    const dimensionMapping = dimensionMappingRaw.map((entryCode) => String(entryCode));
    if (dimensionMapping.some((code) => !seenDimensionCodes.has(code))) {
      throw badRequest(
        "behavioral_instrument_item_dimension_mapping_invalid",
        "Item references a dimension outside the manifest."
      );
    }
    const optionsRaw = Array.isArray(record.options) ? record.options : [];
    if (["single_choice", "multiple_choice"].includes(itemType) && optionsRaw.length < 2) {
      throw badRequest(
        "behavioral_instrument_item_options_invalid",
        "Choice item requires at least 2 options."
      );
    }
    return {
      itemKey,
      itemType,
      promptText: normalizedPrompt,
      externalItemReference: normalizedExternalRef,
      dimensionMapping,
      scoringMetadata: normalizeObject(
        record.scoringMetadata ?? record.scoring_metadata ?? {},
        "behavioral_instrument_item_scoring_metadata_invalid"
      ),
      options: optionsRaw,
      displayOrder: Number.isInteger(record.displayOrder ?? record.display_order)
        ? Number(record.displayOrder ?? record.display_order)
        : index,
      required: Boolean(record.required ?? true)
    };
  });

  return {
    methodologyKey,
    calculationMethodVersion,
    dimensions,
    instructions,
    candidateResultVisibility,
    rawResponseOwnerVisibility,
    items
  };
}

const VERSION_ALLOWED_KEYS = [
  "methodologyKey",
  "methodology_key",
  "calculationMethodVersion",
  "calculation_method_version",
  "dimensions",
  "instructions",
  "candidateResultVisibility",
  "candidate_result_visibility",
  "rawResponseOwnerVisibility",
  "raw_response_owner_visibility",
  "items"
];
const VERSION_PROTECTED_KEYS = [
  "id",
  "behavioralInstrumentId",
  "behavioral_instrument_id",
  "status",
  "publishedAt",
  "published_at",
  "archivedAt",
  "archived_at",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at"
];

// ------------------------------------------------------------------------------------------
// Settings (organizacao/vaga)
// ------------------------------------------------------------------------------------------

export function validateOrganizationSettingsInput(input: { [key: string]: unknown }) {
  const entry = ensureNoProtectedAssignment(
    input,
    ["enabled"],
    [
      "id",
      "organizationId",
      "organization_id",
      "behavioralInstrumentId",
      "behavioral_instrument_id"
    ]
  );
  return { enabled: Boolean(entry.enabled ?? false) };
}

export function validateJobOpeningSettingsInput(input: { [key: string]: unknown }) {
  const entry = ensureNoProtectedAssignment(
    input,
    [
      "enabled",
      "behavioralInstrumentId",
      "behavioral_instrument_id",
      "behavioralInstrumentVersionId",
      "behavioral_instrument_version_id"
    ],
    ["id", "organizationId", "organization_id", "jobOpeningId", "job_opening_id"]
  );
  const enabled = Boolean(entry.enabled ?? false);
  const behavioralInstrumentId = entry.behavioralInstrumentId ?? entry.behavioral_instrument_id;
  const behavioralInstrumentVersionId =
    entry.behavioralInstrumentVersionId ?? entry.behavioral_instrument_version_id;
  if (enabled) {
    return {
      enabled,
      behavioralInstrumentId: validateId(behavioralInstrumentId, "instrument_id"),
      behavioralInstrumentVersionId: validateId(
        behavioralInstrumentVersionId,
        "instrument_version_id"
      )
    };
  }
  return { enabled, behavioralInstrumentId: null, behavioralInstrumentVersionId: null };
}

// ------------------------------------------------------------------------------------------
// Respostas -- mesmo rigor ja validado e enrijecido pela revisao destrutiva da Fase 18: nunca
// coercao silenciosa de tipo, single/multiple_choice validados contra as opcoes reais do item.
// ------------------------------------------------------------------------------------------

export function validateResponseInput(
  input: { [key: string]: unknown; responseValue?: unknown; response_value?: unknown },
  item: { itemType: BehavioralInstrumentItemType; options: unknown[] }
) {
  ensureNoProtectedAssignment(input, ["responseValue", "response_value"], RESPONSE_PROTECTED_KEYS);
  const rawValue = input.responseValue ?? input.response_value;
  return { responseValue: validateResponseValue(rawValue, item.itemType, item.options) };
}

function validateResponseValue(
  value: unknown,
  itemType: BehavioralInstrumentItemType,
  options: unknown[]
): unknown {
  if (freeTextTypes.has(itemType)) {
    return validateStrictText(value, 10000);
  }
  if (itemType === "single_choice") {
    const text = validateStrictText(value, 1000);
    ensureValidOption(text, options);
    return text;
  }
  if (itemType === "multiple_choice") {
    if (!Array.isArray(value) || value.length === 0) {
      throw badRequest("behavioral_assessment_response_value_invalid", "Response is invalid.");
    }
    const seen = new Set<string>();
    return value.map((entryValue) => {
      const text = validateStrictText(entryValue, 1000);
      ensureValidOption(text, options);
      if (seen.has(text)) {
        throw badRequest("behavioral_assessment_response_value_invalid", "Response is invalid.");
      }
      seen.add(text);
      return text;
    });
  }
  if (itemType === "yes_no") {
    if (typeof value !== "boolean") {
      throw badRequest("behavioral_assessment_response_value_invalid", "Response is invalid.");
    }
    return value;
  }
  if (itemType === "numeric" || itemType === "scale") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw badRequest("behavioral_assessment_response_value_invalid", "Response is invalid.");
    }
    return value;
  }
  throw badRequest("behavioral_assessment_response_value_invalid", "Response is invalid.");
}

function validateStrictText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    throw badRequest("behavioral_assessment_response_value_invalid", "Response is invalid.");
  }
  const text = value.trim();
  if (!text || text.length > maxLength) {
    throw badRequest("behavioral_assessment_response_value_invalid", "Response is invalid.");
  }
  return text;
}

function ensureValidOption(value: string, options: unknown[]) {
  const validIds = new Set(
    options
      .map((option) =>
        option && typeof option === "object" ? (option as { id?: unknown }).id : undefined
      )
      .filter((id): id is string => typeof id === "string")
  );
  if (validIds.size > 0 && !validIds.has(value)) {
    throw badRequest("behavioral_assessment_response_value_invalid", "Response is invalid.");
  }
}

const RESPONSE_PROTECTED_KEYS = [
  "id",
  "organizationId",
  "organization_id",
  "behavioralAssessmentId",
  "behavioral_assessment_id",
  "behavioralInstrumentItemId",
  "behavioral_instrument_item_id",
  "submitted",
  "submittedAt",
  "submitted_at",
  "score",
  "ranking",
  "aiExecutionId",
  "ai_execution_id"
];

// ------------------------------------------------------------------------------------------
// Importacao externa
// ------------------------------------------------------------------------------------------

export type ValidatedExternalImportInput = {
  behavioralInstrumentId: string;
  behavioralInstrumentVersionId: string;
  externalProvider: string;
  externalReferenceId: string | null;
  appliedAtExternal: string;
  completedAtExternal: string;
  summaryText: string | null;
  dimensions: { code: string; value: unknown; label?: string; interpretationText?: string }[];
};

export function validateExternalImportInput(input: {
  [key: string]: unknown;
}): ValidatedExternalImportInput {
  const entry = ensureNoProtectedAssignment(
    input,
    EXTERNAL_IMPORT_ALLOWED_KEYS,
    EXTERNAL_IMPORT_PROTECTED_KEYS
  );

  const behavioralInstrumentId = validateId(
    entry.behavioralInstrumentId ?? entry.behavioral_instrument_id,
    "instrument_id"
  );
  const behavioralInstrumentVersionId = validateId(
    entry.behavioralInstrumentVersionId ?? entry.behavioral_instrument_version_id,
    "instrument_version_id"
  );
  const externalProvider = String(entry.externalProvider ?? entry.external_provider ?? "").trim();
  if (!externalProvider || externalProvider.length > 150) {
    throw badRequest(
      "behavioral_assessment_external_provider_invalid",
      "externalProvider is invalid."
    );
  }
  const externalReferenceIdRaw = entry.externalReferenceId ?? entry.external_reference_id;
  const externalReferenceId =
    externalReferenceIdRaw === undefined ||
    externalReferenceIdRaw === null ||
    externalReferenceIdRaw === ""
      ? null
      : String(externalReferenceIdRaw).trim().slice(0, 200);

  const appliedAtExternal = validateIsoDate(
    entry.appliedAtExternal ?? entry.applied_at_external,
    "behavioral_assessment_applied_at_external_invalid"
  );
  const completedAtExternal = validateIsoDate(
    entry.completedAtExternal ?? entry.completed_at_external,
    "behavioral_assessment_completed_at_external_invalid"
  );

  const summaryTextRaw = entry.summaryText ?? entry.summary_text;
  const summaryText =
    summaryTextRaw === undefined || summaryTextRaw === null || summaryTextRaw === ""
      ? null
      : String(summaryTextRaw).trim().slice(0, 4000);

  const rawDimensions = Array.isArray(entry.dimensions) ? entry.dimensions : [];
  if (rawDimensions.length === 0) {
    throw badRequest(
      "behavioral_assessment_external_dimensions_invalid",
      "External dimensions are required."
    );
  }
  const dimensions = rawDimensions.map((raw) => {
    const record = normalizeObject(raw, "behavioral_assessment_external_dimensions_invalid");
    const code = String(record.code ?? "").trim();
    if (!code) {
      throw badRequest(
        "behavioral_assessment_external_dimensions_invalid",
        "Dimension code is invalid."
      );
    }
    if (record.value === undefined) {
      throw badRequest(
        "behavioral_assessment_external_dimensions_invalid",
        "Dimension value is required."
      );
    }
    return {
      code,
      value: record.value,
      label: record.label !== undefined ? String(record.label) : undefined,
      interpretationText:
        record.interpretationText !== undefined ? String(record.interpretationText) : undefined
    };
  });

  return {
    behavioralInstrumentId,
    behavioralInstrumentVersionId,
    externalProvider,
    externalReferenceId,
    appliedAtExternal,
    completedAtExternal,
    summaryText,
    dimensions
  };
}

function validateIsoDate(value: unknown, code: string): string {
  const text = String(value ?? "").trim();
  if (!text || Number.isNaN(Date.parse(text))) {
    throw badRequest(code, "Date is invalid.");
  }
  return new Date(text).toISOString();
}

const EXTERNAL_IMPORT_ALLOWED_KEYS = [
  "behavioralInstrumentId",
  "behavioral_instrument_id",
  "behavioralInstrumentVersionId",
  "behavioral_instrument_version_id",
  "externalProvider",
  "external_provider",
  "externalReferenceId",
  "external_reference_id",
  "appliedAtExternal",
  "applied_at_external",
  "completedAtExternal",
  "completed_at_external",
  "summaryText",
  "summary_text",
  "dimensions"
];
const EXTERNAL_IMPORT_PROTECTED_KEYS = [
  "id",
  "organizationId",
  "organization_id",
  "candidateApplicationId",
  "candidate_application_id",
  "originType",
  "origin_type",
  "status",
  "attemptNumber",
  "attempt_number",
  "importedAt",
  "imported_at",
  "importedByUserId",
  "imported_by_user_id",
  "createdByUserId",
  "created_by_user_id"
];

// ------------------------------------------------------------------------------------------
// Utilitarios
// ------------------------------------------------------------------------------------------

function validateEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  code: string
): T[number] {
  const text = String(value ?? "");
  if (!allowed.includes(text as T[number])) {
    throw badRequest(code, "Value is invalid.");
  }
  return text as T[number];
}

function ensureNoProtectedAssignment(
  input: unknown,
  allowedKeys: string[],
  protectedKeys: string[]
): Record<string, unknown> {
  const entry = normalizeObject(input, "behavioral_assessment_input_invalid");
  const allowed = new Set(allowedKeys);
  for (const key of protectedKeys) {
    if (!allowed.has(key) && entry[key] !== undefined) {
      throw badRequest(
        "behavioral_assessment_mass_assignment_denied",
        "Protected fields cannot be assigned by client."
      );
    }
  }
  return entry;
}

function normalizeObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(code, "Input is invalid.");
  }
  return value as Record<string, unknown>;
}
