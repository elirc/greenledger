# Brief P3-A — Varieties pages + nursery lifecycle

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§4, §5), `docs/DATA-MODEL.md`
(§4.2, §4.3), `docs/DECISIONS.md`. Imitate `src/modules/suppliers/**`.
Foundation (read, never edit): `src/modules/cycles/transplant.ts` (transplantToCycle — THE
transplant path), `src/modules/crops/{actions,queries,schema}.ts` (already exist from Phase 1 —
extend only if a needed action is missing, they are YOURS this phase).

## You own
- `src/modules/crops/**` (this phase's owner — add missing variety queries/actions if needed)
- `src/modules/nursery/` (schema.ts, queries.ts, actions.ts, components/)
- `src/app/(app)/settings/varieties/**` (crops + varieties management: list grouped by crop,
  add/edit variety sheets, edit crop shelf-life)
- `src/app/(app)/nursery/**` (list, new, [id] detail)

## Tasks
1. **Varieties settings** (owner/manager): list varieties grouped under Tomato / Pepper with
   days-to-first-harvest, harvest weeks, expected yield; add/edit in sheets; crop shelf-life
   (editable placeholder 7/10 days per Assumptions) edited inline per crop.
2. **Nursery batches** (roles owner/manager/worker — worker can log, not create):
   - Create: variety select, sow date (default today), trays, cells per tray, seeds sown
     (default trays×cells, editable), optional seed item-batch link (combobox over
     item_batches of category seed — read-only query on inventory schema), notes.
   - Detail: counters card (sown / germinated / ready / transplanted / discarded, germination
     rate % when germinated>0), update-counts action (germinated ≤ sown; ready ≤ germinated;
     all monotonic non-decreasing — reject decreases with a clear message), discard action
     (count + reason → increments discarded), status badge.
   - **Transplant flow**: button on detail → form (greenhouse select, optional zone, count
     defaulting to available, date default today, "close batch" checkbox) → action wraps
     `transplantToCycle` in `db.transaction` via defineAction; success toast links to the new
     cycle at `/cycles/[id]` (page exists after P3-B; link anyway).
   - List: open batches first with age in days since sowing, then finished; EmptyState.
3. All actions audited, zod schemas shared with forms, loading/error/empty everywhere,
   mobile-first, 44px targets.

Check commands: `pnpm exec tsc --noEmit` (your files only) + `pnpm exec eslint <your files>`.
Report files, exact commands + real exit codes, assumptions, out-of-ownership needs.
