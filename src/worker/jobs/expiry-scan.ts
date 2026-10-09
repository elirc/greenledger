import { and, asc, eq, isNotNull, lte, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "../../db";
import { inventoryMovements, itemBatches, items } from "../../db/schema";
import { EXPIRY_WARN_DAYS } from "../../lib/alerts";
import { addDays, formatLagosDate, todayLagos } from "../../lib/dates";
import { notifyRole } from "../../lib/notify";
import { enqueueDispatch, type DispatchPayload } from "./notify-dispatch";

/**
 * scan.expiry (ARCHITECTURE §8, daily 05:30 Lagos).
 *
 * Batches WITH STOCK (Σ movements > 0, DATA-MODEL §5) whose expiry_date is
 * past, within 30 days, or within 60 days → notifyRole(owner + manager +
 * storekeeper), dedup `exp:<batchId>:<bucket>` (bucket 60 | 30 | expired) —
 * moving into a tighter bucket raises a fresh alert, re-runs are no-ops.
 * Newly created `expired` alerts are urgent → notify.dispatch.
 *
 * Boundary (DECISIONS §16): db + pure libs only.
 */

export type ExpiryBucket = "60" | "30" | "expired";

export const expiryDedupKey = (batchId: string, bucket: ExpiryBucket) =>
  `exp:${batchId}:${bucket}`;

/** yyyy-MM-dd (Lagos calendar date) → "dd MMM yyyy". */
const fmtDate = (d: string) => formatLagosDate(`${d}T12:00:00Z`);

export function expiryBucket(expiryDate: string, today: string): ExpiryBucket | null {
  const [warn60, warn30] = EXPIRY_WARN_DAYS;
  if (expiryDate < today) return "expired";
  if (expiryDate <= addDays(today, warn30)) return "30";
  if (expiryDate <= addDays(today, warn60)) return "60";
  return null;
}

export interface ExpiryScanResult {
  batches: number;
  notifications: number;
  dispatch: DispatchPayload[];
}

export async function runExpiryScan(today: string = todayLagos()): Promise<ExpiryScanResult> {
  const horizon = addDays(today, Math.max(...EXPIRY_WARN_DAYS));
  const onHand = sql<string>`sum(${inventoryMovements.quantity})`;
  const rows = await db
    .select({
      batchId: itemBatches.id,
      organisationId: itemBatches.organisationId,
      batchNumber: itemBatches.batchNumber,
      expiryDate: itemBatches.expiryDate,
      itemName: items.name,
      onHand,
    })
    .from(itemBatches)
    .innerJoin(
      items,
      and(eq(items.id, itemBatches.itemId), eq(items.organisationId, itemBatches.organisationId)),
    )
    .innerJoin(
      inventoryMovements,
      and(
        eq(inventoryMovements.itemBatchId, itemBatches.id),
        eq(inventoryMovements.organisationId, itemBatches.organisationId),
      ),
    )
    .where(and(isNotNull(itemBatches.expiryDate), lte(itemBatches.expiryDate, horizon)))
    .groupBy(
      itemBatches.id,
      itemBatches.organisationId,
      itemBatches.batchNumber,
      itemBatches.expiryDate,
      items.name,
    )
    .having(sql`sum(${inventoryMovements.quantity}) > 0`)
    .orderBy(asc(itemBatches.organisationId), asc(itemBatches.expiryDate));

  const result: ExpiryScanResult = { batches: rows.length, notifications: 0, dispatch: [] };

  const byOrg = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byOrg.get(r.organisationId) ?? [];
    list.push(r);
    byOrg.set(r.organisationId, list);
  }

  for (const [orgId, list] of byOrg) {
    const orgDispatch: DispatchPayload[] = [];
    try {
      await db.transaction(async (tx) => {
        for (const b of list) {
          if (!b.expiryDate) continue;
          const bucket = expiryBucket(b.expiryDate, today);
          if (!bucket) continue;
          const dedupKey = expiryDedupKey(b.batchId, bucket);
          const title =
            bucket === "expired"
              ? `Expired: ${b.itemName}`
              : `Expires within ${bucket} days: ${b.itemName}`;
          const body =
            bucket === "expired"
              ? `Batch ${b.batchNumber} expired ${fmtDate(b.expiryDate)} and still has stock. It cannot be issued without a manager override.`
              : `Batch ${b.batchNumber} expires ${fmtDate(b.expiryDate)}. Use it first.`;
          const created = await notifyRole(tx, orgId, ["owner", "manager", "storekeeper"], {
            type: bucket === "expired" ? "expired" : bucket === "30" ? "expiry_30" : "expiry_60",
            title,
            body,
            entityType: "item_batch",
            entityId: b.batchId,
            dedupKey,
          });
          result.notifications += created;
          if (created > 0 && bucket === "expired") {
            orgDispatch.push({ orgId, dedupKey });
          }
        }
      });
      // Only after commit: a rolled-back org must not dispatch.
      result.dispatch.push(...orgDispatch);
    } catch (err) {
      console.error(`[worker] scan.expiry failed for org ${orgId}:`, err);
    }
  }
  return result;
}

export async function expiryScanHandler(jobs: Job<Record<string, unknown>>[]): Promise<void> {
  const res = await runExpiryScan();
  await enqueueDispatch(res.dispatch);
  console.log(
    `[worker] scan.expiry: ${jobs.length} job(s) — ${res.batches} batch(es) in window, ${res.notifications} notification(s), ${res.dispatch.length} urgent dispatch(es)`,
  );
}
