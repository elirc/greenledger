# Brief P6-B — Farm dashboard, greenhouse KPIs, reports + Excel/PDF exports

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§4, §5, §10),
`docs/DATA-MODEL.md` (§5 derived-state rules — THE source for every formula), `docs/DECISIONS.md`
(§15.6 forecast, §15.7 profitability). Imitate existing pages; ExcelJS/PDF route pattern:
`src/app/api/pdf/label/route.ts`; forecast helpers `src/modules/produce/forecast.ts`.

## You own
- `src/modules/dashboard/` (queries.ts, components/)
- `src/modules/reports/` (queries.ts, excel.ts, components/)
- `src/app/(app)/page.tsx` (REPLACE the placeholder dashboard — you own it this phase) +
  keep `loading.tsx`/`error.tsx` working
- `src/app/(app)/reports/**` (hub + 7 report pages)
- `src/app/api/export/[report]/route.ts` (ExcelJS streams)
- `src/app/api/pdf/spray-record/route.ts`
- `src/modules/documents/spray-record.tsx`
- `tests/unit/profitability.test.ts` + `src/modules/reports/profitability.ts` (pure calc)
- EDIT `src/app/(app)/greenhouses/[id]/page.tsx` ONLY to replace the money-KPI placeholder
  section with real numbers (read it first; change nothing else)

## Tasks
1. **Dashboard `/`** (all roles; workers see no money and only assigned greenhouses):
   stat tiles — input stock value (OMS; MoneyText), low-stock + expiring counts (link
   /store/alerts), produce on hand by age buckets (fresh <3d / 3-7d / near best-before),
   this week's harvest kg vs forecast (from forecast.ts), sales this month + unpaid total
   (OM), tasks due today/overdue, maintenance due count, greenhouse safety strip (red chips
   first). Each tile links to its screen. Server component queries in
   src/modules/dashboard/queries.ts (ctx-first, role-aware).
2. **Greenhouse detail KPIs** (edit listed page only): cycle yield to date (Σ harvest kg),
   kg/m² (area), kg/plant (plants_transplanted), grade-A share %, input cost to date
   (Σ |issue movements| × batch unit_cost rate via rateTimesQty), cost per kg — money gated
   by canSeeMoney.
3. **Pure profitability calc** (`src/modules/reports/profitability.ts`): given a cycle's
   revenue (allocated sale_lines via produce_movements→lots→harvests→cycle), input cost
   (issued movements × batch rate), cycle-attributed expenses → { revenueKobo,
   inputCostKobo, expensesKobo, profitKobo, kgSold, costPerKgKobo }. Document that
   unallocated org-level expenses are excluded (spec). Unit-test with hand-computed fixtures
   (tests/unit/profitability.test.ts) — pure function over plain arrays, no DB.
4. **Reports** (`/reports` hub + pages, roles OM; every page has BOTH "Excel" and where
   listed "PDF" buttons): crop cycle profitability (per cycle table using the pure calc fed
   by queries); input use (by cycle / greenhouse / item, from issue movements); harvest by
   grade and week (matrix); waste (produce_movements type waste w/ reasons); stock
   valuation (on-hand × rate per item, total); purchases (receipts by supplier/month);
   **spray record** (every application: date, greenhouse, cycle, products + rates, operator,
   PHI/REI snapshots, entry/harvest-safe windows, and the harvests that followed within the
   PHI window flagged) — this one gets the PDF route (`/api/pdf/spray-record?from=&to=`)
   using `src/modules/documents/spray-record.tsx`.
5. **Excel exports** (`/api/export/[report]`): one sheet per report via
   `src/modules/reports/excel.ts` helpers — bold frozen header, set column widths, number
   formats (kobo → naira with ₦#,##0.00), filename `greenledger-<report>-<yyyyMMdd>.xlsx`.
   Auth: requireMember OM; org-scoped queries reused from reports/queries.ts.

Check commands: `pnpm exec tsc --noEmit` (your files only) + `pnpm exec eslint <your files>`.
Report files, exact commands + real exit codes, assumptions, out-of-ownership needs.
