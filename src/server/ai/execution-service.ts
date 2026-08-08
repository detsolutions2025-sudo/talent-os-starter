import { conflict } from "../core/errors";
import type { AIRepository } from "./repository";
import type { AITransactionRunner } from "./transaction";
import type { AIExecution, CredentialMode, ErrorCategory } from "./types";

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export type BeginExecutionParams = {
  organizationId: string;
  featureKey: string;
  provider: string;
  modelKey: string;
  promptKey: string;
  promptVersion: number;
  credentialMode: CredentialMode;
  idempotencyKey: string | null;
  correlationId: string;
  requestedByUserId: string | null;
};

export type ExecutionUsageResult = {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number | null;
};

// AI Execution lifecycle (ADR-0019 "AI Execution"). There is exactly one row per logical
// AIGateway.execute() call -- retries against the same route and fallback attempts against a
// different route update this same row's `provider`/`model` fields as the attempt changes,
// they never create additional rows for the same logical call. Every individual attempt is
// still separately audited (`ai.routing_selected`) by the Gateway, so the full attempt history
// is never lost even though only the outcome of the last attempt is reflected in this row.
export class AIExecutionService {
  constructor(
    private readonly ai: AIRepository,
    private readonly runTransaction: AITransactionRunner
  ) {}

  async findActiveByIdempotencyKey(
    organizationId: string,
    featureKey: string,
    idempotencyKey: string | null
  ): Promise<AIExecution | null> {
    if (!idempotencyKey) {
      return null;
    }
    return this.ai.findActiveExecutionByIdempotencyKey(organizationId, featureKey, idempotencyKey);
  }

  async begin(params: BeginExecutionParams): Promise<AIExecution> {
    return this.runTransaction(async ({ ai }) => {
      const now = ai.now();
      const execution: AIExecution = {
        id: ai.nextId("aiex"),
        organizationId: params.organizationId,
        featureKey: params.featureKey,
        provider: params.provider,
        modelKey: params.modelKey,
        promptKey: params.promptKey,
        promptVersion: params.promptVersion,
        credentialMode: params.credentialMode,
        status: "pending",
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        requestedByUserId: params.requestedByUserId,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        inputTokens: null,
        outputTokens: null,
        estimatedCost: null,
        errorCategory: null,
        createdAt: now,
        updatedAt: now
      };

      try {
        await ai.addExecution(execution);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict(
            "ai_execution_idempotency_conflict",
            "Another execution with this idempotency key is already in progress."
          );
        }
        throw error;
      }

      return execution;
    });
  }

  // Called once per attempt (initial attempt, same-route retry, or fallback to a different
  // route). `startedAt` is set once, on the very first attempt, and never moves afterward.
  async recordAttempt(
    organizationId: string,
    executionId: string,
    provider: string,
    modelKey: string,
    credentialMode: CredentialMode
  ): Promise<AIExecution> {
    return this.runTransaction(async ({ ai }) => {
      const execution = await this.requireExecution(ai, organizationId, executionId);
      const now = ai.now();
      const next: AIExecution = {
        ...execution,
        provider,
        modelKey,
        credentialMode,
        status: "running",
        startedAt: execution.startedAt ?? now,
        updatedAt: now
      };
      await ai.updateExecution(next);
      return next;
    });
  }

  async complete(
    organizationId: string,
    executionId: string,
    usage: ExecutionUsageResult
  ): Promise<AIExecution> {
    return this.runTransaction(async ({ ai }) => {
      const execution = await this.requireExecution(ai, organizationId, executionId);
      const now = ai.now();
      const next: AIExecution = {
        ...execution,
        status: "succeeded",
        finishedAt: now,
        durationMs: this.durationSince(execution.startedAt, now),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCost: usage.estimatedCost,
        errorCategory: null,
        updatedAt: now
      };
      await ai.updateExecution(next);
      return next;
    });
  }

  async fail(
    organizationId: string,
    executionId: string,
    errorCategory: ErrorCategory
  ): Promise<AIExecution> {
    return this.runTransaction(async ({ ai }) => {
      const execution = await this.requireExecution(ai, organizationId, executionId);
      const now = ai.now();
      const next: AIExecution = {
        ...execution,
        status: "failed",
        finishedAt: now,
        durationMs: this.durationSince(execution.startedAt, now),
        errorCategory,
        updatedAt: now
      };
      await ai.updateExecution(next);
      return next;
    });
  }

  async cancel(organizationId: string, executionId: string): Promise<AIExecution> {
    return this.runTransaction(async ({ ai }) => {
      const execution = await this.requireExecution(ai, organizationId, executionId);
      const now = ai.now();
      const next: AIExecution = {
        ...execution,
        status: "cancelled",
        finishedAt: now,
        durationMs: this.durationSince(execution.startedAt, now),
        updatedAt: now
      };
      await ai.updateExecution(next);
      return next;
    });
  }

  private durationSince(startedAt: string | null, now: string): number {
    const startMs = startedAt ? new Date(startedAt).getTime() : new Date(now).getTime();
    return Math.max(0, new Date(now).getTime() - startMs);
  }

  private async requireExecution(ai: AIRepository, organizationId: string, executionId: string) {
    const execution = await ai.findExecutionById(organizationId, executionId);
    if (!execution) {
      throw new Error(`ai_execution_not_found:${executionId}`);
    }
    return execution;
  }
}
