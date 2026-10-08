// Load env files BEFORE any module that validates process.env.
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { env } = await import("../lib/env");
  const { PgBoss } = await import("pg-boss");
  const { JOBS } = await import("../lib/jobs");
  const { handlers, SCHEDULES } = await import("./jobs");

  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: env.PGBOSS_SCHEMA,
  });
  boss.on("error", (err: Error) =>
    console.error("[worker] pg-boss error:", err),
  );

  await boss.start();

  for (const name of Object.values(JOBS)) {
    await boss.createQueue(name);
    await boss.work(name, handlers[name]);
  }
  for (const { name, cron } of SCHEDULES) {
    await boss.schedule(name, cron, {}, { tz: "Africa/Lagos" });
  }

  console.log(
    `[worker] started — queues: ${Object.values(JOBS).join(", ")} (schema ${env.PGBOSS_SCHEMA})`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, stopping...`);
    try {
      await boss.stop({ graceful: true, timeout: 15_000 });
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
