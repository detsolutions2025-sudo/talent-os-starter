import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { AIRepository } from "../ai/repository";
import type {
  AIExecution,
  AIFeatureCatalogEntry,
  AIModelRegistryEntry,
  AIPromptRegistryEntry,
  AIProviderCatalogEntry,
  AIProviderRoutingPolicy,
  JsonObject,
  OrganizationAIFeatureSettings,
  OrganizationAIProviderConfig,
  OrganizationAISettings
} from "../ai/types";

export class PostgresAIRepository implements AIRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  // -------------------------------------------------------------------------------------
  // Organization AI Settings
  // -------------------------------------------------------------------------------------

  async findOrganizationAISettings(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_ai_settings WHERE organization_id = $1",
      [organizationId]
    );
    return result.rows[0] ? mapOrganizationAISettings(result.rows[0]) : null;
  }

  async findOrganizationAISettingsForUpdate(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_ai_settings WHERE organization_id = $1 FOR UPDATE",
      [organizationId]
    );
    return result.rows[0] ? mapOrganizationAISettings(result.rows[0]) : null;
  }

  async upsertOrganizationAISettings(settings: OrganizationAISettings) {
    await this.connection.query(
      `
        INSERT INTO organization_ai_settings (
          organization_id, platform_ai_allowed, organization_ai_enabled,
          updated_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (organization_id) DO UPDATE SET
          platform_ai_allowed = EXCLUDED.platform_ai_allowed,
          organization_ai_enabled = EXCLUDED.organization_ai_enabled,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = EXCLUDED.updated_at
      `,
      [
        settings.organizationId,
        settings.platformAiAllowed,
        settings.organizationAiEnabled,
        settings.updatedByUserId,
        settings.createdAt,
        settings.updatedAt
      ]
    );
  }

  // -------------------------------------------------------------------------------------
  // AI Feature Catalog
  // -------------------------------------------------------------------------------------

  async findFeatureCatalogEntry(featureKey: string) {
    const result = await this.connection.query(
      "SELECT * FROM ai_feature_catalog WHERE feature_key = $1",
      [featureKey]
    );
    return result.rows[0] ? mapFeatureCatalogEntry(result.rows[0]) : null;
  }

  async listFeatureCatalog() {
    const result = await this.connection.query(
      "SELECT * FROM ai_feature_catalog ORDER BY feature_key"
    );
    return result.rows.map(mapFeatureCatalogEntry);
  }

  async addFeatureCatalogEntry(entry: AIFeatureCatalogEntry) {
    await this.connection.query(
      `
        INSERT INTO ai_feature_catalog (
          feature_key, name, description, feature_available_on_platform,
          fallback_allowed_on_platform, required_capabilities, default_prompt_key,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
      `,
      [
        entry.featureKey,
        entry.name,
        entry.description,
        entry.featureAvailableOnPlatform,
        entry.fallbackAllowedOnPlatform,
        JSON.stringify(entry.requiredCapabilities),
        entry.defaultPromptKey,
        entry.createdAt,
        entry.updatedAt
      ]
    );
  }

  async updateFeatureCatalogEntry(entry: AIFeatureCatalogEntry) {
    await this.connection.query(
      `
        UPDATE ai_feature_catalog
        SET name = $2,
            description = $3,
            feature_available_on_platform = $4,
            fallback_allowed_on_platform = $5,
            required_capabilities = $6::jsonb,
            default_prompt_key = $7,
            updated_at = $8
        WHERE feature_key = $1
      `,
      [
        entry.featureKey,
        entry.name,
        entry.description,
        entry.featureAvailableOnPlatform,
        entry.fallbackAllowedOnPlatform,
        JSON.stringify(entry.requiredCapabilities),
        entry.defaultPromptKey,
        entry.updatedAt
      ]
    );
  }

  // -------------------------------------------------------------------------------------
  // Organization AI Feature Settings
  // -------------------------------------------------------------------------------------

  async findOrganizationFeatureSettings(organizationId: string, featureKey: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_ai_feature_settings WHERE organization_id = $1 AND feature_key = $2",
      [organizationId, featureKey]
    );
    return result.rows[0] ? mapOrganizationFeatureSettings(result.rows[0]) : null;
  }

  async findOrganizationFeatureSettingsForUpdate(organizationId: string, featureKey: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM organization_ai_feature_settings
        WHERE organization_id = $1 AND feature_key = $2
        FOR UPDATE
      `,
      [organizationId, featureKey]
    );
    return result.rows[0] ? mapOrganizationFeatureSettings(result.rows[0]) : null;
  }

  async listOrganizationFeatureSettings(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_ai_feature_settings WHERE organization_id = $1 ORDER BY feature_key",
      [organizationId]
    );
    return result.rows.map(mapOrganizationFeatureSettings);
  }

  async addOrganizationFeatureSettings(settings: OrganizationAIFeatureSettings) {
    await this.connection.query(
      `
        INSERT INTO organization_ai_feature_settings (
          id, organization_id, feature_key, organization_feature_enabled, fallback_enabled,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        settings.id,
        settings.organizationId,
        settings.featureKey,
        settings.organizationFeatureEnabled,
        settings.fallbackEnabled,
        settings.createdByUserId,
        settings.updatedByUserId,
        settings.createdAt,
        settings.updatedAt
      ]
    );
  }

  async updateOrganizationFeatureSettings(settings: OrganizationAIFeatureSettings) {
    await this.connection.query(
      `
        UPDATE organization_ai_feature_settings
        SET organization_feature_enabled = $3,
            fallback_enabled = $4,
            updated_by_user_id = $5,
            updated_at = $6
        WHERE organization_id = $1 AND feature_key = $2
      `,
      [
        settings.organizationId,
        settings.featureKey,
        settings.organizationFeatureEnabled,
        settings.fallbackEnabled,
        settings.updatedByUserId,
        settings.updatedAt
      ]
    );
  }

  // -------------------------------------------------------------------------------------
  // AI Provider Catalog
  // -------------------------------------------------------------------------------------

  async findProviderCatalogEntry(providerKey: string) {
    const result = await this.connection.query(
      "SELECT * FROM ai_provider_catalog WHERE provider_key = $1",
      [providerKey]
    );
    return result.rows[0] ? mapProviderCatalogEntry(result.rows[0]) : null;
  }

  async listProviderCatalog() {
    const result = await this.connection.query(
      "SELECT * FROM ai_provider_catalog ORDER BY provider_key"
    );
    return result.rows.map(mapProviderCatalogEntry);
  }

  async addProviderCatalogEntry(entry: AIProviderCatalogEntry) {
    await this.connection.query(
      `
        INSERT INTO ai_provider_catalog (
          provider_key, name, status, capabilities, metadata, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
      `,
      [
        entry.providerKey,
        entry.name,
        entry.status,
        JSON.stringify(entry.capabilities),
        JSON.stringify(entry.metadata),
        entry.createdAt,
        entry.updatedAt
      ]
    );
  }

  async updateProviderCatalogEntry(entry: AIProviderCatalogEntry) {
    await this.connection.query(
      `
        UPDATE ai_provider_catalog
        SET name = $2,
            status = $3,
            capabilities = $4::jsonb,
            metadata = $5::jsonb,
            updated_at = $6
        WHERE provider_key = $1
      `,
      [
        entry.providerKey,
        entry.name,
        entry.status,
        JSON.stringify(entry.capabilities),
        JSON.stringify(entry.metadata),
        entry.updatedAt
      ]
    );
  }

  // -------------------------------------------------------------------------------------
  // Organization AI Provider Config
  // -------------------------------------------------------------------------------------

  async findActiveProviderConfig(organizationId: string, provider: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM organization_ai_provider_configs
        WHERE organization_id = $1 AND provider = $2 AND is_active
      `,
      [organizationId, provider]
    );
    return result.rows[0] ? mapProviderConfig(result.rows[0]) : null;
  }

  async findActiveProviderConfigForUpdate(organizationId: string, provider: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM organization_ai_provider_configs
        WHERE organization_id = $1 AND provider = $2 AND is_active
        FOR UPDATE
      `,
      [organizationId, provider]
    );
    return result.rows[0] ? mapProviderConfig(result.rows[0]) : null;
  }

  async findProviderConfigById(organizationId: string, configId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_ai_provider_configs WHERE organization_id = $1 AND id = $2",
      [organizationId, configId]
    );
    return result.rows[0] ? mapProviderConfig(result.rows[0]) : null;
  }

  async listProviderConfigs(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM organization_ai_provider_configs WHERE organization_id = $1 ORDER BY configured_at DESC",
      [organizationId]
    );
    return result.rows.map(mapProviderConfig);
  }

  async addProviderConfig(config: OrganizationAIProviderConfig) {
    await this.connection.query(
      `
        INSERT INTO organization_ai_provider_configs (
          id, organization_id, provider, credential_mode, status, secret_reference,
          masked_identifier, is_active, configured_by_user_id, last_validated_at,
          last_validation_status, revoked_at, configured_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `,
      [
        config.id,
        config.organizationId,
        config.provider,
        config.credentialMode,
        config.status,
        config.secretReference,
        config.maskedIdentifier,
        config.isActive,
        config.configuredByUserId,
        config.lastValidatedAt,
        config.lastValidationStatus,
        config.revokedAt,
        config.configuredAt,
        config.updatedAt
      ]
    );
  }

  async updateProviderConfig(config: OrganizationAIProviderConfig) {
    await this.connection.query(
      `
        UPDATE organization_ai_provider_configs
        SET status = $3,
            is_active = $4,
            last_validated_at = $5,
            last_validation_status = $6,
            revoked_at = $7,
            updated_at = $8
        WHERE organization_id = $1 AND id = $2
      `,
      [
        config.organizationId,
        config.id,
        config.status,
        config.isActive,
        config.lastValidatedAt,
        config.lastValidationStatus,
        config.revokedAt,
        config.updatedAt
      ]
    );
  }

  // -------------------------------------------------------------------------------------
  // AI Model Registry
  // -------------------------------------------------------------------------------------

  async findModel(provider: string, modelKey: string) {
    const result = await this.connection.query(
      "SELECT * FROM ai_model_registry WHERE provider = $1 AND model_key = $2",
      [provider, modelKey]
    );
    return result.rows[0] ? mapModel(result.rows[0]) : null;
  }

  async listModels() {
    const result = await this.connection.query(
      "SELECT * FROM ai_model_registry ORDER BY provider, model_key"
    );
    return result.rows.map(mapModel);
  }

  async addModel(model: AIModelRegistryEntry) {
    await this.connection.query(
      `
        INSERT INTO ai_model_registry (
          id, provider, model_key, provider_model_identifier, status, capabilities,
          context_window, metadata, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10)
      `,
      [
        model.id,
        model.provider,
        model.modelKey,
        model.providerModelIdentifier,
        model.status,
        JSON.stringify(model.capabilities),
        model.contextWindow,
        JSON.stringify(model.metadata),
        model.createdAt,
        model.updatedAt
      ]
    );
  }

  async updateModel(model: AIModelRegistryEntry) {
    await this.connection.query(
      `
        UPDATE ai_model_registry
        SET provider_model_identifier = $3,
            status = $4,
            capabilities = $5::jsonb,
            context_window = $6,
            metadata = $7::jsonb,
            updated_at = $8
        WHERE provider = $1 AND model_key = $2
      `,
      [
        model.provider,
        model.modelKey,
        model.providerModelIdentifier,
        model.status,
        JSON.stringify(model.capabilities),
        model.contextWindow,
        JSON.stringify(model.metadata),
        model.updatedAt
      ]
    );
  }

  // -------------------------------------------------------------------------------------
  // AI Prompt Registry
  // -------------------------------------------------------------------------------------

  async findPublishedPrompt(promptKey: string) {
    const result = await this.connection.query(
      "SELECT * FROM ai_prompt_registry WHERE prompt_key = $1 AND status = 'published'",
      [promptKey]
    );
    return result.rows[0] ? mapPrompt(result.rows[0]) : null;
  }

  async findPublishedPromptForUpdate(promptKey: string) {
    const result = await this.connection.query(
      "SELECT * FROM ai_prompt_registry WHERE prompt_key = $1 AND status = 'published' FOR UPDATE",
      [promptKey]
    );
    return result.rows[0] ? mapPrompt(result.rows[0]) : null;
  }

  async findPromptVersion(promptKey: string, version: number) {
    const result = await this.connection.query(
      "SELECT * FROM ai_prompt_registry WHERE prompt_key = $1 AND version = $2",
      [promptKey, version]
    );
    return result.rows[0] ? mapPrompt(result.rows[0]) : null;
  }

  async listPromptVersions(promptKey: string) {
    const result = await this.connection.query(
      "SELECT * FROM ai_prompt_registry WHERE prompt_key = $1 ORDER BY version DESC",
      [promptKey]
    );
    return result.rows.map(mapPrompt);
  }

  async addPromptVersion(entry: AIPromptRegistryEntry) {
    await this.connection.query(
      `
        INSERT INTO ai_prompt_registry (
          id, prompt_key, version, feature_key, status, template, input_schema,
          output_schema, metadata, created_by_user_id, published_at, archived_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13)
      `,
      [
        entry.id,
        entry.promptKey,
        entry.version,
        entry.featureKey,
        entry.status,
        entry.template,
        JSON.stringify(entry.inputSchema),
        JSON.stringify(entry.outputSchema),
        JSON.stringify(entry.metadata),
        entry.createdByUserId,
        entry.publishedAt,
        entry.archivedAt,
        entry.createdAt
      ]
    );
  }

  async updatePromptVersion(entry: AIPromptRegistryEntry) {
    await this.connection.query(
      `
        UPDATE ai_prompt_registry
        SET status = $3,
            published_at = $4,
            archived_at = $5
        WHERE prompt_key = $1 AND version = $2
      `,
      [entry.promptKey, entry.version, entry.status, entry.publishedAt, entry.archivedAt]
    );
  }

  // -------------------------------------------------------------------------------------
  // AI Provider Routing Policy
  // -------------------------------------------------------------------------------------

  async listActiveRoutes(organizationId: string, featureKey: string) {
    const result = await this.connection.query(
      `
        SELECT * FROM ai_provider_routing_policies
        WHERE organization_id = $1 AND feature_key = $2 AND status = 'active'
        ORDER BY priority ASC
      `,
      [organizationId, featureKey]
    );
    return result.rows.map(mapRoutingPolicy);
  }

  async findRoutingPolicyById(organizationId: string, routingId: string) {
    const result = await this.connection.query(
      "SELECT * FROM ai_provider_routing_policies WHERE organization_id = $1 AND id = $2",
      [organizationId, routingId]
    );
    return result.rows[0] ? mapRoutingPolicy(result.rows[0]) : null;
  }

  async addRoutingPolicy(policy: AIProviderRoutingPolicy) {
    await this.connection.query(
      `
        INSERT INTO ai_provider_routing_policies (
          id, organization_id, feature_key, provider, model_key, priority, status,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        policy.id,
        policy.organizationId,
        policy.featureKey,
        policy.provider,
        policy.modelKey,
        policy.priority,
        policy.status,
        policy.createdByUserId,
        policy.updatedByUserId,
        policy.createdAt,
        policy.updatedAt
      ]
    );
  }

  async updateRoutingPolicy(policy: AIProviderRoutingPolicy) {
    await this.connection.query(
      `
        UPDATE ai_provider_routing_policies
        SET priority = $3,
            status = $4,
            updated_by_user_id = $5,
            updated_at = $6
        WHERE organization_id = $1 AND id = $2
      `,
      [
        policy.organizationId,
        policy.id,
        policy.priority,
        policy.status,
        policy.updatedByUserId,
        policy.updatedAt
      ]
    );
  }

  // -------------------------------------------------------------------------------------
  // AI Execution
  // -------------------------------------------------------------------------------------

  async findExecutionById(organizationId: string, executionId: string) {
    const result = await this.connection.query(
      "SELECT * FROM ai_executions WHERE organization_id = $1 AND id = $2",
      [organizationId, executionId]
    );
    return result.rows[0] ? mapExecution(result.rows[0]) : null;
  }

  async findActiveExecutionByIdempotencyKey(
    organizationId: string,
    featureKey: string,
    idempotencyKey: string
  ) {
    const result = await this.connection.query(
      `
        SELECT * FROM ai_executions
        WHERE organization_id = $1 AND feature_key = $2 AND idempotency_key = $3
          AND status IN ('pending', 'running', 'succeeded')
      `,
      [organizationId, featureKey, idempotencyKey]
    );
    return result.rows[0] ? mapExecution(result.rows[0]) : null;
  }

  async addExecution(execution: AIExecution) {
    await this.connection.query(
      `
        INSERT INTO ai_executions (
          id, organization_id, feature_key, provider, model_key, prompt_key, prompt_version,
          credential_mode, status, idempotency_key, correlation_id, requested_by_user_id,
          started_at, finished_at, duration_ms, input_tokens, output_tokens, estimated_cost,
          error_category, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      `,
      [
        execution.id,
        execution.organizationId,
        execution.featureKey,
        execution.provider,
        execution.modelKey,
        execution.promptKey,
        execution.promptVersion,
        execution.credentialMode,
        execution.status,
        execution.idempotencyKey,
        execution.correlationId,
        execution.requestedByUserId,
        execution.startedAt,
        execution.finishedAt,
        execution.durationMs,
        execution.inputTokens,
        execution.outputTokens,
        execution.estimatedCost,
        execution.errorCategory,
        execution.createdAt,
        execution.updatedAt
      ]
    );
  }

  async updateExecution(execution: AIExecution) {
    await this.connection.query(
      `
        UPDATE ai_executions
        SET provider = $3,
            model_key = $4,
            credential_mode = $5,
            status = $6,
            started_at = $7,
            finished_at = $8,
            duration_ms = $9,
            input_tokens = $10,
            output_tokens = $11,
            estimated_cost = $12,
            error_category = $13,
            updated_at = $14
        WHERE organization_id = $1 AND id = $2
      `,
      [
        execution.organizationId,
        execution.id,
        execution.provider,
        execution.modelKey,
        execution.credentialMode,
        execution.status,
        execution.startedAt,
        execution.finishedAt,
        execution.durationMs,
        execution.inputTokens,
        execution.outputTokens,
        execution.estimatedCost,
        execution.errorCategory,
        execution.updatedAt
      ]
    );
  }

  async listExecutions(organizationId: string, featureKey?: string) {
    const result = featureKey
      ? await this.connection.query(
          `
            SELECT * FROM ai_executions
            WHERE organization_id = $1 AND feature_key = $2
            ORDER BY created_at DESC
          `,
          [organizationId, featureKey]
        )
      : await this.connection.query(
          "SELECT * FROM ai_executions WHERE organization_id = $1 ORDER BY created_at DESC",
          [organizationId]
        );
    return result.rows.map(mapExecution);
  }
}

// ---------------------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------------------

function mapOrganizationAISettings(row: Record<string, unknown>): OrganizationAISettings {
  return {
    organizationId: String(row.organization_id),
    platformAiAllowed: Boolean(row.platform_ai_allowed),
    organizationAiEnabled: Boolean(row.organization_ai_enabled),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapFeatureCatalogEntry(row: Record<string, unknown>): AIFeatureCatalogEntry {
  return {
    featureKey: String(row.feature_key),
    name: String(row.name),
    description: nullableString(row.description),
    featureAvailableOnPlatform: Boolean(row.feature_available_on_platform),
    fallbackAllowedOnPlatform: Boolean(row.fallback_allowed_on_platform),
    requiredCapabilities: normalizeJson(row.required_capabilities),
    defaultPromptKey: nullableString(row.default_prompt_key),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapOrganizationFeatureSettings(
  row: Record<string, unknown>
): OrganizationAIFeatureSettings {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    featureKey: String(row.feature_key),
    organizationFeatureEnabled: Boolean(row.organization_feature_enabled),
    fallbackEnabled: Boolean(row.fallback_enabled),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapProviderCatalogEntry(row: Record<string, unknown>): AIProviderCatalogEntry {
  return {
    providerKey: String(row.provider_key),
    name: String(row.name),
    status: row.status as AIProviderCatalogEntry["status"],
    capabilities: normalizeJson(row.capabilities),
    metadata: normalizeJson(row.metadata),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapProviderConfig(row: Record<string, unknown>): OrganizationAIProviderConfig {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    provider: String(row.provider),
    credentialMode: row.credential_mode as OrganizationAIProviderConfig["credentialMode"],
    status: row.status as OrganizationAIProviderConfig["status"],
    secretReference: nullableString(row.secret_reference),
    maskedIdentifier: nullableString(row.masked_identifier),
    isActive: Boolean(row.is_active),
    configuredByUserId: nullableString(row.configured_by_user_id),
    lastValidatedAt: nullableIso(row.last_validated_at),
    lastValidationStatus:
      row.last_validation_status as OrganizationAIProviderConfig["lastValidationStatus"],
    revokedAt: nullableIso(row.revoked_at),
    configuredAt: toIso(row.configured_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapModel(row: Record<string, unknown>): AIModelRegistryEntry {
  return {
    id: String(row.id),
    provider: String(row.provider),
    modelKey: String(row.model_key),
    providerModelIdentifier: String(row.provider_model_identifier),
    status: row.status as AIModelRegistryEntry["status"],
    capabilities: normalizeJson(row.capabilities),
    contextWindow: nullableNumber(row.context_window),
    metadata: normalizeJson(row.metadata),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapPrompt(row: Record<string, unknown>): AIPromptRegistryEntry {
  return {
    id: String(row.id),
    promptKey: String(row.prompt_key),
    version: Number(row.version),
    featureKey: String(row.feature_key),
    status: row.status as AIPromptRegistryEntry["status"],
    template: String(row.template),
    inputSchema: normalizeJson(row.input_schema),
    outputSchema: normalizeJson(row.output_schema),
    metadata: normalizeJson(row.metadata),
    createdByUserId: nullableString(row.created_by_user_id),
    publishedAt: nullableIso(row.published_at),
    archivedAt: nullableIso(row.archived_at),
    createdAt: toIso(row.created_at)
  };
}

function mapRoutingPolicy(row: Record<string, unknown>): AIProviderRoutingPolicy {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    featureKey: String(row.feature_key),
    provider: String(row.provider),
    modelKey: String(row.model_key),
    priority: Number(row.priority),
    status: row.status as AIProviderRoutingPolicy["status"],
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapExecution(row: Record<string, unknown>): AIExecution {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    featureKey: String(row.feature_key),
    provider: String(row.provider),
    modelKey: String(row.model_key),
    promptKey: String(row.prompt_key),
    promptVersion: Number(row.prompt_version),
    credentialMode: row.credential_mode as AIExecution["credentialMode"],
    status: row.status as AIExecution["status"],
    idempotencyKey: nullableString(row.idempotency_key),
    correlationId: String(row.correlation_id),
    requestedByUserId: nullableString(row.requested_by_user_id),
    startedAt: nullableIso(row.started_at),
    finishedAt: nullableIso(row.finished_at),
    durationMs: nullableNumber(row.duration_ms),
    inputTokens: nullableNumber(row.input_tokens),
    outputTokens: nullableNumber(row.output_tokens),
    estimatedCost: nullableNumber(row.estimated_cost),
    errorCategory: row.error_category as AIExecution["errorCategory"],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function normalizeJson(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonObject;
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function nullableIso(value: unknown) {
  return value === null || value === undefined ? null : toIso(value);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}
