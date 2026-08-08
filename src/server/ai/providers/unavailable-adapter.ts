import type { ErrorCategory, JsonObject } from "../types";
import type { AIProviderAdapter, AIProviderResponse, AIProviderValidationResult } from "./adapter";
import { AIProviderError } from "./adapter";

// Used only when APP_ENV=production and no real Provider Adapter has been wired yet for a
// given provider (see src/server/index.ts). It exists for the same reason as
// UnavailableSecretManager: the production bootstrap must never fall back to
// FakeProviderAdapter -- which always deterministically "succeeds" -- and must never crash the
// whole server either. Every call fails immediately and safely with a normalized
// configuration_error, so a credential is never "validated" by a fake, and an execution never
// reaches a fake success.
export class UnavailableProviderAdapter implements AIProviderAdapter {
  // None of these implementations need their parameters -- every call fails the same way
  // regardless of what credential/request/error was passed in, so the parameters are simply
  // omitted (TypeScript structurally allows an implementation with fewer parameters than the
  // interface it satisfies) rather than declared and left unused.
  async validateCredential(): Promise<AIProviderValidationResult> {
    return { valid: false, category: "configuration_error" };
  }

  async execute(): Promise<AIProviderResponse> {
    throw new AIProviderError("configuration_error", "ai_provider_adapter_unavailable");
  }

  normalizeError(): ErrorCategory {
    return "configuration_error";
  }

  getCapabilities(): JsonObject {
    return {};
  }
}
