import { AppError, badRequest, conflict, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor } from "../core/types";
import { authorizeOrganizationActor, requirePlatformActor } from "./authorization";
import { auditAllowed, auditDenied } from "./audit";
import type { AIRepository } from "./repository";
import type { AITransactionRunner } from "./transaction";
import type { AIPromptRegistryEntry } from "./types";
import { validatePromptDraftInput } from "./validation";

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export type PromptSummary = {
  promptKey: string;
  version: number;
  status: AIPromptRegistryEntry["status"];
  publishedAt: string | null;
};

// Global, platform-owned, versioned Prompt Registry (ADR-0019 "Prompt Registry"). Organizations
// never create or edit prompts. Publishing a new version archives the previously published
// version of the same prompt_key in the same transaction -- there is never a moment where two
// versions of the same prompt_key are both `published` (SPEC-014 "Prompt Registry").
export class AIPromptRegistryService {
  constructor(
    private readonly core: CoreRepository,
    private readonly ai: AIRepository,
    private readonly runTransaction: AITransactionRunner
  ) {}

  async listVersionsAsPlatformAdmin(
    actor: Actor,
    promptKey: string
  ): Promise<AIPromptRegistryEntry[]> {
    requirePlatformActor(actor);
    return this.ai.listPromptVersions(promptKey);
  }

  async getPublishedSummaryForOrganization(
    actor: Actor,
    organizationId: string,
    promptKey: string
  ): Promise<PromptSummary | null> {
    await authorizeOrganizationActor(this.core, actor, organizationId, ["owner", "admin"]);
    const entry = await this.ai.findPublishedPrompt(promptKey);
    if (!entry) {
      return null;
    }
    return {
      promptKey: entry.promptKey,
      version: entry.version,
      status: entry.status,
      publishedAt: entry.publishedAt
    };
  }

  // Internal use by the Gateway only: promptKey is resolved from AI Feature Catalog, never
  // taken directly from client input for an execution request.
  async getPublishedForExecution(promptKey: string): Promise<AIPromptRegistryEntry | null> {
    return this.ai.findPublishedPrompt(promptKey);
  }

  async createDraft(actor: Actor, rawInput: unknown): Promise<AIPromptRegistryEntry> {
    requirePlatformActor(actor);
    const input = validatePromptDraftInput(rawInput);
    return this.runTransaction(async ({ core, ai }) => {
      const feature = await ai.findFeatureCatalogEntry(input.featureKey);
      if (!feature) {
        throw badRequest("ai_feature_not_found", "Feature does not exist in the catalog.");
      }
      const existingVersions = await ai.listPromptVersions(input.promptKey);
      // A prompt_key names one lineage of one Feature's prompt (ADR-0019 "cada prompt possui,
      // conceitualmente... prompt_key; Feature relacionada"). Every version therefore carries
      // the same featureKey -- this is what lets AIFeatureCatalog.setDefaultPromptKey trust a
      // prompt_key's featureKey without a hard FK (prompt_key alone is not unique here).
      if (existingVersions.some((version) => version.featureKey !== input.featureKey)) {
        throw badRequest(
          "ai_prompt_feature_mismatch",
          "This prompt_key already belongs to a different Feature."
        );
      }
      const nextVersion =
        existingVersions.reduce((max, entry) => Math.max(max, entry.version), 0) + 1;
      const now = ai.now();
      const entry: AIPromptRegistryEntry = {
        id: ai.nextId("aipr"),
        promptKey: input.promptKey,
        version: nextVersion,
        featureKey: input.featureKey,
        status: "draft",
        template: input.template,
        inputSchema: input.inputSchema,
        outputSchema: input.outputSchema,
        metadata: input.metadata ?? {},
        createdByUserId: null,
        publishedAt: null,
        archivedAt: null,
        createdAt: now
      };
      await ai.addPromptVersion(entry);
      await auditAllowed(core, actor, null, "ai.prompt_draft_created", {
        promptKey: entry.promptKey,
        version: String(entry.version)
      });
      return entry;
    });
  }

  // Atomically archives whatever is currently published (if anything) and publishes the given
  // draft version, in a single transaction (SPEC-014 "Prompt Registry" / "Publicacao").
  //
  // findPublishedPromptForUpdate()'s `SELECT ... FOR UPDATE` locks whatever row is currently
  // published, so two concurrent publish() calls for the same prompt_key serialize on that
  // lock -- but under READ COMMITTED, the second call's SELECT re-evaluates its WHERE clause
  // once unblocked, and by then the first call has already changed that row's status away from
  // 'published'. So the second call sees `currentlyPublished = null` and tries to publish its
  // own version too, straight into the uq_ai_prompt_published partial unique index (the
  // "defense-in-depth backstop" from the 0015 migration). The application-level lock alone is
  // therefore not sufficient by itself; the unique-violation it produces here is the actual
  // safety net, and it must be turned into a clean, expected AppError -- never let a raw
  // Postgres error escape -- exactly like the priority-conflict handling in
  // AIRoutingService.createRoute().
  async publish(actor: Actor, promptKey: string, version: number): Promise<AIPromptRegistryEntry> {
    requirePlatformActor(actor);
    try {
      return await this.runTransaction(async ({ core, ai }) => {
        const draft = await ai.findPromptVersion(promptKey, version);
        if (!draft) {
          throw notFound("ai_prompt_version_not_found", "Prompt version does not exist.");
        }
        if (draft.status !== "draft") {
          throw conflict("ai_prompt_not_draft", "Only a draft version can be published.");
        }

        const currentlyPublished = await ai.findPublishedPromptForUpdate(promptKey);
        const now = ai.now();

        if (currentlyPublished) {
          await ai.updatePromptVersion({
            ...currentlyPublished,
            status: "archived",
            archivedAt: now
          });
        }

        const published: AIPromptRegistryEntry = {
          ...draft,
          status: "published",
          publishedAt: now
        };
        try {
          await ai.updatePromptVersion(published);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw conflict(
              "ai_prompt_publish_conflict",
              "Another version of this prompt was published concurrently. Retry."
            );
          }
          throw error;
        }

        await auditAllowed(core, actor, null, "ai.prompt_published", {
          promptKey,
          version: String(version),
          previousVersion: currentlyPublished ? String(currentlyPublished.version) : null
        });

        return published;
      });
    } catch (error) {
      if (error instanceof AppError && error.code === "ai_prompt_publish_conflict") {
        // Same fresh-connection reasoning as AIRoutingService.createRoute(): the unique
        // violation already aborted the transaction above, so this audit uses `this.core` on
        // its own connection, never the rolled-back transactional `core`.
        await auditDenied(
          this.core,
          actor,
          null,
          "ai.prompt_publish_denied",
          "concurrent_publish_conflict",
          { promptKey, version: String(version) }
        );
      }
      throw error;
    }
  }

  async archivePublished(actor: Actor, promptKey: string): Promise<AIPromptRegistryEntry> {
    requirePlatformActor(actor);
    return this.runTransaction(async ({ core, ai }) => {
      const currentlyPublished = await ai.findPublishedPromptForUpdate(promptKey);
      if (!currentlyPublished) {
        throw notFound(
          "ai_prompt_not_published",
          "No published version exists for this prompt_key."
        );
      }
      const archived: AIPromptRegistryEntry = {
        ...currentlyPublished,
        status: "archived",
        archivedAt: ai.now()
      };
      await ai.updatePromptVersion(archived);
      await auditAllowed(core, actor, null, "ai.prompt_archived", {
        promptKey,
        version: String(archived.version)
      });
      return archived;
    });
  }
}
