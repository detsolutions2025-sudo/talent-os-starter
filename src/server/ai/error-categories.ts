import { AppError } from "../core/errors";
import type { ErrorCategory } from "./types";

// The exhaustive, canonical list (SPEC-014 "AI Execution"). Nothing else is ever persisted to
// ai_executions.error_category or returned to a caller.
export const ERROR_CATEGORIES: readonly ErrorCategory[] = [
  "authentication_error",
  "quota_exceeded",
  "rate_limited",
  "timeout",
  "provider_unavailable",
  "network_error",
  "invalid_response",
  "configuration_error",
  "policy_denied",
  "content_blocked",
  "unknown_error"
];

export function isErrorCategory(value: unknown): value is ErrorCategory {
  return typeof value === "string" && (ERROR_CATEGORIES as readonly string[]).includes(value);
}

// Error categories that a retry is allowed to attempt again on the same route
// (SPEC-014 "Retry"). Never includes categories caused by policy/configuration/credential/
// content decisions -- those are never transitory.
const retryableCategories = new Set<ErrorCategory>([
  "timeout",
  "provider_unavailable",
  "network_error",
  "rate_limited"
]);

export function isRetryable(category: ErrorCategory): boolean {
  return retryableCategories.has(category);
}

// Causes that must never trigger fallback to another route, even when both fallback
// authorizations are granted (SPEC-014 "Fallback" -- "Fallback nunca ocorre automaticamente
// quando a causa da falha for...").
const fallbackIneligibleCategories = new Set<ErrorCategory>([
  "authentication_error",
  "configuration_error",
  "policy_denied",
  "content_blocked"
]);

export function isFallbackEligible(category: ErrorCategory): boolean {
  return !fallbackIneligibleCategories.has(category);
}

// Maps a normalized category to an HTTP status for the API layer. Never derived from a raw
// provider error/status code.
export function errorCategoryToAppError(category: ErrorCategory, message: string): AppError {
  switch (category) {
    case "policy_denied":
      return new AppError(403, `ai_${category}`, message);
    case "authentication_error":
      return new AppError(502, `ai_${category}`, message);
    case "rate_limited":
      return new AppError(429, `ai_${category}`, message);
    case "timeout":
      return new AppError(504, `ai_${category}`, message);
    case "provider_unavailable":
    case "network_error":
      return new AppError(503, `ai_${category}`, message);
    case "content_blocked":
      return new AppError(422, `ai_${category}`, message);
    case "configuration_error":
    case "quota_exceeded":
    case "invalid_response":
    case "unknown_error":
    default:
      return new AppError(502, `ai_${category}`, message);
  }
}
