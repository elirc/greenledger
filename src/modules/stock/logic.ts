/**
 * Pure FEFO (first-expiry-first-out) selection logic. No DB access — unit
 * tested in tests/unit/fefo.test.ts. The transactional wrapper lives in
 * movements.ts.
 */

export interface FefoCandidate {
  id: string;
  /** yyyy-MM-dd Lagos calendar date, or null (no expiry). */
  expiryDate: string | null;
  receivedAt: Date;
  onHand: number;
}

export interface FefoOptions {
  /** Include batches whose expiry is before `today`. Default false. */
  includeExpired?: boolean;
  /** yyyy-MM-dd Lagos date used to judge expiry. */
  today: string;
}

export function isExpired(
  expiryDate: string | null,
  today: string,
): boolean {
  return expiryDate !== null && expiryDate < today;
}

/**
 * Spec rule: issue earliest-expiry first. NULL expiry sorts last; ties break
 * on oldest receipt. Zero-stock batches are never candidates; expired
 * batches only with an explicit override.
 */
export function orderFefo(
  candidates: FefoCandidate[],
  opts: FefoOptions,
): FefoCandidate[] {
  return candidates
    .filter((c) => c.onHand > 0)
    .filter((c) => opts.includeExpired || !isExpired(c.expiryDate, opts.today))
    .sort((a, b) => {
      if (a.expiryDate === null && b.expiryDate === null) {
        return a.receivedAt.getTime() - b.receivedAt.getTime();
      }
      if (a.expiryDate === null) return 1;
      if (b.expiryDate === null) return -1;
      if (a.expiryDate !== b.expiryDate) {
        return a.expiryDate < b.expiryDate ? -1 : 1;
      }
      return a.receivedAt.getTime() - b.receivedAt.getTime();
    });
}

export interface FefoAllocation {
  batchId: string;
  quantity: number;
}

/**
 * Greedy split of `quantity` across FEFO-ordered batches.
 * `shortfall` > 0 means the store cannot cover the request.
 */
export function allocateFefo(
  candidates: FefoCandidate[],
  quantity: number,
  opts: FefoOptions,
): { allocations: FefoAllocation[]; shortfall: number } {
  const ordered = orderFefo(candidates, opts);
  const allocations: FefoAllocation[] = [];
  let remaining = roundQty(quantity);
  for (const c of ordered) {
    if (remaining <= 0) break;
    const take = roundQty(Math.min(c.onHand, remaining));
    if (take <= 0) continue;
    allocations.push({ batchId: c.id, quantity: take });
    remaining = roundQty(remaining - take);
  }
  return { allocations, shortfall: remaining > 0 ? remaining : 0 };
}

/** Quantities live in numeric(14,3) — keep js math on the same grid. */
export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}
