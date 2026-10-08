# Brief P2-C — Stock list, alerts, label sheet page, Phase-2 tests + seed extension

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§4, §5, §12, §14),
`docs/DATA-MODEL.md` (§4.4, §4.5, §5, §6), `docs/DECISIONS.md`. Imitate `src/modules/suppliers/**`.
Foundation (read, never edit): `src/modules/stock/movements.ts`, `src/modules/stock/logic.ts`,
`src/lib/alerts.ts`, `tests/factories/**`, `tests/helpers/**`.

## You own
- `src/modules/stock/stock-queries.ts` (on-hand/value/alert aggregate queries — separate file
  so you don't collide with P2-B's queries.ts)
- `src/app/(app)/store/page.tsx` (+ loading/error) — the store hub: stock list
- `src/app/(app)/store/alerts/**`
- `src/app/(app)/store/labels/**` (pick batches → print sheet via /api/pdf/label?batchIds=)
- `tests/unit/fefo.test.ts`, `tests/unit/units.test.ts` (EXTEND the existing file — it exists;
  add item-flavored cases, keep existing tests intact)
- `tests/integration/stock-invariant.test.ts`
- `tests/security/worker-prices.test.ts`
- `src/db/seed/04-items.ts` + wiring line in `src/db/seed.ts` (you are this phase's single
  seed owner; follow the existing seed structure)

## Tasks
1. **Stock list** (`/store`, roles OMS): per-item rows — on-hand (formatQty), stock value
   (MoneyText; column only when ctx.canSeeMoney), reorder flag (StatusBadge warning), next
   expiry date + chip (danger when <30d/expired). Search + category filter (client, on loaded
   rows). Row → `/store/items/[id]`. Quick actions bar: Receive / Issue / Transfer / Count /
   Labels / Alerts / Suppliers.
2. **Alerts page**: three sections from aggregate queries — below reorder, expiring (60d and
   30d buckets), expired with stock; each row links to the item. This page is pure queries —
   the pg-boss notification jobs come in Phase 6.
3. **Labels page**: batch multi-select (search by item), opens
   `/api/pdf/label?batchIds=a,b,c` in new tab.
4. **Seed extension** (`src/db/seed/04-items.ts`): per DATA-MODEL §6 — 4 suppliers, 40 items
   (6+ agrochemicals with the listed PHI/REI values, 8+ NPK fertilisers, seeds, cocopeat,
   crates, packaging, consumables, spares), ~70 batches with staggered expiries (several <30d,
   at least one expired WITH stock), ~25 receipts posting real `receive` movements through the
   movement engine (import and call the same service code — never raw-insert movements).
   Deterministic values only.
5. **Tests**:
   - `fefo.test.ts`: pure tests of `src/modules/stock/logic.ts` FEFO pick — earliest expiry
     first, NULL expiry last, received_at tiebreak, skips zero-stock batches, skips expired
     unless includeExpired.
   - `stock-invariant.test.ts` (integration): using factories, run receive → issue → transfer →
     count-adjust → return through the real actions' handler layer, and after EACH flow assert
     on-hand(batch,store) === SUM(inventory_movements.quantity) recomputed with raw SQL, and
     that no (batch,store) on-hand is negative; also assert issuing more than on-hand throws
     INSUFFICIENT_STOCK and posts nothing.
   - `worker-prices.test.ts` (integration): call every exported function of
     `src/modules/stock/stock-queries.ts`, `src/modules/items/queries.ts`,
     `src/modules/receipts/queries.ts` with a WORKER ctx and assert the returned JSON has no
     key matching /cost|price|value|kobo/i with a non-null value. Registry-style so Phase 5
     adds sales queries with one line.
   DO NOT RUN vitest — orchestrator runs suites. `pnpm exec tsc --noEmit` + eslint only.

Note: `src/modules/items/queries.ts` and `src/modules/receipts/queries.ts` are written in
parallel by P2-A — import them; if missing at your tsc run, note it in the report.
