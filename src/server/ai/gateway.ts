import { randomUUID } from "node:crypto";
import { conflict } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor } from "../core/types";
import { actorUserIdOrNull, authorizeOrganizationActor } from "./authorization";
import { auditAllowed, auditDenied } from "./audit";
import { isCompatible } from "./compatibility";
import { isFallbackEligible, isRetryable } from "./error-categories";
import type { AIExecutionService } from "./execution-service";
import type { AIModelRegistryService } from "./model-registry-service";
import type { PolicyGate } from "./policy-service";
import { AIPolicyService, PolicyDeniedError } from "./policy-service";
import type { MinimalJsonSchema } from "./prompt-renderer";
import { renderPrompt, validateAgainstSchema } from "./prompt-renderer";
import type { AIPromptRegistryService } from "./prompt-registry-service";
import type { ProviderAdapterResolver } from "./provider-config-service";
import type { AIProviderConfigService } from "./provider-config-service";
import type { AIProviderCredential, AIProviderRequest } from "./providers/adapter";
import { AIProviderError } from "./providers/adapter";
import type { RateLimiter } from "./rate-limiter";
import type { AIRoutingService } from "./routing-service";
import type { SecretManager } from "./secrets/secret-manager";
import { createTimeoutController, DEFAULT_EXECUTION_TIMEOUT_MS } from "./timeout";
import type {
  AIExecution,
  AIExecutionUsage,
  AIGatewayRequest,
  AIGatewayResult,
  AIProviderRoutingPolicy,
  ErrorCategory,
  JsonObject
} from "./types";
import { validateGatewayInput, validateIdempotencyKey, validateKey } from "./validation";

export type AIGatewayOptions = {
  executionTimeoutMs?: number;
  maxRetriesPerRoute?: number;
  retryBackoffMs?: number;
};

function toUsage(execution: AIExecution): AIExecutionUsage {
  return {
    executionId: execution.id,
    correlationId: execution.correlationId,
    provider: execution.provider,
    modelKey: execution.modelKey,
    promptKey: execution.promptKey,
    promptVersion: execution.promptVersion,
    status: execution.status,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    durationMs: execution.durationMs,
    inputTokens: execution.inputTokens,
    outputTokens: execution.outputTokens,
    estimatedCost: execution.estimatedCost,
    errorCategory: execution.errorCategory
  };
}

function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

// The single point of entry for any AI execution in the Talent OS (ADR-0019 "AI Gateway").
// No business module (InterviewService, a future Avaliacao Assistida, Matching, Onboarding,
// Desenvolvimento...) may call a provider directly; every one of them calls
// AIGateway.execute() and receives back a typed AIGatewayResult, never a raw provider
// response. This class is the only place in the codebase that is allowed to import an
// AIProviderAdapter and drive it.
export class AIGateway {
  private readonly executionTimeoutMs: number;
  private readonly maxRetriesPerRoute: number;
  private readonly retryBackoffMs: number;

  constructor(
    private readonly core: CoreRepository,
    private readonly policyService: AIPolicyService,
    private readonly providerConfigService: AIProviderConfigService,
    private readonly modelRegistryService: AIModelRegistryService,
    private readonly promptRegistryService: AIPromptRegistryService,
    private readonly routingService: AIRoutingService,
    private readonly executionService: AIExecutionService,
    private readonly secretManager: SecretManager,
    private readonly resolveAdapter: ProviderAdapterResolver,
    private readonly rateLimiter: RateLimiter,
    options: AIGatewayOptions = {}
  ) {
    this.executionTimeoutMs = options.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS;
    this.maxRetriesPerRoute = options.maxRetriesPerRoute ?? 1;
    this.retryBackoffMs = options.retryBackoffMs ?? 50;
  }

  async execute<T = unknown>(
    actor: Actor,
    organizationId: string,
    request: AIGatewayRequest
  ): Promise<AIGatewayResult<T>> {
    // Step 1-2: authenticated context + Organization. Any active Membership role may invoke
    // the Gateway -- whether a given Feature should let a Member trigger it is that Feature's
    // own business authorization, decided before it ever calls the Gateway.
    await authorizeOrganizationActor(this.core, actor, organizationId, [
      "owner",
      "admin",
      "member"
    ]);

    const featureKey = validateKey(request.featureKey, "feature_key");
    const input = validateGatewayInput(request.input);
    const idempotencyKey = validateIdempotencyKey(request.idempotencyKey ?? null);
    const requestedByUserId = actorUserIdOrNull(actor);

    // Idempotent replay: never calls the provider again for a key that already succeeded.
    const existing = await this.executionService.findActiveByIdempotencyKey(
      organizationId,
      featureKey,
      idempotencyKey
    );
    if (existing) {
      if (existing.status === "succeeded") {
        return { kind: "idempotent_replay", usage: toUsage(existing) };
      }
      throw conflict(
        "ai_execution_in_progress",
        "An execution with this idempotency key is already pending or running."
      );
    }

    // Steps 3-6: the four-condition policy gate. Nothing below this line runs unless all four
    // are satisfied.
    let gate: PolicyGate;
    try {
      gate = await this.policyService.assertExecutable(organizationId, featureKey);
    } catch (error) {
      if (error instanceof PolicyDeniedError) {
        return this.deny(actor, organizationId, featureKey, error.reason, "policy_denied");
      }
      throw error;
    }

    // Step 7: rate limit, Organization + Feature, before routing is even resolved.
    if (
      !this.rateLimiter.checkAndRecord("executionOrgFeature", `${organizationId}:${featureKey}`)
    ) {
      return this.deny(
        actor,
        organizationId,
        featureKey,
        "organization_feature_rate_limited",
        "rate_limited"
      );
    }

    // Step 8: routing.
    const routes = await this.routingService.resolveOrderedRoutes(organizationId, featureKey);
    if (routes.length === 0) {
      return this.deny(
        actor,
        organizationId,
        featureKey,
        "routing_not_found",
        "configuration_error"
      );
    }

    // Prompt (route-independent, resolved once): SPEC-014 "Prompt por Feature".
    const promptKey = gate.featureCatalog.defaultPromptKey;
    if (!promptKey) {
      return this.deny(
        actor,
        organizationId,
        featureKey,
        "prompt_not_configured",
        "configuration_error"
      );
    }
    const prompt = await this.promptRegistryService.getPublishedForExecution(promptKey);
    if (!prompt) {
      return this.deny(
        actor,
        organizationId,
        featureKey,
        "prompt_not_published",
        "configuration_error"
      );
    }

    let rendered;
    try {
      rendered = renderPrompt(prompt.template, input, prompt.inputSchema as MinimalJsonSchema);
    } catch {
      return this.deny(
        actor,
        organizationId,
        featureKey,
        "prompt_input_invalid",
        "configuration_error"
      );
    }

    const fallbackAuthorized = this.policyService.isFallbackAuthorized(gate);
    const routesToTry = fallbackAuthorized ? routes : routes.slice(0, 1);
    const correlationId = randomUUID();

    let execution = await this.executionService.begin({
      organizationId,
      featureKey,
      provider: routes[0].provider,
      modelKey: routes[0].modelKey,
      promptKey: prompt.promptKey,
      promptVersion: prompt.version,
      credentialMode: "disabled",
      idempotencyKey,
      correlationId,
      requestedByUserId
    });

    let lastCategory: ErrorCategory = "unknown_error";

    for (let routeIndex = 0; routeIndex < routesToTry.length; routeIndex += 1) {
      const route = routesToTry[routeIndex];

      // Steps 9-13, revalidated for every candidate route, including fallback candidates
      // (SPEC-014 "Fallback" -- "revalida... antes de qualquer tentativa").
      let candidate;
      try {
        candidate = await this.validateRouteCandidate(organizationId, gate, route);
      } catch (error) {
        lastCategory = error instanceof AIProviderError ? error.category : "configuration_error";
        await this.recordRoutingSelected(
          actor,
          organizationId,
          execution,
          route,
          false,
          lastCategory
        );
        if (routeIndex === routesToTry.length - 1 || !isFallbackEligible(lastCategory)) {
          break;
        }
        continue;
      }

      execution = await this.executionService.recordAttempt(
        organizationId,
        execution.id,
        route.provider,
        route.modelKey,
        candidate.config.credentialMode
      );

      // Step 15: resolve secret -- never earlier than this point.
      const secret = await this.secretManager.resolve(
        candidate.config.secretReference ?? "",
        organizationId
      );
      const credential: AIProviderCredential = { provider: route.provider, secret };
      const adapter = this.resolveAdapter(route.provider);

      for (let attempt = 0; attempt <= this.maxRetriesPerRoute; attempt += 1) {
        const { signal, clear } = createTimeoutController(this.executionTimeoutMs);
        try {
          // Step 16-18: minimized payload, executed under timeout.
          const providerRequest: AIProviderRequest = {
            provider: route.provider,
            providerModelIdentifier: candidate.model.providerModelIdentifier,
            systemInstructions: rendered.systemInstructions,
            data: rendered.data as JsonObject,
            outputSchema: prompt.outputSchema as JsonObject,
            timeoutMs: this.executionTimeoutMs
          };
          const response = await adapter.execute(providerRequest, credential, signal);

          // Step 19: structured output validation -- never trust the raw response.
          this.assertStructuredOutput(
            response.structuredOutput,
            prompt.outputSchema as MinimalJsonSchema
          );

          // Steps 20-21: telemetry + conclusion.
          const completed = await this.executionService.complete(organizationId, execution.id, {
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            estimatedCost: response.estimatedCost
          });
          await this.recordRoutingSelected(actor, organizationId, completed, route, true, null);
          await auditAllowed(this.core, actor, organizationId, "ai.execution_succeeded", {
            featureKey,
            executionId: completed.id,
            provider: route.provider,
            modelKey: route.modelKey
          });

          // Step 22: typed DTO.
          return {
            kind: "executed",
            usage: toUsage(completed),
            output: response.structuredOutput as T
          };
        } catch (error) {
          const category =
            error instanceof AIProviderError ? error.category : adapter.normalizeError(error);
          lastCategory = category;
          if (attempt < this.maxRetriesPerRoute && isRetryable(category)) {
            await wait(this.retryBackoffMs);
            continue;
          }
          break;
        } finally {
          clear();
        }
      }

      await this.recordRoutingSelected(
        actor,
        organizationId,
        execution,
        route,
        false,
        lastCategory
      );

      if (
        routeIndex === routesToTry.length - 1 ||
        !fallbackAuthorized ||
        !isFallbackEligible(lastCategory)
      ) {
        break;
      }
    }

    const failed = await this.executionService.fail(organizationId, execution.id, lastCategory);
    await auditAllowed(this.core, actor, organizationId, "ai.execution_failed", {
      featureKey,
      executionId: failed.id,
      errorCategory: lastCategory
    });
    return {
      kind: "failed",
      usage: toUsage(failed),
      errorCategory: lastCategory,
      reason: lastCategory
    };
  }

  private async validateRouteCandidate(
    organizationId: string,
    gate: PolicyGate,
    route: AIProviderRoutingPolicy
  ) {
    const config = await this.providerConfigService.getActiveConfigForExecution(
      organizationId,
      route.provider
    );
    if (!config || config.status !== "configured" || config.credentialMode === "disabled") {
      throw new AIProviderError("configuration_error", "provider_not_configured");
    }

    const model = await this.modelRegistryService.getModelForExecution(
      route.provider,
      route.modelKey
    );
    if (!model || model.status !== "active") {
      throw new AIProviderError("configuration_error", "model_unavailable");
    }

    if (!isCompatible(gate.featureCatalog, model)) {
      throw new AIProviderError("configuration_error", "model_incompatible");
    }

    const rateLimitKey = `${organizationId}:${gate.featureCatalog.featureKey}:${route.provider}:${route.modelKey}`;
    if (!this.rateLimiter.checkAndRecord("executionOrgFeatureProviderModel", rateLimitKey)) {
      throw new AIProviderError("rate_limited", "provider_model_rate_limited");
    }

    return { config, model };
  }

  private assertStructuredOutput(structuredOutput: unknown, outputSchema: MinimalJsonSchema) {
    if (
      typeof structuredOutput !== "object" ||
      structuredOutput === null ||
      Array.isArray(structuredOutput)
    ) {
      throw new AIProviderError("invalid_response", "structured_output_not_an_object");
    }
    try {
      validateAgainstSchema(structuredOutput as JsonObject, outputSchema, "prompt_output");
    } catch {
      throw new AIProviderError("invalid_response", "structured_output_schema_mismatch");
    }
  }

  private async recordRoutingSelected(
    actor: Actor,
    organizationId: string,
    execution: AIExecution,
    route: AIProviderRoutingPolicy,
    succeeded: boolean,
    errorCategory: ErrorCategory | null
  ) {
    await auditAllowed(this.core, actor, organizationId, "ai.routing_selected", {
      featureKey: route.featureKey,
      executionId: execution.id,
      provider: route.provider,
      modelKey: route.modelKey,
      priority: String(route.priority),
      outcome: succeeded ? "succeeded" : "failed",
      errorCategory
    });
  }

  private async deny(
    actor: Actor,
    organizationId: string,
    featureKey: string,
    reason: string,
    errorCategory: ErrorCategory
  ): Promise<AIGatewayResult<never>> {
    await auditDenied(this.core, actor, organizationId, "ai.execution_denied", reason, {
      featureKey
    });
    return { kind: "denied", errorCategory, reason };
  }
}
