import { execSync } from "node:child_process";
import { config as dotenvConfig } from "dotenv";

/**
 * Runs once (main process) before integration/security suites:
 * points DATABASE_URL at the test DB and pushes the current schema.
 */
export default async function globalSetup(): Promise<void> {
  dotenvConfig({ path: [".env.local", ".env"], quiet: true });
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST is not set (expected in .env.local)");
  }
  if (!/test/i.test(testUrl)) {
    throw new Error(
      `Refusing to run integration tests: DATABASE_URL_TEST does not look like a test DB: ${testUrl}`,
    );
  }
  process.env.DATABASE_URL = testUrl;
  execSync("pnpm exec drizzle-kit push --force", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
