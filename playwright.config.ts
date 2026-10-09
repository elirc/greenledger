import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against an already-running, seeded dev server (orchestrated):
 *   pnpm db:seed && pnpm dev   →   pnpm test:e2e
 * BASE_URL overrides the target (the dev box sometimes lands on :3001).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 390, height: 844 }, // mobile-first, like the spec's users
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
});
