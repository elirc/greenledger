import { PgBoss } from "pg-boss";
import { env } from "./env";

/** Job names — web enqueues, the worker process handles (ARCHITECTURE §8). */
export const JOBS = {
  expiryScan: "scan.expiry",
  reorderScan: "scan.reorder",
  bestBeforeScan: "scan.bestBefore",
  maintenanceScan: "scan.maintenance",
  billingCheck: "billing.check",
  notifyDispatch: "notify.dispatch",
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

const globalForBoss = globalThis as unknown as {
  boss?: PgBoss;
  bossStarted?: Promise<PgBoss>;
  bossQueues?: Set<string>;
};

/** Lazy singleton; safe in both the Next.js server and the worker process. */
export async function getBoss(): Promise<PgBoss> {
  if (!globalForBoss.bossStarted) {
    const boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: env.PGBOSS_SCHEMA,
    });
    boss.on("error", (err: Error) => console.error("[pg-boss]", err));
    globalForBoss.boss = boss;
    globalForBoss.bossStarted = boss.start();
  }
  return globalForBoss.bossStarted;
}

/** Enqueue a job, creating its queue on first use (createQueue is an upsert). */
export async function sendJob(
  name: JobName,
  data?: Record<string, unknown>,
): Promise<void> {
  const boss = await getBoss();
  globalForBoss.bossQueues ??= new Set();
  if (!globalForBoss.bossQueues.has(name)) {
    await boss.createQueue(name);
    globalForBoss.bossQueues.add(name);
  }
  await boss.send(name, data ?? {});
}
