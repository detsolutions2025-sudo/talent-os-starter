import type { ErrorCategory, JsonObject } from "../types";
import type {
  AIProviderAdapter,
  AIProviderCredential,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderValidationResult
} from "./adapter";
import { AIProviderError } from "./adapter";

export type FakeProviderOutcome = "success" | ErrorCategory;

export type FakeProviderScenario = {
  outcome: FakeProviderOutcome;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number | null;
  structuredOutput?: unknown;
  capabilities?: JsonObject;
};

const defaultScenario: FakeProviderScenario = {
  outcome: "success",
  latencyMs: 0,
  inputTokens: 10,
  outputTokens: 5,
  estimatedCost: 0.0001,
  structuredOutput: { ok: true }
};

// Deterministic, in-process fake used for every test and for every environment in Phase 11 --
// no real provider is called, no SDK is installed (SPEC-014 "Desenvolvimento e Testes").
// Scenarios are supplied by the caller (never chosen randomly), so every outcome the SPEC
// requires (success, structured output, every error_category, latency, tokens, simulated
// technical cost) is independently reproducible in a test.
export class FakeProviderAdapter implements AIProviderAdapter {
  private scenario: FakeProviderScenario;
  private sequence: FakeProviderScenario[] | null = null;
  private callIndex = 0;
  // Test observability only: counts calls to execute(), so a test can assert the provider was
  // never called (e.g. when the Gateway correctly denies before step 14) or was called exactly
  // once (e.g. idempotent replay never calls it a second time).
  executeCallCount = 0;

  constructor(scenario: FakeProviderScenario = defaultScenario) {
    this.scenario = scenario;
  }

  // Lets a single adapter instance be reused across an execution's retry/fallback attempts
  // while still being reconfigured per attempt in a test. Clears any scenario sequence.
  setScenario(scenario: FakeProviderScenario) {
    this.scenario = scenario;
    this.sequence = null;
    this.callIndex = 0;
  }

  // For retry/fallback tests: the Nth call to execute()/validateCredential() gets
  // scenarios[N] (the last entry repeats once the sequence is exhausted).
  setScenarioSequence(scenarios: FakeProviderScenario[]) {
    this.sequence = scenarios;
    this.callIndex = 0;
  }

  private currentScenario(): FakeProviderScenario {
    if (this.sequence && this.sequence.length > 0) {
      const scenario = this.sequence[Math.min(this.callIndex, this.sequence.length - 1)];
      this.callIndex += 1;
      return scenario;
    }
    return this.scenario;
  }

  async validateCredential(
    _credential: AIProviderCredential,
    signal: AbortSignal
  ): Promise<AIProviderValidationResult> {
    const scenario = this.currentScenario();
    await this.wait(scenario, signal);
    if (scenario.outcome === "success") {
      return { valid: true };
    }
    return { valid: false, category: scenario.outcome };
  }

  async execute(
    _request: AIProviderRequest,
    _credential: AIProviderCredential,
    signal: AbortSignal
  ): Promise<AIProviderResponse> {
    this.executeCallCount += 1;
    const scenario = this.currentScenario();
    await this.wait(scenario, signal);

    if (scenario.outcome !== "success") {
      throw new AIProviderError(scenario.outcome);
    }

    return {
      structuredOutput: scenario.structuredOutput ?? defaultScenario.structuredOutput,
      inputTokens: scenario.inputTokens ?? defaultScenario.inputTokens ?? 0,
      outputTokens: scenario.outputTokens ?? defaultScenario.outputTokens ?? 0,
      estimatedCost:
        scenario.estimatedCost === undefined
          ? (defaultScenario.estimatedCost ?? null)
          : scenario.estimatedCost
    };
  }

  normalizeError(error: unknown): ErrorCategory {
    if (error instanceof AIProviderError) {
      return error.category;
    }
    return "unknown_error";
  }

  getCapabilities(): JsonObject {
    return this.scenario.capabilities ?? {};
  }

  // Simulates network/provider latency and honors external cancellation (the Gateway's own
  // per-execution timeout, via AbortController), so real "timeout" behavior can be exercised
  // end-to-end without a real network call.
  private wait(scenario: FakeProviderScenario, signal: AbortSignal): Promise<void> {
    const latencyMs = scenario.latencyMs ?? 0;

    if (signal.aborted) {
      return Promise.reject(new AIProviderError("timeout", "Aborted before start."));
    }

    if (latencyMs <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, latencyMs);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new AIProviderError("timeout", "Aborted while waiting."));
        },
        { once: true }
      );
    });
  }
}
