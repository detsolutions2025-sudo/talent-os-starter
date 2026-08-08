import { badRequest, conflict } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor } from "../core/types";
import {
  actorUserIdOrNull,
  authorizeOrganizationActor,
  requirePlatformActor
} from "./authorization";
import { auditAllowed } from "./audit";
import type { AIRepository } from "./repository";
import type { AITransactionRunner } from "./transaction";
import type {
  AIFeatureCatalogEntry,
  FeatureAvailabilityInput,
  FeatureCatalogInput,
  FeatureFallbackAllowedInput,
  OrganizationAIFeatureSettings,
  OrganizationAISettings,
  OrganizationFallbackToggleInput,
  OrganizationFeatureToggleInput
} from "./types";
import {
  validateDefaultPromptKeyInput,
  validateFallbackAllowedInput,
  validateFallbackToggleInput,
  validateFeatureAvailabilityInput,
  validateFeatureCatalogInput,
  validateFeatureToggleInput
} from "./validation";

// Thrown by assertExecutable(). Always maps to error_category = "policy_denied" (see
// src/server/ai/gateway.ts). `reason` is a short, safe machine code -- never a message that
// echoes business data.
export class PolicyDeniedError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "PolicyDeniedError";
  }
}

export type PolicyGate = {
  orgSettings: OrganizationAISettings;
  featureCatalog: AIFeatureCatalogEntry;
  orgFeatureSettings: OrganizationAIFeatureSettings;
};

// The single authority that decides whether AI may execute (SPEC-014 "Regra de execucao",
// ADR-0019 "Ordem obrigatoria de autorizacao"). No other service in this module may read
// organization_ai_enabled, feature_available_on_platform or organization_feature_enabled in
// isolation to make that decision -- everything routes through assertExecutable().
export class AIPolicyService {
  constructor(
    private readonly core: CoreRepository,
    private readonly ai: AIRepository,
    private readonly runTransaction: AITransactionRunner
  ) {}

  // -------------------------------------------------------------------------------------
  // Organization AI Settings (ADR-0016)
  // -------------------------------------------------------------------------------------

  async getOrganizationSettings(
    actor: Actor,
    organizationId: string
  ): Promise<OrganizationAISettings> {
    await authorizeOrganizationActor(this.core, actor, organizationId, ["owner", "admin"]);
    return this.loadOrDefaultSettings(organizationId);
  }

  async getOrganizationSettingsAsPlatformAdmin(
    actor: Actor,
    organizationId: string
  ): Promise<OrganizationAISettings> {
    requirePlatformActor(actor);
    return this.loadOrDefaultSettings(organizationId);
  }

  // Platform Admin authority. Never touches organization_ai_enabled.
  async setPlatformAllowed(actor: Actor, organizationId: string, value: boolean) {
    requirePlatformActor(actor);
    return this.runTransaction(async ({ core, ai }) => {
      const existing = await ai.findOrganizationAISettingsForUpdate(organizationId);
      const now = ai.now();
      const next: OrganizationAISettings = existing
        ? {
            ...existing,
            platformAiAllowed: value,
            updatedByUserId: actorUserIdOrNull(actor),
            updatedAt: now
          }
        : {
            organizationId,
            platformAiAllowed: value,
            organizationAiEnabled: false,
            updatedByUserId: actorUserIdOrNull(actor),
            createdAt: now,
            updatedAt: now
          };
      await ai.upsertOrganizationAISettings(next);
      await auditAllowed(core, actor, organizationId, "ai.platform_ai_allowed_changed", {
        value: String(value),
        previous: existing ? String(existing.platformAiAllowed) : null
      });
      return next;
    });
  }

  // Owner authority. Never touches platform_ai_allowed. The value written here is always the
  // Organization's persisted preference -- it is never forced to false by a platform-level
  // change, and it is never rejected here just because platform_ai_allowed is currently false
  // (SPEC-014: "o valor armazenado... permanece armazenado... fica inerte").
  async setOrganizationPreference(actor: Actor, organizationId: string, value: boolean) {
    const context = await authorizeOrganizationActor(this.core, actor, organizationId, ["owner"]);
    return this.runTransaction(async ({ core, ai }) => {
      const existing = await ai.findOrganizationAISettingsForUpdate(organizationId);
      const now = ai.now();
      const next: OrganizationAISettings = existing
        ? {
            ...existing,
            organizationAiEnabled: value,
            updatedByUserId: context.userId,
            updatedAt: now
          }
        : {
            organizationId,
            platformAiAllowed: false,
            organizationAiEnabled: value,
            updatedByUserId: context.userId,
            createdAt: now,
            updatedAt: now
          };
      await ai.upsertOrganizationAISettings(next);
      await auditAllowed(core, actor, organizationId, "ai.organization_ai_enabled_changed", {
        value: String(value),
        previous: existing ? String(existing.organizationAiEnabled) : null,
        effective: String(next.platformAiAllowed && next.organizationAiEnabled)
      });
      return next;
    });
  }

  private async loadOrDefaultSettings(organizationId: string): Promise<OrganizationAISettings> {
    const existing = await this.ai.findOrganizationAISettings(organizationId);
    if (existing) {
      return existing;
    }
    const now = this.ai.now();
    return {
      organizationId,
      platformAiAllowed: false,
      organizationAiEnabled: false,
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now
    };
  }

  // -------------------------------------------------------------------------------------
  // AI Feature Catalog (ADR-0017 / ADR-0019, global, platform-owned)
  // -------------------------------------------------------------------------------------

  async listFeatureCatalogAsPlatformAdmin(actor: Actor): Promise<AIFeatureCatalogEntry[]> {
    requirePlatformActor(actor);
    return this.ai.listFeatureCatalog();
  }

  async listAvailableFeatures(
    actor: Actor,
    organizationId: string
  ): Promise<AIFeatureCatalogEntry[]> {
    await authorizeOrganizationActor(this.core, actor, organizationId, ["owner", "admin"]);
    const catalog = await this.ai.listFeatureCatalog();
    return catalog.filter((entry) => entry.featureAvailableOnPlatform);
  }

  async createFeature(actor: Actor, rawInput: unknown): Promise<AIFeatureCatalogEntry> {
    requirePlatformActor(actor);
    const input: FeatureCatalogInput = validateFeatureCatalogInput(rawInput);
    return this.runTransaction(async ({ core, ai }) => {
      const existing = await ai.findFeatureCatalogEntry(input.featureKey);
      if (existing) {
        throw conflict("ai_feature_already_exists", "Feature already exists in the catalog.");
      }
      const now = ai.now();
      const entry: AIFeatureCatalogEntry = {
        featureKey: input.featureKey,
        name: input.name,
        description: input.description ?? null,
        featureAvailableOnPlatform: false,
        fallbackAllowedOnPlatform: false,
        requiredCapabilities: input.requiredCapabilities ?? {},
        defaultPromptKey: null,
        createdAt: now,
        updatedAt: now
      };
      await ai.addFeatureCatalogEntry(entry);
      await auditAllowed(core, actor, null, "ai.feature_created", { featureKey: entry.featureKey });
      return entry;
    });
  }

  async setFeatureAvailability(actor: Actor, featureKey: string, rawInput: unknown) {
    requirePlatformActor(actor);
    const input: FeatureAvailabilityInput = validateFeatureAvailabilityInput(rawInput);
    return this.runTransaction(async ({ core, ai }) => {
      const entry = await this.requireFeature(ai, featureKey);
      const next: AIFeatureCatalogEntry = {
        ...entry,
        featureAvailableOnPlatform: input.featureAvailableOnPlatform,
        updatedAt: ai.now()
      };
      await ai.updateFeatureCatalogEntry(next);
      await auditAllowed(
        core,
        actor,
        null,
        input.featureAvailableOnPlatform ? "ai.feature_made_available" : "ai.feature_retired",
        { featureKey, value: String(input.featureAvailableOnPlatform) }
      );
      return next;
    });
  }

  async setFallbackAllowedOnPlatform(actor: Actor, featureKey: string, rawInput: unknown) {
    requirePlatformActor(actor);
    const input: FeatureFallbackAllowedInput = validateFallbackAllowedInput(rawInput);
    return this.runTransaction(async ({ core, ai }) => {
      const entry = await this.requireFeature(ai, featureKey);
      const next: AIFeatureCatalogEntry = {
        ...entry,
        fallbackAllowedOnPlatform: input.fallbackAllowedOnPlatform,
        updatedAt: ai.now()
      };
      await ai.updateFeatureCatalogEntry(next);
      await auditAllowed(core, actor, null, "ai.fallback_allowed_on_platform_changed", {
        featureKey,
        value: String(input.fallbackAllowedOnPlatform)
      });
      return next;
    });
  }

  // Binds a Feature to the prompt_key its executions must resolve (ADR-0019 "Prompt por
  // Feature"). Platform Admin only, since AI Feature Catalog is platform-owned. There is no
  // hard FK for this (prompt_key alone is not unique in ai_prompt_registry -- versions share
  // it), so this is the one place that enforces, at write time, that the prompt_key being
  // bound actually belongs to this featureKey (every version of a prompt_key is created under
  // a single, consistent featureKey -- see AIPromptRegistryService.createDraft).
  async setDefaultPromptKey(actor: Actor, featureKey: string, rawInput: unknown) {
    requirePlatformActor(actor);
    const promptKey = validateDefaultPromptKeyInput(rawInput);
    return this.runTransaction(async ({ core, ai }) => {
      const entry = await this.requireFeature(ai, featureKey);
      const versions = await ai.listPromptVersions(promptKey);
      if (versions.length === 0) {
        throw badRequest("ai_prompt_not_found", "Prompt does not exist.");
      }
      if (versions.some((version) => version.featureKey !== featureKey)) {
        throw badRequest("ai_prompt_feature_mismatch", "Prompt belongs to a different Feature.");
      }
      const next: AIFeatureCatalogEntry = {
        ...entry,
        defaultPromptKey: promptKey,
        updatedAt: ai.now()
      };
      await ai.updateFeatureCatalogEntry(next);
      await auditAllowed(core, actor, null, "ai.feature_default_prompt_changed", {
        featureKey,
        promptKey
      });
      return next;
    });
  }

  private async requireFeature(ai: AIRepository, featureKey: string) {
    const entry = await ai.findFeatureCatalogEntry(featureKey);
    if (!entry) {
      throw badRequest("ai_feature_not_found", "Feature does not exist in the catalog.");
    }
    return entry;
  }

  // -------------------------------------------------------------------------------------
  // Organization AI Feature Settings (ADR-0017 / ADR-0019 "Fallback")
  // -------------------------------------------------------------------------------------

  async getFeatureSettings(
    actor: Actor,
    organizationId: string,
    featureKey: string
  ): Promise<OrganizationAIFeatureSettings> {
    await authorizeOrganizationActor(this.core, actor, organizationId, ["owner", "admin"]);
    return this.loadOrDefaultFeatureSettings(organizationId, featureKey);
  }

  async listFeatureSettings(
    actor: Actor,
    organizationId: string
  ): Promise<OrganizationAIFeatureSettings[]> {
    await authorizeOrganizationActor(this.core, actor, organizationId, ["owner", "admin"]);
    return this.ai.listOrganizationFeatureSettings(organizationId);
  }

  async setOrganizationFeatureEnabled(
    actor: Actor,
    organizationId: string,
    featureKey: string,
    rawInput: unknown
  ) {
    const context = await authorizeOrganizationActor(this.core, actor, organizationId, ["owner"]);
    const input: OrganizationFeatureToggleInput = validateFeatureToggleInput(rawInput);
    return this.runTransaction(async ({ core, ai }) => {
      const feature = await this.requireFeature(ai, featureKey);
      if (input.organizationFeatureEnabled && !feature.featureAvailableOnPlatform) {
        throw badRequest(
          "ai_feature_not_available_on_platform",
          "Feature is not available on the platform."
        );
      }
      const next = await this.upsertFeatureSettings(
        ai,
        organizationId,
        featureKey,
        context.userId,
        (settings) => ({
          ...settings,
          organizationFeatureEnabled: input.organizationFeatureEnabled
        })
      );
      await auditAllowed(core, actor, organizationId, "ai.organization_feature_enabled_changed", {
        featureKey,
        value: String(input.organizationFeatureEnabled)
      });
      return next;
    });
  }

  async setOrganizationFallbackEnabled(
    actor: Actor,
    organizationId: string,
    featureKey: string,
    rawInput: unknown
  ) {
    const context = await authorizeOrganizationActor(this.core, actor, organizationId, ["owner"]);
    const input: OrganizationFallbackToggleInput = validateFallbackToggleInput(rawInput);
    return this.runTransaction(async ({ core, ai }) => {
      await this.requireFeature(ai, featureKey);
      const next = await this.upsertFeatureSettings(
        ai,
        organizationId,
        featureKey,
        context.userId,
        (settings) => ({ ...settings, fallbackEnabled: input.fallbackEnabled })
      );
      await auditAllowed(core, actor, organizationId, "ai.fallback_enabled_changed", {
        featureKey,
        value: String(input.fallbackEnabled)
      });
      return next;
    });
  }

  private async upsertFeatureSettings(
    ai: AIRepository,
    organizationId: string,
    featureKey: string,
    userId: string,
    mutate: (settings: OrganizationAIFeatureSettings) => OrganizationAIFeatureSettings
  ): Promise<OrganizationAIFeatureSettings> {
    const existing = await ai.findOrganizationFeatureSettingsForUpdate(organizationId, featureKey);
    const now = ai.now();
    if (existing) {
      const next = { ...mutate(existing), updatedByUserId: userId, updatedAt: now };
      await ai.updateOrganizationFeatureSettings(next);
      return next;
    }
    const created: OrganizationAIFeatureSettings = {
      id: ai.nextId("aifs"),
      organizationId,
      featureKey,
      organizationFeatureEnabled: false,
      fallbackEnabled: false,
      createdByUserId: userId,
      updatedByUserId: userId,
      createdAt: now,
      updatedAt: now
    };
    const next = { ...mutate(created), updatedByUserId: userId, updatedAt: now };
    await ai.addOrganizationFeatureSettings(next);
    return next;
  }

  private async loadOrDefaultFeatureSettings(
    organizationId: string,
    featureKey: string
  ): Promise<OrganizationAIFeatureSettings> {
    const existing = await this.ai.findOrganizationFeatureSettings(organizationId, featureKey);
    if (existing) {
      return existing;
    }
    const now = this.ai.now();
    return {
      id: "",
      organizationId,
      featureKey,
      organizationFeatureEnabled: false,
      fallbackEnabled: false,
      createdByUserId: "",
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now
    };
  }

  // -------------------------------------------------------------------------------------
  // The execution gate (ADR-0019 "Ordem obrigatoria de autorizacao", steps 1-4)
  // -------------------------------------------------------------------------------------

  async assertExecutable(organizationId: string, featureKey: string): Promise<PolicyGate> {
    const orgSettings = await this.loadOrDefaultSettings(organizationId);
    if (!orgSettings.platformAiAllowed) {
      throw new PolicyDeniedError("platform_ai_allowed_false");
    }
    if (!orgSettings.organizationAiEnabled) {
      throw new PolicyDeniedError("organization_ai_enabled_false");
    }

    const featureCatalog = await this.ai.findFeatureCatalogEntry(featureKey);
    if (!featureCatalog || !featureCatalog.featureAvailableOnPlatform) {
      throw new PolicyDeniedError("feature_available_on_platform_false");
    }

    const orgFeatureSettings = await this.loadOrDefaultFeatureSettings(organizationId, featureKey);
    if (!orgFeatureSettings.organizationFeatureEnabled) {
      throw new PolicyDeniedError("organization_feature_enabled_false");
    }

    return { orgSettings, featureCatalog, orgFeatureSettings };
  }

  // Used by AIRoutingService: fallback requires both authorizations simultaneously
  // (fallback_allowed_on_platform AND fallback_enabled).
  isFallbackAuthorized(gate: PolicyGate): boolean {
    return gate.featureCatalog.fallbackAllowedOnPlatform && gate.orgFeatureSettings.fallbackEnabled;
  }
}
