# Brief P4-B — Greenhouse safety status + Phase-4 tests + seed applications

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§4, §5, §14),
`docs/DATA-MODEL.md` (§4.6, §5, §6), `docs/DECISIONS.md` (§7).
Foundation (read, never edit): `src/modules/applications/logic.ts` + `post.ts`,
`src/modules/stock/movements.ts`, seed files `src/db/seed/*`, `tests/factories/index.ts`
(note `inventory` option), `tests/integration/stock-invariant.test.ts` (style).

## You own
- `src/modules/cycles/components/safety-chips.tsx` — ALREADY EXISTS (P3-B built it). You may
  extend it (e.g. a "products used" tooltip) but do NOT duplicate it elsewhere; reuse it.
- `src/modules/greenhouse-status/` (queries.ts: per-greenhouse safety + latest spray info;
  helpers for "safe to enter/harvest" booleans from greenhouse columns + now)
- Integration of the chips where they already render placeholders: you may EDIT ONLY these
  page/component files to wire real data IF P3-B shipped placeholder chips in them:
  `src/app/(app)/greenhouses/**` (P3-B's pages — coordinate by reading them first; your edit
  is limited to swapping placeholder safety markup for `<SafetyChips …/>`; change nothing else)
- `tests/unit/recipe-scaling.test.ts`, `tests/unit/safety-dates.test.ts`
- `tests/integration/applications.test.ts`
- `src/db/seed/06-applications.ts` + one wiring line in `src/db/seed/index.ts`

## Tasks
1. **SafetyChips**: props {entrySafeAt: Date|null, harvestSafeDate: string|null, now?}. Green
   "Safe to enter" / red "No entry until <Lagos datetime>"; green "Safe to harvest" / red
   "No harvest until <date>". Uses StatusBadge + lib/dates formatting. Used on greenhouse
   cards/detail and available for Phase-5 harvest form.
2. **greenhouse-status queries**: `getGreenhouseSafety(ctx, greenhouseId)` and
   `listGreenhouseSafety(ctx)` (all greenhouses with their safety columns + the latest spray
   application id/date + the products used — join application_items→items names, snapshots).
3. **Unit tests**:
   - recipe-scaling: scaleRecipe exact values (650 L of a 2.5 kg/1000L line → 1.625), zero
     and negative volume, zero-qty lines dropped, 3-decimal rounding.
   - safety-dates: computeSafety — fertigation always null; spray max-of-intervals; REI hours
     across midnight UTC vs Lagos (23:30 Lagos spray date boundaries!); items with null
     phi/rei ignored; laterInstant/laterDate GREATEST semantics.
4. **Integration `applications.test.ts`** (factories; follow stock-invariant style; do NOT
   run it): post a fertigation via postApplication → stock falls by the scaled amounts
   (SUM movements check), application_items rows match allocations, greenhouse safety
   columns UNCHANGED; post a spray with 2 chemicals (PHI 7/REI 24 and PHI 14/REI 12) →
   entry_safe_at = applied+24h, harvest_safe_date = Lagos date+14d, GREATEST holds when a
   second weaker spray posts after; INSUFFICIENT_STOCK rolls back the application row and
   its items entirely; replaying the same application id → pg unique error (DUPLICATE path).
5. **Seed 06-applications.ts** (deterministic; hand-built Ctx like 04-items): 3 recipes
   ("Veg Feed" + "Fruit Feed" fertigation, "IPM Spray A" spray); for each ACTIVE cycle, 10
   weeks of weekly fertigation (scaled from recipes via postApplication so stock really
   falls) + bi-weekly sprays alternating chemicals; applied dates relative to each cycle's
   transplant date, all in the past; volumes 400–800 L. The final spray for GH2's cycle
   must land recently enough that its PHI window is STILL ACTIVE at seed time (so the demo
   shows a red "no harvest" chip and Phase 5 can demo the override). Check stock levels in
   04-items cover 10 weeks of draws — if an item runs out, note which and bump ONLY via your
   06 file re-receiving more stock through postMovement (type receive, reason "seed top-up"),
   never by editing 04-items.

Check commands: `pnpm exec tsc --noEmit` (your files only) + `pnpm exec eslint <your files>`.
Report files, exact commands + real exit codes, assumptions, out-of-ownership needs.
