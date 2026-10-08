import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Integration + security suites hit the shared greenledger_test database.
 * ORCHESTRATOR-ONLY, run serially: fileParallelism is off on purpose.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/integration/**/*.test.ts",
      "tests/security/**/*.test.ts",
    ],
    fileParallelism: false,
    globalSetup: "./tests/setup/integration-global.ts",
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
