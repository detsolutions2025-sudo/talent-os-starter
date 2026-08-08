import { badRequest, conflict } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor } from "../core/types";
import { authorizeOrganizationActor, requirePlatformActor } from "./authorization";
import { auditAllowed } from "./audit";
import type { AIRepository } from "./repository";
import type { AITransactionRunner } from "./transaction";
import type { AIProviderCatalogEntry } from "./types";
import { validateProviderCatalogInput } from "./validation";

// Global, platform-owned catalog of AI providers (ADR-0018 "Providers", ADR-0019). The domain
// is never coupled to a specific provider: nothing here references OpenAI/Anthropic/etc. by
// name in code, only through provider_key rows that Platform Admin registers.
export class AIProviderCatalogService {
  constructor(
    private readonly core: CoreRepository,
    private readonly ai: AIRepository,
    private readonly runTransaction: AITransactionRunner
  ) {}

  async listAsPlatformAdmin(actor: Actor): Promise<AIProviderCatalogEntry[]> {
    requirePlatformActor(actor);
    return this.ai.listProviderCatalog();
  }

  async listActiveForOrganization(
    actor: Actor,
    organizationId: string
  ): Promise<AIProviderCatalogEntry[]> {
    await authorizeOrganizationActor(this.core, actor, organizationId, ["owner", "admin"]);
    const catalog = await this.ai.listProviderCatalog();
    return catalog.filter((entry) => entry.status === "active");
  }

  async register(actor: Actor, rawInput: unknown): Promise<AIProviderCatalogEntry> {
    requirePlatformActor(actor);
    const input = validateProviderCatalogInput(rawInput);
    return this.runTransaction(async ({ core, ai }) => {
      const existing = await ai.findProviderCatalogEntry(input.providerKey);
      if (existing) {
        throw conflict("ai_provider_already_exists", "Provider already exists in the catalog.");
      }
      const now = ai.now();
      const entry: AIProviderCatalogEntry = {
        providerKey: input.providerKey,
        name: input.name,
        status: "active",
        capabilities: input.capabilities ?? {},
        metadata: input.metadata ?? {},
        createdAt: now,
        updatedAt: now
      };
      await ai.addProviderCatalogEntry(entry);
      await auditAllowed(core, actor, null, "ai.provider_registered", {
        provider: entry.providerKey
      });
      return entry;
    });
  }

  async retire(actor: Actor, providerKey: string): Promise<AIProviderCatalogEntry> {
    requirePlatformActor(actor);
    return this.runTransaction(async ({ core, ai }) => {
      const entry = await ai.findProviderCatalogEntry(providerKey);
      if (!entry) {
        throw badRequest("ai_provider_not_found", "Provider does not exist in the catalog.");
      }
      const next: AIProviderCatalogEntry = { ...entry, status: "retired", updatedAt: ai.now() };
      await ai.updateProviderCatalogEntry(next);
      await auditAllowed(core, actor, null, "ai.provider_retired", { provider: providerKey });
      return next;
    });
  }
}
