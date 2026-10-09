import { and, eq, sql } from "drizzle-orm";
import { notifications } from "../schema";
import { runBestBeforeScan } from "../../worker/jobs/best-before-scan";
import { runBillingCheck } from "../../worker/jobs/billing-check";
import { runExpiryScan } from "../../worker/jobs/expiry-scan";
import { runReorderScan } from "../../worker/jobs/reorder-scan";
import { lagosDateOf } from "../../lib/dates";
import { bump, type SeedStep } from "./state";

/**
 * Phase 6 seed: the in-app notification feed.
 *
 * Runs the SAME daily scans the worker runs (expiry, reorder, best-before,
 * billing check) against the seeded farm, so the bell shows realistic alerts
 * with the real dedup keys — the first real worker run afterwards is a no-op
 * for these. The ≤60-day expiry heads-ups are then marked read (older news),
 * leaving the 30-day / expired / low-stock / best-before alerts unread.
 *
 * No urgent dispatch here: seeding never sends SMS/email.
 */
export const notificationsStep: SeedStep = {
  name: "notifications (daily scans → bell feed)",
  async run(state) {
    const today = lagosDateOf(state.now);
    await runExpiryScan(today);
    await runReorderScan();
    await runBestBeforeScan(today);
    await runBillingCheck(state.now);

    await state.db
      .update(notifications)
      .set({ readAt: state.now })
      .where(
        and(
          eq(notifications.organisationId, state.orgId),
          eq(notifications.type, "expiry_60"),
        ),
      );

    const [{ total, unread }] = await state.db
      .select({
        total: sql<number>`count(*)::int`,
        unread: sql<number>`(count(*) filter (where ${notifications.readAt} is null))::int`,
      })
      .from(notifications)
      .where(eq(notifications.organisationId, state.orgId));
    bump(state, "notifications", total);
    bump(state, "notifications (unread)", unread);
  },
};
