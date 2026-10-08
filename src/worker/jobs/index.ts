import type { Job } from "pg-boss";
import { JOBS, type JobName } from "../../lib/jobs";

/**
 * Job handlers. pg-boss v12 hands each handler a BATCH of jobs.
 * Placeholders for now — Phase 6 fills in the real scans and dispatch.
 */
export type JobHandler = (jobs: Job<Record<string, unknown>>[]) => Promise<void>;

function placeholder(name: JobName): JobHandler {
  return async (jobs) => {
    console.log(`[worker] ${name}: ${jobs.length} job(s) (placeholder handler)`);
  };
}

export const handlers: Record<JobName, JobHandler> = {
  [JOBS.expiryScan]: placeholder(JOBS.expiryScan),
  [JOBS.reorderScan]: placeholder(JOBS.reorderScan),
  [JOBS.bestBeforeScan]: placeholder(JOBS.bestBeforeScan),
  [JOBS.maintenanceScan]: placeholder(JOBS.maintenanceScan),
  [JOBS.billingCheck]: placeholder(JOBS.billingCheck),
  [JOBS.notifyDispatch]: placeholder(JOBS.notifyDispatch),
};

/** Daily cron schedules in Africa/Lagos (ARCHITECTURE §8). notify.dispatch is queue-only. */
export const SCHEDULES: Array<{ name: JobName; cron: string }> = [
  { name: JOBS.expiryScan, cron: "30 5 * * *" },
  { name: JOBS.reorderScan, cron: "35 5 * * *" },
  { name: JOBS.bestBeforeScan, cron: "40 5 * * *" },
  { name: JOBS.maintenanceScan, cron: "45 5 * * *" },
  { name: JOBS.billingCheck, cron: "0 6 * * *" },
];
