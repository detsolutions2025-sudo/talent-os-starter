import { badRequest, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor } from "../core/types";
import {
  actorUserIdOrNull,
  authorizeOrganizationActor,
  requirePlatformActor
} from "./authorization";
import { auditAllowed, auditDenied } from "./audit";
import { errorCategoryToAppError } from "./error-categories";
import type { AIProviderAdapter, AIProviderCredential } from "./providers/adapter";
import { AIProviderError } from "./providers/adapter";
import type { RateLimiter } from "./rate-limiter";
import type { AIRepository } from "./repository";
import type { SecretManager } from "./secrets/secret-manager";
import { createTimeoutController, DEFAULT_TEST_CONNECTION_TIMEOUT_MS } from "./timeout";
import type { AITransactionRunner } from "./transaction";
import type {
  ConfigureCredentialInput,
  OrganizationAIProviderConfig,
  OrganizationAIProviderConfigDTO,
  ValidationStatus
} from "./types";
import { toProviderConfigDTO } from "./types";
import { validateConfigureCredentialInput } from "./validation";

export type ProviderAdapterResolver = (provider: string) => AIProviderAdapter;

function actorRateLimitKey(actor: Actor): string {
  return actor.kind === "user" ? actor.userId : "platform";
}

function validationStatusForCategory(category: string | undefined): ValidationStatus {
  if (!category) {
    return "valid";
  }
  if (
    category === "authentication_error" ||
    category === "policy_denied" ||
    category === "content_blocked"
  ) {
    return "invalid";
  }
  if (
    category === "unknown_error" ||
    category === "invalid_response" ||
    category === "configuration_error"
  ) {
    return "unknown";
  }
  return "error";
}

// Handles BYOK (customer_managed) and platform_managed configuration, rotation, revocation
// and test_connection for organization_ai_provider_configs (ADR-0018).
//
// "Configure" and "rotate" are the same operation: whether or not a row already exists for
// this Organization + provider, the new credential is validated first, and only a validated
// credential ever causes the previous row (if any) to be deactivated -- the previous
// configuration is never touched, let alone replaced, until the new one is proven valid
// (SPEC-014 "Rotacao": "preservar a configuracao antiga ativa se a nova falhar").
export class AIProviderConfigService {
  constructor(
    private readonly core: CoreRepository,
    private readonly ai: AIRepository,
    private readonly runTransaction: AITransactionRunner,
    private readonly secretManager: SecretManager,
    private readonly resolveAdapter: ProviderAdapterResolver,
    private readonly rateLimiter: RateLimiter,
    private readonly testConnectionTimeoutMs = DEFAULT_TEST_CONNECTION_TIMEOUT_MS
  ) {}

  async listForOrganization(
    actor: Actor,
    organizationId: string
  ): Promise<OrganizationAIProviderConfigDTO[]> {
    await authorizeOrganizationActor(this.core, actor, organizationId, ["owner", "admin"]);
    const configs = await this.ai.listProviderConfigs(organizationId);
    return configs.filter((config) => config.isActive).map(toProviderConfigDTO);
  }

  // Internal use by AIGateway only: the caller has already authorized the whole execution
  // context via AIPolicyService.assertExecutable(); this is never reachable from an HTTP
  // route with a client-controlled organizationId/provider pair on its own.
  async getActiveConfigForExecution(organizationId: string, provider: string) {
    return this.ai.findActiveProviderConfig(organizationId, provider);
  }

  async getStatus(
    actor: Actor,
    organizationId: string,
    provider: string
  ): Promise<OrganizationAIProviderConfigDTO | null> {
    await authorizeOrganizationActor(this.core, actor, organizationId, ["owner", "admin"]);
    const config = await this.ai.findActiveProviderConfig(organizationId, provider);
    return config ? toProviderConfigDTO(config) : null;
  }

  async configureCredential(
    actor: Actor,
    organizationId: string,
    rawInput: unknown
  ): Promise<OrganizationAIProviderConfigDTO> {
    const input: ConfigureCredentialInput = validateConfigureCredentialInput(rawInput);

    if (input.credentialMode === "customer_managed") {
      await authorizeOrganizationActor(this.core, actor, organizationId, ["owner"]);
    } else {
      requirePlatformActor(actor);
    }

    const providerCatalogEntry = await this.ai.findProviderCatalogEntry(input.provider);
    if (!providerCatalogEntry || providerCatalogEntry.status !== "active") {
      throw badRequest("ai_provider_unavailable", "Provider is not available on the platform.");
    }

    const adapter = this.resolveAdapter(input.provider);
    const credential: AIProviderCredential = { provider: input.provider, secret: input.secret };
    const { signal, clear } = createTimeoutController(this.testConnectionTimeoutMs);
    let validation;
    try {
      validation = await adapter.validateCredential(credential, signal);
    } catch (error) {
      const category =
        error instanceof AIProviderError ? error.category : adapter.normalizeError(error);
      validation = { valid: false, category };
    } finally {
      clear();
    }

    if (!validation.valid) {
      await auditDenied(
        this.core,
        actor,
        organizationId,
        "ai.credential_configuration_failed",
        validation.category ?? "invalid",
        { provider: input.provider, credentialMode: input.credentialMode }
      );
      throw errorCategoryToAppError(
        validation.category ?? "unknown_error",
        "Credential validation failed."
      );
    }

    // Only ever store a secret that has just been validated. Nothing before this line ever
    // touches the SecretManager or the database with the raw secret.
    const { secretReference, maskedIdentifier } = await this.secretManager.store(
      organizationId,
      input.provider,
      input.secret
    );

    return this.runTransaction(async ({ core, ai }) => {
      const previous = await ai.findActiveProviderConfigForUpdate(organizationId, input.provider);
      const now = ai.now();

      if (previous) {
        await ai.updateProviderConfig({ ...previous, isActive: false, updatedAt: now });
      }

      const next: OrganizationAIProviderConfig = {
        id: ai.nextId("aipc"),
        organizationId,
        provider: input.provider,
        credentialMode: input.credentialMode,
        status: "configured",
        secretReference,
        maskedIdentifier,
        isActive: true,
        configuredByUserId: actorUserIdOrNull(actor),
        lastValidatedAt: now,
        lastValidationStatus: "valid",
        revokedAt: null,
        configuredAt: now,
        updatedAt: now
      };
      await ai.addProviderConfig(next);

      await auditAllowed(
        core,
        actor,
        organizationId,
        previous ? "ai.credential_rotated" : "ai.credential_configured",
        { provider: input.provider, credentialMode: input.credentialMode }
      );

      return toProviderConfigDTO(next);
    });
  }

  async revokeCredential(
    actor: Actor,
    organizationId: string,
    provider: string
  ): Promise<OrganizationAIProviderConfigDTO> {
    return this.runTransaction(async ({ core, ai }) => {
      const config = await ai.findActiveProviderConfigForUpdate(organizationId, provider);
      if (!config) {
        throw notFound(
          "ai_provider_config_not_found",
          "No active credential configured for this provider."
        );
      }

      if (config.credentialMode === "customer_managed") {
        await authorizeOrganizationActor(core, actor, organizationId, ["owner"]);
      } else {
        requirePlatformActor(actor);
      }

      const now = ai.now();
      const next: OrganizationAIProviderConfig = {
        ...config,
        status: "revoked",
        isActive: false,
        revokedAt: now,
        updatedAt: now
      };
      await ai.updateProviderConfig(next);
      await auditAllowed(core, actor, organizationId, "ai.credential_revoked", {
        provider,
        credentialMode: config.credentialMode
      });
      return toProviderConfigDTO(next);
    });
  }

  async testConnection(
    actor: Actor,
    organizationId: string,
    provider: string
  ): Promise<OrganizationAIProviderConfigDTO> {
    const config = await this.ai.findActiveProviderConfig(organizationId, provider);
    if (!config) {
      throw notFound(
        "ai_provider_config_not_found",
        "No active credential configured for this provider."
      );
    }

    if (config.credentialMode === "customer_managed") {
      await authorizeOrganizationActor(this.core, actor, organizationId, ["owner"]);
    } else if (config.credentialMode === "platform_managed") {
      requirePlatformActor(actor);
    } else {
      throw badRequest("ai_credential_mode_invalid", "Credential is disabled.");
    }

    const rateLimitKey = `${organizationId}:${provider}:${actorRateLimitKey(actor)}`;
    if (!this.rateLimiter.checkAndRecord("testConnection", rateLimitKey)) {
      await auditDenied(
        this.core,
        actor,
        organizationId,
        "ai.test_connection_rate_limited",
        "rate_limited",
        {
          provider
        }
      );
      throw errorCategoryToAppError("rate_limited", "test_connection rate limit exceeded.");
    }

    // "Chamada minima" only -- never any Candidate/Interview/CandidateApplication data.
    const secret = await this.secretManager.resolve(config.secretReference ?? "", organizationId);
    const adapter = this.resolveAdapter(provider);
    const { signal, clear } = createTimeoutController(this.testConnectionTimeoutMs);
    let validation;
    try {
      validation = await adapter.validateCredential({ provider, secret }, signal);
    } catch (error) {
      const category =
        error instanceof AIProviderError ? error.category : adapter.normalizeError(error);
      validation = { valid: false, category };
    } finally {
      clear();
    }

    return this.runTransaction(async ({ core, ai }) => {
      const now = ai.now();
      const next: OrganizationAIProviderConfig = {
        ...config,
        lastValidatedAt: now,
        lastValidationStatus: validation.valid
          ? "valid"
          : validationStatusForCategory(validation.category),
        status: validation.valid ? "configured" : "invalid",
        updatedAt: now
      };
      await ai.updateProviderConfig(next);
      await auditAllowed(
        core,
        actor,
        organizationId,
        validation.valid ? "ai.test_connection_succeeded" : "ai.test_connection_failed",
        { provider, credentialMode: config.credentialMode }
      );
      return toProviderConfigDTO(next);
    });
  }
}
