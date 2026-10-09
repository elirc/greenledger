# Brief P5-C — Forecast UI, Phase-5 tests, seed harvests + sales

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§4, §5, §14),
`docs/DATA-MODEL.md` (§4.7, §4.8, §5, §6), `docs/DECISIONS.md`.
Foundation (read, never edit): `src/modules/produce/forecast.ts` (cycleForecast, farmForecast,
forecastVsActual, isoWeekStart — what you test and render), `harvest-post.ts` (postHarvest for
seed), `movements.ts` (allocateSale for seed), seed style `src/db/seed/06-applications.ts`
(hand-built Ctx), `tests/integration/stock-invariant.test.ts` + `tests/factories/index.ts`.

## You own
- `src/modules/forecast/` (queries.ts + components/forecast-chart.tsx)
- `src/app/(app)/harvest/forecast/**` (page: farm + per-cycle forecast vs actual)
- `tests/unit/harvest-forecast.test.ts`
- `tests/integration/produce-invariant.test.ts`
- `src/db/seed/07-harvests-sales.ts` + one wiring line in `src/db/seed/index.ts`

## Tasks
1. **Forecast page** (`/harvest/forecast`, roles OM — it implies yields, keep workers out):
   per active cycle: plants alive × yield/plant ÷ weeks table + `forecastVsActual` chart
   (Recharts BarChart: forecast vs actual kg per ISO week; read the dataviz conventions in
   the chart component carefully — label axes, legend, Lagos week labels 'dd MMM'). Farm
   total chart on top. Actual kg per week from a query grouping harvest_lines.kg by ISO week
   (Lagos) per cycle. Mobile: horizontal scroll for the chart.
2. **`tests/unit/harvest-forecast.test.ts`**: cycleForecast exact math (1000 plants × 4.5 kg
   ÷ 10 weeks = 450/week, weeks start Monday of expected_first_harvest's ISO week),
   zero/edge cases (null date, 0 plants, 0 weeks), farmForecast merging overlapping weeks,
   forecastVsActual zero-filling, isoWeekStart on Sunday/Monday boundaries.
3. **`tests/integration/produce-invariant.test.ts`** (factories with `inventory: false`;
   mirror stock-invariant style; do NOT run): postHarvest (3 grade lines) → lots created
   with correct best-before (crop shelf life), SUM(produce_movements) per lot/store matches,
   cycle flipped growing→harvesting; PHI block: set greenhouse harvest_safe_date in the
   future → postHarvest without override throws PHI_BLOCKED and posts NOTHING; with
   override → phi_override row fields + audit action harvest.create.phi_override; sale via
   allocateSale drains lots oldest-first and refuses shortfalls atomically; waste requires
   reason; lot on-hand never negative (SQL having-sum check).
4. **Seed `07-harvests-sales.ts`** (deterministic, hand-built Ctx, through the service
   functions): for the 2 harvesting cycles (GH2, GH3) + GH1 once it reaches harvesting age:
   2-3 harvests/week over the last 6-8 weeks via postHarvest (grade split ≈55/25/12/8 into
   Packhouse), INCLUDING exactly one PHI-override harvest (GH2 — its last spray's PHI is
   still active per 06-applications; use override reason "Buyer collection could not wait —
   graded for processing only" with a manager ctx). 5 customers (Mile 12 trader, 2
   supermarkets, hotel, exporter); ~2 sales/week over those weeks via the counters+
   allocateSale path you replicate from P5-B's createSale handler — IMPORTANT: P5-B builds
   in parallel; if `src/modules/sales/` exports a reusable handler, use it; otherwise
   build the sale rows + allocateSale calls directly in the seed (counters increment
   included) and say so in the report. Prices ₦1,200–2,000/kg A-grade, lower per grade;
   ~30% of sales left unpaid or part-paid (ageing spread across buckets); a few waste
   movements with reasons; payments for the rest.
   Stock note: produce comes from the harvests you create — no top-ups needed.

Check commands: `pnpm exec tsc --noEmit` (your files only) + `pnpm exec eslint <your files>`.
Report files, exact commands + real exit codes, assumptions, out-of-ownership needs.
