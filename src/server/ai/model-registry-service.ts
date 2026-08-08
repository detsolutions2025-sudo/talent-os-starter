import { badRequest, conflict } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor } from "../core/types";
import { authorizeOrganizationActor, requirePlatformActor } from "./authorization";
import { auditAllowed } from "./audit";
import type { AIRepository } from "./repository";
import type { AITransactionRunner } from "./transaction";
import type { AIModelRegistryEntry } from "./types";
import { validateModelRegistryInput } from "./validation";

// Global, platform-owned Model Registry (ADR-0019 "Model Registry"). Organizations never
// create models; the frontend never sends a provider/model pair the platform did not
// register.
export class AIModelRegistryService {
  constructor(
    private readonly core: CoreRepository,
    private readonly ai: AIRepository,
    private readonly runTransaction: AITransactionRunner
  ) {}

  async listAsPlatformAdmin(actor: Actor): Promise<AIModelRegistryEntry[]> {
    requirePlatformActor(actor);
    return this.ai.listModels();
  }

  // "Owner escolhe apenas modelos que estejam disponiveis (ativos), de provider utilizavel
  // pela Organization" (SPEC-014 "Model Registry - regras de administracao") -- a model is
  // only surfaced to an Organization if it is active AND the Organization has a usable
  // (active) credential for that provider.
  async listAvailableForOrganization(
    actor: Actor,
    organizationId: string
  ): Promise<AIModelRegistryEntry[]> {
    await authorizeOrganizationActor(this.core, actor, organizationId, ["owner", "admin"]);
    const [models, configs] = await Promise.all([
      this.ai.listModels(),
      this.ai.listProviderConfigs(organizationId)
    ]);
    const usableProviders = new Set(
      configs
        .filter(
          (config) =>
            config.isActive &&
            config.credentialMode !== "disabled" &&
            config.status === "configured"
        )
        .map((config) => config.provider)
    );
    return models.filter(
      (model) => model.status === "active" && usableProviders.has(model.provider)
    );
  }

  // Internal use by AIGateway only, mirroring AIProviderConfigService.getActiveConfigForExecution.
  async getModelForExecution(provider: string, modelKey: string) {
    return this.ai.findModel(provider, modelKey);
  }

  async register(actor: Actor, rawInput: unknown): Promise<AIModelRegistryEntry> {
    requirePlatformActor(actor);
    const input = validateModelRegistryInput(rawInput);
    return this.runTransaction(async ({ core, ai }) => {
      const providerEntry = await ai.findProviderCatalogEntry(input.provider);
      if (!providerEntry) {
        throw badRequest("ai_provider_not_found", "Provider does not exist in the catalog.");
      }
      const existing = await ai.findModel(input.provider, input.modelKey);
      if (existing) {
        throw conflict("ai_model_already_exists", "Model already exists in the registry.");
      }
      const now = ai.now();
      const entry: AIModelRegistryEntry = {
        id: ai.nextId("aimr"),
        provider: input.provider,
        modelKey: input.modelKey,
        providerModelIdentifier: input.providerModelIdentifier,
        status: "active",
        capabilities: input.capabilities ?? {},
        contextWindow: input.contextWindow ?? null,
        metadata: input.metadata ?? {},
        createdAt: now,
        updatedAt: now
      };
      await ai.addModel(entry);
      await auditAllowed(core, actor, null, "ai.model_registered", {
        provider: entry.provider,
        modelKey: entry.modelKey
      });
      return entry;
    });
  }

  async retire(actor: Actor, provider: string, modelKey: string): Promise<AIModelRegistryEntry> {
    requirePlatformActor(actor);
    return this.runTransaction(async ({ core, ai }) => {
      const entry = await ai.findModel(provider, modelKey);
      if (!entry) {
        throw badRequest("ai_model_not_found", "Model does not exist in the registry.");
      }
      const next: AIModelRegistryEntry = { ...entry, status: "retired", updatedAt: ai.now() };
      await ai.updateModel(next);
      await auditAllowed(core, actor, null, "ai.model_retired", { provider, modelKey });
      return next;
    });
  }
}
