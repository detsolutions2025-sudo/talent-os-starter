import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    fileParallelism: false,
    // The default "forks" pool has a known intermittent bug on this Vitest/Node combination
    // (a forked child process stops polling for IPC messages and gets killed, surfacing here
    // as an opaque "Worker exited unexpectedly" with no application stack trace — see
    // vitest-dev/vitest#9762 and #8861). "threads" runs the same fileParallelism:false suite
    // inside worker_threads instead of child_process forks and does not hit that bug.
    pool: "threads",
    testTimeout: 60000,
    hookTimeout: 60000
  }
});
