import { badRequest } from "../core/errors";
import type {
  ConfigureCredentialInput,
  CredentialMode,
  FeatureAvailabilityInput,
  FeatureCatalogInput,
  FeatureFallbackAllowedInput,
  JsonObject,
  ModelRegistryInput,
  OrganizationFallbackToggleInput,
  OrganizationFeatureToggleInput,
  ProviderCatalogInput,
  PromptDraftInput,
  RoutingPolicyInput
} from "./types";

const keyPattern = /^[a-z][a-z0-9_-]{2,63}$/;
const providerKeyPattern = /^[a-z][a-z0-9_-]{1,49}$/;

export const credentialModesAcceptedForConfiguration: readonly Extract<
  CredentialMode,
  "customer_managed" | "platform_managed"
>[] = ["customer_managed", "platform_managed"];

export function validateFeatureCatalogInput(input: unknown): FeatureCatalogInput {
  ensureNoProtectedAssignment(input, [
    "featureKey",
    "feature_key",
    "name",
    "description",
    "requiredCapabilities",
    "required_capabilities"
  ]);
  const entry = normalizeInputObject(input);
  return {
    featureKey: validateKey(entry.featureKey ?? entry.feature_key, "feature_key"),
    name: validateText(entry.name, 200, "name"),
    description: validateOptionalText(entry.description, 2000),
    requiredCapabilities: validateJsonObject(
      entry.requiredCapabilities ?? entry.required_capabilities,
      "required_capabilities"
    )
  };
}

export function validateFeatureAvailabilityInput(input: unknown): FeatureAvailabilityInput {
  ensureNoProtectedAssignment(input, [
    "featureAvailableOnPlatform",
    "feature_available_on_platform"
  ]);
  const entry = normalizeInputObject(input);
  return {
    featureAvailableOnPlatform: validateBoolean(
      entry.featureAvailableOnPlatform ?? entry.feature_available_on_platform,
      "feature_available_on_platform"
    )
  };
}

export function validateFallbackAllowedInput(input: unknown): FeatureFallbackAllowedInput {
  ensureNoProtectedAssignment(input, ["fallbackAllowedOnPlatform", "fallback_allowed_on_platform"]);
  const entry = normalizeInputObject(input);
  return {
    fallbackAllowedOnPlatform: validateBoolean(
      entry.fallbackAllowedOnPlatform ?? entry.fallback_allowed_on_platform,
      "fallback_allowed_on_platform"
    )
  };
}

export function validateFeatureToggleInput(input: unknown): OrganizationFeatureToggleInput {
  ensureNoProtectedAssignment(input, [
    "organizationFeatureEnabled",
    "organization_feature_enabled"
  ]);
  const entry = normalizeInputObject(input);
  return {
    organizationFeatureEnabled: validateBoolean(
      entry.organizationFeatureEnabled ?? entry.organization_feature_enabled,
      "organization_feature_enabled"
    )
  };
}

export function validateFallbackToggleInput(input: unknown): OrganizationFallbackToggleInput {
  ensureNoProtectedAssignment(input, ["fallbackEnabled", "fallback_enabled"]);
  const entry = normalizeInputObject(input);
  return {
    fallbackEnabled: validateBoolean(
      entry.fallbackEnabled ?? entry.fallback_enabled,
      "fallback_enabled"
    )
  };
}

export function validateProviderCatalogInput(input: unknown): ProviderCatalogInput {
  ensureNoProtectedAssignment(input, [
    "providerKey",
    "provider_key",
    "name",
    "capabilities",
    "metadata"
  ]);
  const entry = normalizeInputObject(input);
  return {
    providerKey: validateProviderKey(entry.providerKey ?? entry.provider_key),
    name: validateText(entry.name, 200, "name"),
    capabilities: validateJsonObject(entry.capabilities, "capabilities"),
    metadata: validateJsonObject(entry.metadata, "metadata")
  };
}

export function validateConfigureCredentialInput(input: unknown): ConfigureCredentialInput {
  ensureNoProtectedAssignment(input, ["provider", "credentialMode", "credential_mode", "secret"]);
  const entry = normalizeInputObject(input);
  const credentialMode = validateEnum(
    entry.credentialMode ?? entry.credential_mode,
    credentialModesAcceptedForConfiguration,
    "credential_mode"
  );
  const secret = String(entry.secret ?? "");
  if (!secret.trim() || secret.length > 4000) {
    throw badRequest("ai_secret_invalid", "Credential secret is invalid.");
  }
  return {
    provider: validateProviderKey(entry.provider),
    credentialMode,
    secret
  };
}

export function validateModelRegistryInput(input: unknown): ModelRegistryInput {
  ensureNoProtectedAssignment(input, [
    "provider",
    "modelKey",
    "model_key",
    "providerModelIdentifier",
    "provider_model_identifier",
    "capabilities",
    "contextWindow",
    "context_window",
    "metadata"
  ]);
  const entry = normalizeInputObject(input);
  const contextWindowRaw = entry.contextWindow ?? entry.context_window;
  return {
    provider: validateProviderKey(entry.provider),
    modelKey: validateKey(entry.modelKey ?? entry.model_key, "model_key"),
    providerModelIdentifier: validateText(
      entry.providerModelIdentifier ?? entry.provider_model_identifier,
      200,
      "provider_model_identifier"
    ),
    capabilities: validateJsonObject(entry.capabilities, "capabilities"),
    contextWindow:
      contextWindowRaw === undefined || contextWindowRaw === null
        ? null
        : validateInteger(contextWindowRaw, 1, 10_000_000, "context_window"),
    metadata: validateJsonObject(entry.metadata, "metadata")
  };
}

export function validatePromptDraftInput(input: unknown): PromptDraftInput {
  ensureNoProtectedAssignment(input, [
    "promptKey",
    "prompt_key",
    "featureKey",
    "feature_key",
    "template",
    "inputSchema",
    "input_schema",
    "outputSchema",
    "output_schema",
    "metadata"
  ]);
  const entry = normalizeInputObject(input);
  return {
    promptKey: validateKey(entry.promptKey ?? entry.prompt_key, "prompt_key"),
    featureKey: validateKey(entry.featureKey ?? entry.feature_key, "feature_key"),
    template: validateText(entry.template, 20000, "template"),
    inputSchema: validateJsonObject(entry.inputSchema ?? entry.input_schema, "input_schema"),
    outputSchema: validateJsonObject(entry.outputSchema ?? entry.output_schema, "output_schema"),
    metadata: validateJsonObject(entry.metadata, "metadata")
  };
}

export function validateRoutingPolicyInput(input: unknown): RoutingPolicyInput {
  ensureNoProtectedAssignment(input, [
    "featureKey",
    "feature_key",
    "provider",
    "modelKey",
    "model_key",
    "priority"
  ]);
  const entry = normalizeInputObject(input);
  return {
    featureKey: validateKey(entry.featureKey ?? entry.feature_key, "feature_key"),
    provider: validateProviderKey(entry.provider),
    modelKey: validateKey(entry.modelKey ?? entry.model_key, "model_key"),
    priority: validateInteger(entry.priority, 1, 1000, "priority")
  };
}

export function validateGatewayInput(input: unknown): JsonObject {
  return validateJsonObject(input, "input");
}

export function validatePlatformAllowedInput(input: unknown): boolean {
  ensureNoProtectedAssignment(input, ["platformAiAllowed", "platform_ai_allowed"]);
  const entry = normalizeInputObject(input);
  return validateBoolean(
    entry.platformAiAllowed ?? entry.platform_ai_allowed,
    "platform_ai_allowed"
  );
}

export function validateOrganizationAiEnabledInput(input: unknown): boolean {
  ensureNoProtectedAssignment(input, ["organizationAiEnabled", "organization_ai_enabled"]);
  const entry = normalizeInputObject(input);
  return validateBoolean(
    entry.organizationAiEnabled ?? entry.organization_ai_enabled,
    "organization_ai_enabled"
  );
}

export function validateDefaultPromptKeyInput(input: unknown): string {
  ensureNoProtectedAssignment(input, ["promptKey", "prompt_key"]);
  const entry = normalizeInputObject(input);
  return validateKey(entry.promptKey ?? entry.prompt_key, "prompt_key");
}

export function validateIdempotencyKey(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const text = String(value).trim();
  if (text.length > 200) {
    throw badRequest("ai_idempotency_key_invalid", "Idempotency key is invalid.");
  }
  return text;
}

// ---------------------------------------------------------------------------------------
// Generic helpers (module-local, mirrors the pattern already used by other modules)
// ---------------------------------------------------------------------------------------

export function validateKey(value: unknown, code: string) {
  const text = String(value ?? "").trim();
  if (!keyPattern.test(text)) {
    throw badRequest(`ai_${code}_invalid`, "AI key is invalid.");
  }
  return text;
}

function validateProviderKey(value: unknown) {
  const text = String(value ?? "").trim();
  if (!providerKeyPattern.test(text)) {
    throw badRequest("ai_provider_invalid", "AI provider key is invalid.");
  }
  return text;
}

function validateText(value: unknown, maxLength: number, code: string) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw badRequest(`ai_${code}_invalid`, "AI text is invalid.");
  }
  return text;
}

function validateOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw badRequest("ai_text_too_long", "AI text is too long.");
  }
  return text || null;
}

function validateBoolean(value: unknown, code: string) {
  if (typeof value !== "boolean") {
    throw badRequest(`ai_${code}_invalid`, "AI boolean value is invalid.");
  }
  return value;
}

function validateInteger(value: unknown, min: number, max: number, code: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw badRequest(`ai_${code}_invalid`, "AI number is invalid.");
  }
  return number;
}

function validateEnum<T extends string>(value: unknown, allowed: readonly T[], code: string): T {
  const text = String(value ?? "").trim();
  if (!allowed.includes(text as T)) {
    throw badRequest(`ai_${code}_invalid`, "AI enum value is invalid.");
  }
  return text as T;
}

function validateJsonObject(value: unknown, code: string): JsonObject {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`ai_${code}_invalid`, "AI JSON object value is invalid.");
  }
  return value as JsonObject;
}

function normalizeInputObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("ai_input_invalid", "AI input is invalid.");
  }
  return value as Record<string, unknown>;
}

// Denies any client-supplied key that the caller did not explicitly allow-list for this
// operation. Always includes the fields that must never be settable by a client: identifiers,
// organization scoping, secret/credential material, resolved execution fields, autoria and
// timestamps -- consistent with SPEC-014 "Mass Assignment".
function ensureNoProtectedAssignment(input: unknown, allowedKeys: string[]) {
  const entry = normalizeInputObject(input);
  const allowed = new Set(allowedKeys);
  const protectedKeys = [
    "id",
    "organizationId",
    "organization_id",
    "status",
    "secret",
    "secretReference",
    "secret_reference",
    "maskedIdentifier",
    "masked_identifier",
    "isActive",
    "is_active",
    "lastValidatedAt",
    "last_validated_at",
    "lastValidationStatus",
    "last_validation_status",
    "revokedAt",
    "revoked_at",
    "configuredAt",
    "configured_at",
    "publishedAt",
    "published_at",
    "archivedAt",
    "archived_at",
    "version",
    "provider",
    "modelKey",
    "model_key",
    "promptVersion",
    "prompt_version",
    "credentialMode",
    "credential_mode",
    "inputTokens",
    "input_tokens",
    "outputTokens",
    "output_tokens",
    "estimatedCost",
    "estimated_cost",
    "errorCategory",
    "error_category",
    "correlationId",
    "correlation_id",
    "executionId",
    "execution_id",
    "createdByUserId",
    "created_by_user_id",
    "updatedByUserId",
    "updated_by_user_id",
    "configuredByUserId",
    "configured_by_user_id",
    "createdAt",
    "created_at",
    "updatedAt",
    "updated_at",
    "actor",
    "metadata"
  ];
  for (const key of protectedKeys) {
    if (!allowed.has(key) && entry[key] !== undefined) {
      throw badRequest(
        "ai_mass_assignment_denied",
        "AI protected fields cannot be assigned by client."
      );
    }
  }
}
