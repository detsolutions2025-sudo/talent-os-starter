import "@testing-library/jest-dom/vitest";

// Diagnostic safety net for the whole suite: by default an unhandled promise rejection or an
// uncaught exception (e.g. a stray "error" event on some object with no listener) terminates the
// Node process outright, which Vitest can only report as an opaque "Worker exited unexpectedly" —
// no file, no test name, no stack. Logging instead of dying keeps the suite's outcome tied to
// actual test assertions and gives a real stack trace to investigate if this ever fires.
process.on("unhandledRejection", (reason) => {
  console.error("[tests/setup] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[tests/setup] Uncaught exception:", error);
});
