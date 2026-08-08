import type pg from "pg";
import type { CoreRepository } from "../core/repository";
import type { Actor } from "../core/types";
import { PostgresAIRepository } from "../persistence/postgres-ai-repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { authorizeOrganizationActor } from "./authorization";
import { AIExecutionService } from "./execution-service";
import type { AIGatewayOptions } from "./gateway";
import { AIGateway } from "./gateway";
import { AIModelRegistryService } from "./model-registry-service";
import { AIPolicyService } from "./policy-service";
import { AIProviderCatalogService } from "./provider-catalog-service";
import type { ProviderAdapterResolver } from "./provider-config-service";
import { AIProviderConfigService } from "./provider-config-service";
import { AIPromptRegistryService } from "./prompt-registry-service";
import { FakeProviderAdapter } from "./providers/fake-adapter";
import { RateLimiter } from "./rate-limiter";
import type { AIRepository } from "./repository";
import { AIRoutingService } from "./routing-service";
import { InMemorySecretManager } from "./secrets/secret-manager";
import type { SecretManager } from "./secrets/secret-manager";
import type { AITransactionRunner } from "./transaction";
import type { AIExecution } from "./types";

// Facade over every Phase 11 AI infrastructure service, plus the AIGateway. This is what
// src/server/app.ts wires up and what a future Feature module (Avaliacao Assistida, Matching,
// ...) would import to call `aiService.gateway.execute(...)`. No HTTP route calls the Gateway
// directly with an arbitrary featureKey -- see src/server/http/routes.ts.
export class AIService {
  readonly gateway: AIGateway;

  constructor(
    private readonly core: CoreRepository,
    private readonly ai: AIRepository,
    readonly policy: AIPolicyService,
    readonly providerCatalog: AIProviderCatalogService,
    readonly providerConfig: AIProviderConfigService,
    readonly modelRegistry: AIModelRegistryService,
    readonly promptRegistry: AIPromptRegistryService,
    readonly routing: AIRoutingService,
    executionService: AIExecutionService,
    secretManager: SecretManager,
    resolveAdapter: ProviderAdapterResolver,
    rateLimiter: RateLimiter,
    gatewayOptions: AIGatewayOptions = {}
  ) {
    this.gateway = new AIGateway(
      core,
      policy,
      providerConfig,
      modelRegistry,
      promptRegistry,
      routing,
      executionService,
      secretManager,
      resolveAdapter,
      rateLimiter,
      gatewayOptions
    );
  }

  // Telemetry read (SPEC-014 "Telemetria" / API "consultar uso/telemetria permitida").
  async listExecutions(
    actor: Actor,
    organizationId: string,
    featureKey?: string
  ): Promise<AIExecution[]> {
    await authorizeOrganizationActor(this.core, actor, organizationId, ["owner", "admin"]);
    return this.ai.listExecutions(organizationId, featureKey);
  }
}

export type CreateAIServiceOptions = {
  secretManager?: SecretManager;
  resolveAdapter?: ProviderAdapterResolver;
  gatewayOptions?: AIGatewayOptions;
};

// Phase 11 always defaults to InMemorySecretManager + FakeProviderAdapter -- there is no
// production Secret Manager or real provider adapter to opt into yet. A caller may override
// both for tests that need a specific, pre-configured FakeProviderAdapter instance.
export function createPostgresAIService(
  pool: pg.Pool,
  options: CreateAIServiceOptions = {}
): AIService {
  const core = new PostgresCoreRepository(pool);
  const ai = new PostgresAIRepository(pool);

  const runTransaction: AITransactionRunner = async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        ai: new PostgresAIRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  const secretManager = options.secretManager ?? new InMemorySecretManager();
  const resolveAdapter: ProviderAdapterResolver =
    options.resolveAdapter ?? (() => new FakeProviderAdapter());
  const rateLimiter = new RateLimiter();

  const policy = new AIPolicyService(core, ai, runTransaction);
  const providerCatalog = new AIProviderCatalogService(core, ai, runTransaction);
  const providerConfig = new AIProviderConfigService(
    core,
    ai,
    runTransaction,
    secretManager,
    resolveAdapter,
    rateLimiter
  );
  const modelRegistry = new AIModelRegistryService(core, ai, runTransaction);
  const promptRegistry = new AIPromptRegistryService(core, ai, runTransaction);
  const routing = new AIRoutingService(core, ai, runTransaction);
  const executionService = new AIExecutionService(ai, runTransaction);

  return new AIService(
    core,
    ai,
    policy,
    providerCatalog,
    providerConfig,
    modelRegistry,
    promptRegistry,
    routing,
    executionService,
    secretManager,
    resolveAdapter,
    rateLimiter,
    options.gatewayOptions ?? {}
  );
}
