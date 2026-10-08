/**
 * Demo-farm seed — `pnpm db:seed` (tsx src/db/seed.ts).
 *
 * Wipe-and-reseed: every business + auth table is truncated first, so running
 * it twice yields the same data. Refuses to run in production.
 *
 * Env is loaded BEFORE any app module is imported: `@/db` builds its pool and
 * `@/lib/env` validates process.env at import time, and static imports are
 * hoisted — hence the dynamic import of the runner below.
 */
import { config as dotenvConfig } from "dotenv";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV is 'production'.");
  }
  dotenvConfig({ path: [".env.local", ".env"], quiet: true });

  const { runSeed } = await import("./seed/index");
  await runSeed();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] FAILED:", err);
    process.exit(1);
  });
