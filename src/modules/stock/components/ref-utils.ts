import { todayLagos } from "@/lib/dates";
import { allocateFefo, isExpired, roundQty, type FefoCandidate } from "../logic";
import type { RefBatch, RefItem } from "../queries";

/**
 * Client-side helpers over the StockFormRefs snapshot. FEFO previews use the
 * same pure logic the server re-runs under lock — the server always wins.
 */

export function batchOnHandIn(batch: RefBatch, storeId: string): number {
  return batch.stock[storeId] ?? 0;
}

export function itemOnHandIn(
  batches: RefBatch[],
  itemId: string,
  storeId: string,
): number {
  return roundQty(
    batches
      .filter((b) => b.itemId === itemId)
      .reduce((sum, b) => sum + batchOnHandIn(b, storeId), 0),
  );
}

export function itemOnHandTotal(batches: RefBatch[], itemId: string): number {
  return roundQty(
    batches
      .filter((b) => b.itemId === itemId)
      .reduce(
        (sum, b) => sum + Object.values(b.stock).reduce((a, q) => a + q, 0),
        0,
      ),
  );
}

/** Batches of an item with stock in a store, earliest expiry first. */
export function batchesInStore(
  batches: RefBatch[],
  itemId: string,
  storeId: string,
): RefBatch[] {
  return batches.filter(
    (b) => b.itemId === itemId && batchOnHandIn(b, storeId) > 0,
  );
}

export function isBatchExpired(batch: Pick<RefBatch, "expiryDate">): boolean {
  return isExpired(batch.expiryDate, todayLagos());
}

export interface FefoPreview {
  allocations: { batch: RefBatch; quantity: number }[];
  shortfall: number;
  /** Expired stock exists that FEFO skipped. */
  expiredSkipped: number;
}

export function fefoPreview(
  batches: RefBatch[],
  itemId: string,
  storeId: string,
  quantity: number,
  includeExpired = false,
): FefoPreview {
  const inStore = batchesInStore(batches, itemId, storeId);
  const byId = new Map(inStore.map((b) => [b.id, b]));
  const today = todayLagos();
  const candidates: FefoCandidate[] = inStore.map((b) => ({
    id: b.id,
    expiryDate: b.expiryDate,
    receivedAt: new Date(b.receivedAt),
    onHand: batchOnHandIn(b, storeId),
  }));
  const plan = allocateFefo(candidates, quantity, { includeExpired, today });
  const expiredSkipped = includeExpired
    ? 0
    : roundQty(
        candidates
          .filter((c) => isExpired(c.expiryDate, today))
          .reduce((a, c) => a + c.onHand, 0),
      );
  return {
    allocations: plan.allocations.map((a) => ({
      batch: byId.get(a.batchId)!,
      quantity: a.quantity,
    })),
    shortfall: plan.shortfall,
    expiredSkipped,
  };
}

export function unitOf(items: RefItem[], itemId: string | undefined) {
  return items.find((i) => i.id === itemId)?.baseUnit;
}
