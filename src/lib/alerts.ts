/** Alert thresholds (days) — single source for jobs and UI badges. */
export const EXPIRY_WARN_DAYS = [60, 30] as const;
export const BEST_BEFORE_WARN_DAYS = 2;
export const MAINTENANCE_WARN_DAYS = 7;
export const TRIAL_WARN_DAYS = 3;

/** notifications.type values (DATA-MODEL §4.11). */
export type NotificationType =
  | "low_stock"
  | "expiry_60"
  | "expiry_30"
  | "expired"
  | "produce_best_before"
  | "maintenance_due"
  | "task_due"
  | "trial_ending"
  | "payment_failed"
  | "subscription_read_only";
