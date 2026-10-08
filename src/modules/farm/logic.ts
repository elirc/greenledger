/** Pure setup-wizard progress rules (no DB) — importable by server and client. */

export interface SetupProgressInput {
  site: { address: string | null } | null;
  greenhouseCount: number;
  storeCount: number;
  varietyCount: number;
}

/**
 * Progress is implicit in the data: a step is complete when the data it
 * creates exists. Onboarding already creates a site and an Input Store, so
 * step 1 also needs an address or later progress, and step 3 needs more than
 * the default store or later progress. Step 5 is locked until Phase 2 and
 * never blocks; step 6 (Done) is never "complete".
 */
export function stepCompletion(d: SetupProgressInput): Record<number, boolean> {
  const varietiesDone = d.varietyCount > 0;
  return {
    1: d.site !== null && (Boolean(d.site.address) || d.greenhouseCount > 0),
    2: d.greenhouseCount > 0,
    3: d.storeCount > 1 || (d.storeCount > 0 && varietiesDone),
    4: varietiesDone,
    5: true,
    6: false,
  };
}

/** First incomplete step (1–4), else Done (6). */
export function firstIncompleteStep(d: SetupProgressInput): number {
  const done = stepCompletion(d);
  for (const n of [1, 2, 3, 4]) if (!done[n]) return n;
  return 6;
}
