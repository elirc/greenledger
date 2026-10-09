/**
 * Pure nursery helpers — shared by server actions and client components.
 * No db imports here.
 */

export interface NurseryCounts {
  seedsSown: number;
  germinated: number;
  ready: number;
  transplanted: number;
  discarded: number;
}

/**
 * Seedlings still in the batch. Mirrors `transplantToCycle`
 * (src/modules/cycles/transplant.ts): before germination is counted the
 * seeds sown are the basis.
 */
export function availableSeedlings(b: NurseryCounts): number {
  return Math.max(
    0,
    (b.germinated || b.seedsSown) - b.transplanted - b.discarded,
  );
}

/** Germination rate in percent (1 dp), or null until germination is logged. */
export function germinationRatePct(b: {
  seedsSown: number;
  germinated: number;
}): number | null {
  if (b.germinated <= 0 || b.seedsSown <= 0) return null;
  return Math.round((b.germinated / b.seedsSown) * 1000) / 10;
}

/**
 * Validates a counts update against the stored row. Returns a user-facing
 * error message, or null when the update is allowed. Counts only ever go up.
 */
export function checkCountsUpdate(
  current: NurseryCounts,
  next: { germinated: number; ready: number },
): string | null {
  if (next.germinated < current.germinated) {
    return `Germinated can't go down (currently ${current.germinated}). Use Discard for losses.`;
  }
  if (next.ready < current.ready) {
    return `Ready can't go down (currently ${current.ready}). Use Discard for losses.`;
  }
  if (next.germinated > current.seedsSown) {
    return `Germinated can't be more than seeds sown (${current.seedsSown}).`;
  }
  if (next.ready > next.germinated) {
    return "Ready can't be more than germinated.";
  }
  const used = current.transplanted + current.discarded;
  if (next.germinated > 0 && next.germinated < used) {
    return `Germinated can't be less than seedlings already transplanted or discarded (${used}).`;
  }
  if (
    next.germinated === current.germinated &&
    next.ready === current.ready
  ) {
    return "Counts are unchanged.";
  }
  return null;
}

/**
 * Status after counters change: a batch with nothing left is finished —
 * "transplanted" if any seedlings went to a greenhouse, else "discarded".
 */
export function statusWhenEmpty(
  b: NurseryCounts,
): "open" | "transplanted" | "discarded" {
  if (availableSeedlings(b) > 0) return "open";
  return b.transplanted > 0 ? "transplanted" : "discarded";
}
