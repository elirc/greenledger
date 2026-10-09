import type { Job } from "pg-boss";
import { JOBS, type JobName } from "../../lib/jobs";
import { maintenanceScanHandler } from "./maintenance-scan";
import { expiryScanHandler } from "./expiry-scan";
import { reorderScanHandler } from "./reorder-scan";
import { bestBeforeScanHandler } from "./best-before-scan";
import { billingCheckHandler } from "./billing-check";
import { notifyDispatchHandler } from "./notify-dispatch";

/**
 * Job handlers. pg-boss v12 hands each handler a BATCH of jobs.
 * Placeholders for now — Phase 6 fills in the real scans and dispatch.
 */
export type JobHandler = (jobs: Job<Record<string, unknown>>[]) => Promise<void>;

export const handlers: Record<JobName, JobHandler> = {
  [JOBS.expiryScan]: expiryScanHandler,
  [JOBS.reorderScan]: reorderScanHandler,
  [JOBS.bestBeforeScan]: bestBeforeScanHandler,
  [JOBS.maintenanceScan]: maintenanceScanHandler,
  [JOBS.billingCheck]: billingCheckHandler,
  [JOBS.notifyDispatch]: notifyDispatchHandler,
};

/** Daily cron schedules in Africa/Lagos (ARCHITECTURE §8). notify.dispatch is queue-only. */
export const SCHEDULES: Array<{ name: JobName; cron: string }> = [
  { name: JOBS.expiryScan, cron: "30 5 * * *" },
  { name: JOBS.reorderScan, cron: "35 5 * * *" },
  { name: JOBS.bestBeforeScan, cron: "40 5 * * *" },
  { name: JOBS.maintenanceScan, cron: "45 5 * * *" },
  { name: JOBS.billingCheck, cron: "0 6 * * *" },
];
