// Every external call the AI infrastructure makes (through a Provider Adapter) is bounded by
// this. There is no code path that calls an adapter without first creating one of these
// (SPEC-014 "Timeout": "nunca existe chamada externa sem timeout definido").
export function createTimeoutController(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

export const DEFAULT_EXECUTION_TIMEOUT_MS = 30_000;
export const DEFAULT_TEST_CONNECTION_TIMEOUT_MS = 10_000;
