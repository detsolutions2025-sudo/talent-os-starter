// Domain types for the Fase 11 AI infrastructure (ADR-0016..0019, SPEC-014 v1.0).
//
// This module only models the infrastructure: policies, provider/credential configuration,
// model/prompt registries, routing, and AI Execution bookkeeping. It never models any AI
// Feature's business logic (evaluation, matching, ranking, summaries, etc.).

export type CredentialMode = "disabled" | "platform_managed" | "customer_managed";
export type ProviderConfigStatus = "configured" | "invalid" | "revoked" | "error";
export type ValidationStatus = "valid" | "invalid" | "revoked" | "error" | "unknown";
export type PromptStatus = "draft" | "published" | "archived";
export type RoutingStatus = "active" | "inactive";
export type CatalogStatus = "active" | "retired";
export type ExecutionStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

// Canonical, normalized error categories (SPEC-014 "AI Execution"). The Gateway and every
// Provider Adapter only ever work with these -- never with a raw provider error.
export type ErrorCategory =
  | "authentication_error"
  | "quota_exceeded"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable"
  | "network_error"
  | "invalid_response"
  | "configuration_error"
  | "policy_denied"
  | "content_blocked"
  | "unknown_error";

export type JsonObject = Record<string, unknown>;

export type OrganizationAISettings = {
  organizationId: string;
  platformAiAllowed: boolean;
  organizationAiEnabled: boolean;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AIFeatureCatalogEntry = {
  featureKey: string;
  name: string;
  description: string | null;
  featureAvailableOnPlatform: boolean;
  fallbackAllowedOnPlatform: boolean;
  requiredCapabilities: JsonObject;
  defaultPromptKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationAIFeatureSettings = {
  id: string;
  organizationId: string;
  featureKey: string;
  organizationFeatureEnabled: boolean;
  fallbackEnabled: boolean;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AIProviderCatalogEntry = {
  providerKey: string;
  name: string;
  status: CatalogStatus;
  capabilities: JsonObject;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationAIProviderConfig = {
  id: string;
  organizationId: string;
  provider: string;
  credentialMode: CredentialMode;
  status: ProviderConfigStatus;
  secretReference: string | null;
  maskedIdentifier: string | null;
  isActive: boolean;
  configuredByUserId: string | null;
  lastValidatedAt: string | null;
  lastValidationStatus: ValidationStatus | null;
  revokedAt: string | null;
  configuredAt: string;
  updatedAt: string;
};

export type AIModelRegistryEntry = {
  id: string;
  provider: string;
  modelKey: string;
  providerModelIdentifier: string;
  status: CatalogStatus;
  capabilities: JsonObject;
  contextWindow: number | null;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
};

export type AIPromptRegistryEntry = {
  id: string;
  promptKey: string;
  version: number;
  featureKey: string;
  status: PromptStatus;
  template: string;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  metadata: JsonObject;
  createdByUserId: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export type AIProviderRoutingPolicy = {
  id: string;
  organizationId: string;
  featureKey: string;
  provider: string;
  modelKey: string;
  priority: number;
  status: RoutingStatus;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AIExecution = {
  id: string;
  organizationId: string;
  featureKey: string;
  provider: string;
  modelKey: string;
  promptKey: string;
  promptVersion: number;
  credentialMode: CredentialMode;
  status: ExecutionStatus;
  idempotencyKey: string | null;
  correlationId: string;
  requestedByUserId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: number | null;
  errorCategory: ErrorCategory | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------------------
// Inputs (validated in validation.ts, never trusted as-is from the client)
// ---------------------------------------------------------------------------------------

export type FeatureCatalogInput = {
  featureKey: string;
  name: string;
  description?: string | null;
  requiredCapabilities?: JsonObject;
};

export type FeatureAvailabilityInput = {
  featureAvailableOnPlatform: boolean;
};

export type FeatureFallbackAllowedInput = {
  fallbackAllowedOnPlatform: boolean;
};

export type OrganizationFeatureToggleInput = {
  organizationFeatureEnabled: boolean;
};

export type OrganizationFallbackToggleInput = {
  fallbackEnabled: boolean;
};

export type ProviderCatalogInput = {
  providerKey: string;
  name: string;
  capabilities?: JsonObject;
  metadata?: JsonObject;
};

// The raw secret only ever exists transiently, as this input type, at the very top of the
// BYOK call chain. It is never embedded in any persisted or returned type.
export type ConfigureCredentialInput = {
  provider: string;
  credentialMode: Extract<CredentialMode, "customer_managed" | "platform_managed">;
  secret: string;
};

export type ModelRegistryInput = {
  provider: string;
  modelKey: string;
  providerModelIdentifier: string;
  capabilities?: JsonObject;
  contextWindow?: number | null;
  metadata?: JsonObject;
};

export type PromptDraftInput = {
  promptKey: string;
  featureKey: string;
  template: string;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  metadata?: JsonObject;
};

export type RoutingPolicyInput = {
  featureKey: string;
  provider: string;
  modelKey: string;
  priority: number;
};

// ---------------------------------------------------------------------------------------
// DTOs returned to clients -- deliberately exclude anything secret/internal
// ---------------------------------------------------------------------------------------

export type OrganizationAIProviderConfigDTO = {
  id: string;
  provider: string;
  credentialMode: CredentialMode;
  status: ProviderConfigStatus;
  maskedIdentifier: string | null;
  lastValidatedAt: string | null;
  lastValidationStatus: ValidationStatus | null;
  configuredAt: string;
  updatedAt: string;
};

export function toProviderConfigDTO(
  config: OrganizationAIProviderConfig
): OrganizationAIProviderConfigDTO {
  return {
    id: config.id,
    provider: config.provider,
    credentialMode: config.credentialMode,
    status: config.status,
    maskedIdentifier: config.maskedIdentifier,
    lastValidatedAt: config.lastValidatedAt,
    lastValidationStatus: config.lastValidationStatus,
    configuredAt: config.configuredAt,
    updatedAt: config.updatedAt
  };
}

// ---------------------------------------------------------------------------------------
// AI Gateway contract
// ---------------------------------------------------------------------------------------

export type AIExecutionUsage = {
  executionId: string;
  correlationId: string;
  provider: string;
  modelKey: string;
  promptKey: string;
  promptVersion: number;
  status: ExecutionStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: number | null;
  errorCategory: ErrorCategory | null;
};

export type AIGatewayRequest = {
  featureKey: string;
  input: JsonObject;
  idempotencyKey?: string;
};

export type AIGatewayResult<T = unknown> =
  | { kind: "executed"; usage: AIExecutionUsage; output: T }
  | { kind: "idempotent_replay"; usage: AIExecutionUsage }
  | { kind: "denied"; errorCategory: ErrorCategory; reason: string }
  | { kind: "failed"; usage: AIExecutionUsage; errorCategory: ErrorCategory; reason: string };
