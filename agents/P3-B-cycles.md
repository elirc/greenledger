# Brief P3-B — Crop cycles, plant losses, greenhouse cards

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§4, §5), `docs/DATA-MODEL.md`
(§4.3), `docs/DECISIONS.md` (§7 safety columns). Imitate `src/modules/suppliers/**`.
Foundation (read, never edit): `src/modules/cycles/status.ts` (status machine — use
assertTransition, ACTIVE_CYCLE_STATUSES, labels), `src/modules/cycles/transplant.ts`
(expectedDates for date edits; transplantToCycle is called by P3-A's UI, not yours).

## You own
- `src/modules/cycles/` EXCEPT status.ts and transplant.ts (add schema.ts, queries.ts,
  actions.ts, components/)
- `src/modules/losses/` (schema.ts, queries.ts, actions.ts, components/)
- `src/app/(app)/cycles/**` EXCEPT `src/app/(app)/cycles/[id]/scouting/**` (P3-C's)
- `src/app/(app)/greenhouses/**`

## Tasks
1. **Cycles list** (`/cycles`, roles OMW — workers see only assigned greenhouses via
   ctx.assignedGreenhouseIds): active cycles as cards (code, variety+crop, greenhouse,
   status badge, plants alive, transplant date, expected first harvest); closed/planned under
   a tab. Filter by greenhouse.
2. **Planned cycles**: "Plan a cycle" (owner/manager): greenhouse, variety, intended sow date →
   status planned; a planned cycle can be edited or deleted; direct-seeded farms can mark a
   planned cycle as growing with a transplant date + plant count (uses assertTransition).
3. **Cycle detail** (`/cycles/[id]`): header (code, status + allowed transition buttons via
   assertTransition — e.g. growing→harvesting, →closed with confirm), KPI row (plants
   transplanted, alive, losses total, expected first harvest/end), tabs or sections:
   Losses (list + "Log loss"), Scouting (just a link/section pointing to
   `/cycles/[id]/scouting` — P3-C builds it), Applications/Harvests placeholders
   ("arrives in Phase 4/5" SectionCards). Editing transplant date recomputes expected dates
   via `expectedDates`.
4. **Plant losses** (roles OMW; workers assigned-greenhouse only — call assertGreenhouse):
   schema takes `clientId: z.uuid()` (used as the row PK — offline op later). Form: date
   (default today), count, cause select (pest/disease/physical/heat/other + free note).
   Action inside one transaction: insert plant_losses row (id = clientId), decrement
   crop_cycles.plants_alive (lock cycle row FOR UPDATE; floor at 0 — reject counts that
   exceed plants_alive with BAD_COUNT), audit. Losses list shows date, count, cause, by whom.
5. **Greenhouse cards** (`/greenhouses`, all roles; workers see assigned only): one card per
   greenhouse — name, type, area; active cycle summary (variety, plants alive, status) or
   "Empty"; safety chips reading greenhouses.entry_safe_at / harvest_safe_date: green
   "Safe to enter"/"Safe to harvest" when null or past, red with date/time when in the
   future (Phase 4 starts writing these; render both states now). `/greenhouses/[id]`:
   detail with cycle history list and the same chips; money KPIs deferred (placeholder,
   canSeeMoney-gated).

Conventions: defineAction everywhere; audit every write; loading/error/empty; 44px targets.
Check commands: `pnpm exec tsc --noEmit` (your files only) + `pnpm exec eslint <your files>`.
Report files, exact commands + real exit codes, assumptions, out-of-ownership needs.
