import { AppError, badRequest, conflict, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor } from "../core/types";
import { authorizeOrganizationActor } from "./authorization";
import { auditAllowed, auditDenied } from "./audit";
import type { AIRepository } from "./repository";
import type { AITransactionRunner } from "./transaction";
import type { AIProviderRoutingPolicy } from "./types";
import { validateRoutingPolicyInput } from "./validation";

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

// Every createRoute() rejection that SPEC-014's "ai.routing_invalid_denied" example list names
// explicitly ("prioridade duplicada, provider inexistente, model inexistente, rota incompativel
// ou configuracao ambigua") maps to a safe, short reason here -- never the raw AppError message.
const invalidRoutingReasons: Record<string, string> = {
  ai_routing_priority_conflict: "priority_conflict",
  ai_feature_not_found: "feature_not_found",
  ai_provider_not_configured: "provider_not_configured",
  ai_model_unavailable: "model_unavailable"
};

// AI Provider Routing Policy (ADR-0019 "Provider Routing"/"Prioridade"). A route only ever
// carries provider, model, priority, status -- never a fallback field (SPEC-014 "Fallback":
// "AI Provider Routing Policy nao possui campo de fallback").
export class AIRoutingService {
  constructor(
    private readonly core: CoreRepository,
    private readonly ai: AIRepository,
    private readonly runTransaction: AITransactionRunner
  ) {}

  async listRoutes(
    actor: Actor,
    organizationId: string,
    featureKey: string
  ): Promise<AIProviderRoutingPolicy[]> {
    await authorizeOrganizationActor(this.core, actor, organizationId, ["owner", "admin"]);
    return this.ai.listActiveRoutes(organizationId, featureKey);
  }

  async createRoute(
    actor: Actor,
    organizationId: string,
    rawInput: unknown
  ): Promise<AIProviderRoutingPolicy> {
    const context = await authorizeOrganizationActor(this.core, actor, organizationId, ["owner"]);
    const input = validateRoutingPolicyInput(rawInput);

    // A unique-violation on INSERT aborts the whole PostgreSQL transaction -- any further
    // query on that same connection (including an audit INSERT) would fail too. So the
    // priority-conflict audit is written in a separate call, after this transaction has
    // already rolled back, using `this.core` (a fresh connection), never the transactional
    // `core` the failed INSERT ran on.
    try {
      return await this.runTransaction(async ({ core, ai }) => {
        const feature = await ai.findFeatureCatalogEntry(input.featureKey);
        if (!feature) {
          throw badRequest("ai_feature_not_found", "Feature does not exist in the catalog.");
        }

        const providerConfig = await ai.findActiveProviderConfig(organizationId, input.provider);
        if (!providerConfig || providerConfig.status !== "configured") {
          throw badRequest(
            "ai_provider_not_configured",
            "Provider is not configured for this Organization."
          );
        }

        const model = await ai.findModel(input.provider, input.modelKey);
        if (!model || model.status !== "active") {
          throw badRequest("ai_model_unavailable", "Model is not active in the registry.");
        }

        const now = ai.now();
        const route: AIProviderRoutingPolicy = {
          id: ai.nextId("airp"),
          organizationId,
          featureKey: input.featureKey,
          provider: input.provider,
          modelKey: input.modelKey,
          priority: input.priority,
          status: "active",
          createdByUserId: context.userId,
          updatedByUserId: context.userId,
          createdAt: now,
          updatedAt: now
        };

        try {
          await ai.addRoutingPolicy(route);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw conflict(
              "ai_routing_priority_conflict",
              "Another active route already uses this priority for this Feature."
            );
          }
          throw error;
        }

        await auditAllowed(core, actor, organizationId, "ai.routing_created", {
          featureKey: input.featureKey,
          provider: input.provider,
          modelKey: input.modelKey,
          priority: String(input.priority)
        });

        return route;
      });
    } catch (error) {
      const reason = error instanceof AppError ? invalidRoutingReasons[error.code] : undefined;
      if (reason) {
        // Same fresh-connection reasoning as the priority-conflict case above: whatever failed
        // (a validation badRequest thrown before any write, or the INSERT's unique violation)
        // already means the transactional `core`/`ai` for this attempt cannot be trusted for a
        // further write, so this always goes through `this.core` on its own connection
        // (SPEC-014 "ai.routing_invalid_denied": "provider inexistente, model inexistente, rota
        // incompativel ou configuracao ambigua").
        await auditDenied(this.core, actor, organizationId, "ai.routing_invalid_denied", reason, {
          featureKey: input.featureKey,
          provider: input.provider,
          modelKey: input.modelKey,
          priority: String(input.priority)
        });
      }
      throw error;
    }
  }

  async deactivateRoute(
    actor: Actor,
    organizationId: string,
    routingId: string
  ): Promise<AIProviderRoutingPolicy> {
    const context = await authorizeOrganizationActor(this.core, actor, organizationId, ["owner"]);
    return this.runTransaction(async ({ core, ai }) => {
      const route = await ai.findRoutingPolicyById(organizationId, routingId);
      if (!route) {
        throw notFound("ai_routing_not_found", "Routing policy not found.");
      }
      const next: AIProviderRoutingPolicy = {
        ...route,
        status: "inactive",
        updatedByUserId: context.userId,
        updatedAt: ai.now()
      };
      await ai.updateRoutingPolicy(next);
      await auditAllowed(core, actor, organizationId, "ai.routing_disabled", {
        featureKey: route.featureKey,
        routingId
      });
      return next;
    });
  }

  // Internal use by AIGateway: returns active routes ordered by ascending priority (lowest
  // number first = highest priority). Never used to make an authorization decision by itself.
  async resolveOrderedRoutes(
    organizationId: string,
    featureKey: string
  ): Promise<AIProviderRoutingPolicy[]> {
    return this.ai.listActiveRoutes(organizationId, featureKey);
  }
}
