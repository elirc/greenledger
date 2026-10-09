import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "../../db";
import { inventoryMovements, items, notifications } from "../../db/schema";
import { notifyRole } from "../../lib/notify";

/**
 * scan.reorder (ARCHITECTURE §8, daily 05:35 Lagos).
 *
 * Active items with a reorder level (> 0) whose on-hand (Σ movements across
 * all batches/stores) is at or below it (DATA-MODEL §5 reorder flag) →
 * notifyRole(owner + manager + storekeeper), dedup `reorder:<itemId>`.
 *
 * "While below": the key holds for as long as the item stays low, so the
 * daily run doesn't spam. Once an item is back above its level, the scan
 * releases the key on its old alerts (dedup_key → NULL) so the next dip
 * raises a fresh alert. Read state and history of the old rows are kept.
 *
 * Boundary (DECISIONS §16): db + pure libs only.
 */

export const reorderDedupKey = (itemId: string) => `reorder:${itemId}`;

/** numeric(14,3) text → trimmed display ("12.500" → "12.5"). */
const fmtQty = (q: string) => String(Number(q));

export interface ReorderScanResult {
  itemsBelow: number;
  notifications: number;
  released: number;
}

export async function runReorderScan(): Promise<ReorderScanResult> {
  const onHand = sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`;
  const rows = await db
    .select({
      itemId: items.id,
      organisationId: items.organisationId,
      name: items.name,
      baseUnit: items.baseUnit,
      reorderLevel: items.reorderLevel,
      onHand,
      below: sql<boolean>`coalesce(sum(${inventoryMovements.quantity}), 0) <= ${items.reorderLevel}`,
    })
    .from(items)
    .leftJoin(
      inventoryMovements,
      and(
        eq(inventoryMovements.itemId, items.id),
        eq(inventoryMovements.organisationId, items.organisationId),
      ),
    )
    .where(and(eq(items.isActive, true), gt(items.reorderLevel, "0")))
    .groupBy(items.id, items.organisationId, items.name, items.baseUnit, items.reorderLevel)
    .orderBy(asc(items.organisationId), asc(items.name));

  const result: ReorderScanResult = { itemsBelow: 0, notifications: 0, released: 0 };

  const byOrg = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byOrg.get(r.organisationId) ?? [];
    list.push(r);
    byOrg.set(r.organisationId, list);
  }

  for (const [orgId, list] of byOrg) {
    try {
      await db.transaction(async (tx) => {
        const recovered = list.filter((r) => !r.below).map((r) => reorderDedupKey(r.itemId));
        if (recovered.length > 0) {
          const released = await tx
            .update(notifications)
            .set({ dedupKey: null })
            .where(
              and(
                eq(notifications.organisationId, orgId),
                inArray(notifications.dedupKey, recovered),
              ),
            )
            .returning({ id: notifications.id });
          result.released += released.length;
        }

        for (const it of list) {
          if (!it.below) continue;
          result.itemsBelow += 1;
          result.notifications += await notifyRole(
            tx,
            orgId,
            ["owner", "manager", "storekeeper"],
            {
              type: "low_stock",
              title: `Low stock: ${it.name}`,
              body: `On hand ${fmtQty(it.onHand)} ${it.baseUnit} — at or below the reorder level of ${fmtQty(it.reorderLevel)} ${it.baseUnit}.`,
              entityType: "item",
              entityId: it.itemId,
              dedupKey: reorderDedupKey(it.itemId),
            },
          );
        }
      });
    } catch (err) {
      console.error(`[worker] scan.reorder failed for org ${orgId}:`, err);
    }
  }
  return result;
}

export async function reorderScanHandler(jobs: Job<Record<string, unknown>>[]): Promise<void> {
  const res = await runReorderScan();
  console.log(
    `[worker] scan.reorder: ${jobs.length} job(s) — ${res.itemsBelow} item(s) below reorder level, ${res.notifications} notification(s), ${res.released} recovered alert key(s) released`,
  );
}
