import type {
  AIExecution,
  AIFeatureCatalogEntry,
  AIModelRegistryEntry,
  AIPromptRegistryEntry,
  AIProviderCatalogEntry,
  AIProviderRoutingPolicy,
  OrganizationAIFeatureSettings,
  OrganizationAIProviderConfig,
  OrganizationAISettings
} from "./types";

// A single repository for the whole "Infrastructure de IA" bounded context (SPEC-014),
// mirroring the project's convention of one repository interface per bounded context
// (CoreRepository, InterviewRepository) rather than one per internal service.
export interface AIRepository {
  nextId(prefix: string): string;
  now(): string;

  // Organization AI Settings (ADR-0016)
  findOrganizationAISettings(organizationId: string): Promise<OrganizationAISettings | null>;
  findOrganizationAISettingsForUpdate(
    organizationId: string
  ): Promise<OrganizationAISettings | null>;
  upsertOrganizationAISettings(settings: OrganizationAISettings): Promise<void>;

  // AI Feature Catalog (ADR-0017 / ADR-0019, global, platform-owned)
  findFeatureCatalogEntry(featureKey: string): Promise<AIFeatureCatalogEntry | null>;
  listFeatureCatalog(): Promise<AIFeatureCatalogEntry[]>;
  addFeatureCatalogEntry(entry: AIFeatureCatalogEntry): Promise<void>;
  updateFeatureCatalogEntry(entry: AIFeatureCatalogEntry): Promise<void>;

  // Organization AI Feature Settings
  findOrganizationFeatureSettings(
    organizationId: string,
    featureKey: string
  ): Promise<OrganizationAIFeatureSettings | null>;
  findOrganizationFeatureSettingsForUpdate(
    organizationId: string,
    featureKey: string
  ): Promise<OrganizationAIFeatureSettings | null>;
  listOrganizationFeatureSettings(organizationId: string): Promise<OrganizationAIFeatureSettings[]>;
  addOrganizationFeatureSettings(settings: OrganizationAIFeatureSettings): Promise<void>;
  updateOrganizationFeatureSettings(settings: OrganizationAIFeatureSettings): Promise<void>;

  // AI Provider Catalog (global, platform-owned)
  findProviderCatalogEntry(providerKey: string): Promise<AIProviderCatalogEntry | null>;
  listProviderCatalog(): Promise<AIProviderCatalogEntry[]>;
  addProviderCatalogEntry(entry: AIProviderCatalogEntry): Promise<void>;
  updateProviderCatalogEntry(entry: AIProviderCatalogEntry): Promise<void>;

  // Organization AI Provider Config (ADR-0018)
  findActiveProviderConfig(
    organizationId: string,
    provider: string
  ): Promise<OrganizationAIProviderConfig | null>;
  findActiveProviderConfigForUpdate(
    organizationId: string,
    provider: string
  ): Promise<OrganizationAIProviderConfig | null>;
  findProviderConfigById(
    organizationId: string,
    configId: string
  ): Promise<OrganizationAIProviderConfig | null>;
  listProviderConfigs(organizationId: string): Promise<OrganizationAIProviderConfig[]>;
  addProviderConfig(config: OrganizationAIProviderConfig): Promise<void>;
  updateProviderConfig(config: OrganizationAIProviderConfig): Promise<void>;

  // AI Model Registry (global, platform-owned)
  findModel(provider: string, modelKey: string): Promise<AIModelRegistryEntry | null>;
  listModels(): Promise<AIModelRegistryEntry[]>;
  addModel(model: AIModelRegistryEntry): Promise<void>;
  updateModel(model: AIModelRegistryEntry): Promise<void>;

  // AI Prompt Registry (global, platform-owned, versioned)
  findPublishedPrompt(promptKey: string): Promise<AIPromptRegistryEntry | null>;
  findPublishedPromptForUpdate(promptKey: string): Promise<AIPromptRegistryEntry | null>;
  findPromptVersion(promptKey: string, version: number): Promise<AIPromptRegistryEntry | null>;
  listPromptVersions(promptKey: string): Promise<AIPromptRegistryEntry[]>;
  addPromptVersion(entry: AIPromptRegistryEntry): Promise<void>;
  updatePromptVersion(entry: AIPromptRegistryEntry): Promise<void>;

  // AI Provider Routing Policy
  listActiveRoutes(organizationId: string, featureKey: string): Promise<AIProviderRoutingPolicy[]>;
  findRoutingPolicyById(
    organizationId: string,
    routingId: string
  ): Promise<AIProviderRoutingPolicy | null>;
  addRoutingPolicy(policy: AIProviderRoutingPolicy): Promise<void>;
  updateRoutingPolicy(policy: AIProviderRoutingPolicy): Promise<void>;

  // AI Execution
  findExecutionById(organizationId: string, executionId: string): Promise<AIExecution | null>;
  findActiveExecutionByIdempotencyKey(
    organizationId: string,
    featureKey: string,
    idempotencyKey: string
  ): Promise<AIExecution | null>;
  addExecution(execution: AIExecution): Promise<void>;
  updateExecution(execution: AIExecution): Promise<void>;
  listExecutions(organizationId: string, featureKey?: string): Promise<AIExecution[]>;
}
