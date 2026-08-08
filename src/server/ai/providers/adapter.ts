import type { ErrorCategory, JsonObject } from "../types";

// Conceptual contract (ADR-0019 "Contrato do Provider Adapter"). No code signature is fixed
// by the ADR/SPEC beyond this shape; this is Phase 11's concrete TypeScript expression of it.
// The AIGateway never imports a provider SDK directly -- it only ever talks to this interface.

export type AIProviderCredential = {
  provider: string;
  secret: string;
};

export type AIProviderRequest = {
  provider: string;
  providerModelIdentifier: string;
  systemInstructions: string;
  data: JsonObject;
  outputSchema: JsonObject;
  timeoutMs: number;
};

export type AIProviderResponse = {
  structuredOutput: unknown;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number | null;
};

export type AIProviderValidationResult = {
  valid: boolean;
  category?: ErrorCategory;
};

// Thrown by an adapter's execute()/validateCredential() to report an already-normalized
// category. Any other thrown value is passed through normalizeError() by the caller (the
// Gateway or AIProviderConfigService) to guarantee a category always comes out -- an adapter
// is never allowed to let a raw, unnormalized error escape to a caller.
export class AIProviderError extends Error {
  constructor(
    public readonly category: ErrorCategory,
    message: string = category
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export interface AIProviderAdapter {
  validateCredential(
    credential: AIProviderCredential,
    signal: AbortSignal
  ): Promise<AIProviderValidationResult>;
  execute(
    request: AIProviderRequest,
    credential: AIProviderCredential,
    signal: AbortSignal
  ): Promise<AIProviderResponse>;
  normalizeError(error: unknown): ErrorCategory;
  getCapabilities(): JsonObject;
}
