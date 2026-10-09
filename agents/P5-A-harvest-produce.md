# Brief P5-A — Harvest entry (PHI override), produce stock, waste

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§4, §5), `docs/DATA-MODEL.md`
(§4.7), `docs/DECISIONS.md` (§17 handlers). Imitate `src/modules/suppliers/**`; for handlers.ts
see `src/modules/losses/`.
Foundation (read, never edit): `src/modules/produce/movements.ts` (postProduceMovement,
fifoLotCandidates, lotOnHand, postProduceTransfer), `src/modules/produce/harvest-post.ts`
(postHarvest, isHarvestBlocked), `src/modules/cycles/components/safety-chips.tsx`.

## You own
- `src/modules/harvest/` (schema.ts, handlers.ts, actions.ts, queries.ts, components/)
- `src/modules/produce/` EXCEPT movements.ts, harvest-post.ts, forecast.ts (add schema.ts,
  queries.ts, actions.ts, components/)
- `src/app/(app)/harvest/**` (quick entry + recent harvests)
- `src/app/(app)/produce/**` (lots by grade/store, waste entry, transfers)

## Tasks
1. **Quick harvest entry** (`/harvest`, roles OMW; workers assigned greenhouses only —
   assertGreenhouse): flow greenhouse → active cycle (auto when single) → harvest datetime
   (default now) → grade lines (A/B/C/Reject rows, each crates + kg; blank rows skipped) →
   destination store (default packhouse) → notes. SAFETY: read the greenhouse's
   harvest_safe_date; when today < that date show the red warning panel BEFORE submit
   ("Inside pre-harvest interval until <date>"). Submit path: handlers.ts
   `postHarvestHandler(input, ctx)` wrapping `postHarvest` in a transaction; schema takes
   `clientId: z.uuid()` (harvest PK). When PHI_BLOCKED comes back and ctx.role is
   owner|manager, show the override dialog (reason, min 5 chars) and resubmit with
   `override: {reason}`; workers see "Ask a manager to override" and CANNOT submit an
   override (action rejects override for worker role with FORBIDDEN_OVERRIDE before
   anything else). 23505 on clientId → `{duplicate:true}` success.
   Below the form: this greenhouse's recent harvests.
2. **Produce stock** (`/produce`, roles OMS): lots grouped by crop+grade; per lot: on-hand kg
   per store, harvested date, age in days, best-before chip (danger when ≤2 days or past —
   use BEST_BEFORE_WARN_DAYS from src/lib/alerts.ts), link to the harvest's cycle. Sections
   or filter for store. "Near best-before" alert section on top. Also a harvests list tab
   (date, cycle, grades summary, override badge when phi_override).
3. **Waste entry** (OMS): from a lot row — kg + reason (required select: spoiled, damaged,
   rejected, other + note) → postProduceMovement type waste, audit. **Transfers** (OMS):
   lot, from-store, to-store, kg → postProduceTransfer, audit.
4. Queries (org-scoped, ctx-first): `listProduceLots(ctx, {storeId?, grade?})` (with on-hand
   via SUM), `listHarvests(ctx, {greenhouseId?, cycleId?})`, `getHarvest(ctx, id)`,
   `getHarvestFormRefs(ctx)` (worker-visible greenhouses + their active cycles + stores +
   each greenhouse's harvest_safe_date). NO money anywhere in this module (produce has no
   costs until sales).

Check commands: `pnpm exec tsc --noEmit` (your files only) + `pnpm exec eslint <your files>`.
Report files, exact commands + real exit codes, assumptions, out-of-ownership needs.
