# Brief P6-A — Equipment + maintenance, expenses, climate readings

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§4, §5, §8 jobs, §12),
`docs/DATA-MODEL.md` (§4.9, §4.10), `docs/DECISIONS.md`. Imitate `src/modules/suppliers/**`.
Foundation (read, never edit): `src/lib/jobs.ts` (JOBS, sendJob), `src/worker/**` (you ADD a
job module file — see ownership), `src/lib/alerts.ts` (MAINTENANCE_WARN_DAYS),
`src/lib/notify.ts` (orchestrator pre-write: `notifyRole(tx, ctx|org, {...})` dedup helper).

## You own
- `src/modules/equipment/` (schema.ts, queries.ts, actions.ts, components/)
- `src/modules/expenses/` (schema.ts, queries.ts, actions.ts, components/)
- `src/modules/readings/` (schema.ts, handlers.ts, actions.ts, queries.ts, components/)
- `src/app/(app)/equipment/**`, `/expenses/**`, `/readings/**`
- `src/worker/jobs/maintenance-scan.ts` (replace the placeholder registration for
  JOBS.maintenanceScan inside `src/worker/jobs/index.ts` — you may edit ONLY that job's
  entry in the registry, nothing else in the worker)
- `src/db/seed/08-equipment-expenses.ts` + wiring lines in `src/db/seed/index.ts`

## Tasks
1. **Equipment register** (roles OMS; costs hidden from... storekeeper CAN see input costs
   but equipment cost is money — show cost columns only when ctx.canSeeMoney): CRUD — name,
   category (pump|tank|dosing_unit|sprayer|cover|net|irrigation|other), site/greenhouse
   location, serial, purchase date, cost (naira→kobo), status
   (operational|needs_service|broken|retired). List grouped by status with badges.
2. **Maintenance**: schedules per equipment (name, interval days, next due) + "Log work"
   (done date, description, cost, optional schedule → in one tx update schedule last/next
   dates per DATA-MODEL §4.9) + logs list. Equipment detail shows schedules (due badge when
   within 7 days / overdue) + work history.
3. **Maintenance scan job** (`src/worker/jobs/maintenance-scan.ts`): for each org, schedules
   due within MAINTENANCE_WARN_DAYS or overdue → `notifyRole` (owner+manager, dedup key
   `maint:<scheduleId>:<nextDueDate>`) + create a task (assigned nobody, greenhouse from
   equipment when set, due = next_due_date) if an open task with the same dedup marker
   doesn't exist (store the marker in task description suffix `[auto:maint:<scheduleId>]`).
4. **Expenses** (roles OM only — money): CRUD list + new: category enum
   (labour|power|water|repairs|transport|other), amount, date, optional site / greenhouse /
   crop cycle attribution; list with month filter + per-category totals row. All audited.
5. **Climate readings** (`/readings`, roles OMW; workers assigned greenhouses): entry form
   (greenhouse, datetime default now, temperature °C, humidity %, EC mS/cm, pH — at least
   one required, zod refine) through `handlers.ts` (clientId → PK, 23505 → duplicate, per
   DECISIONS §17). Charts: per greenhouse, last 14 days, one Recharts LineChart per metric
   present (labeled axes, Lagos date ticks); mobile horizontal scroll.
6. **Seed 08**: 8 equipment rows (pumps, tanks, dosing unit, sprayers, covers, nets), 3
   schedules (ONE overdue by ~5 days), 4 maintenance logs; weekly expenses for the last 10
   weeks (labour ₦180k-220k/wk, power/diesel ₦40-60k, water ₦8-12k, repairs occasional) —
   cycle-attributed where sensible (labour split across active cycles), plus some org-level;
   climate readings ~3/week/greenhouse for 4 active GHs over 10 weeks (26-34°C, 55-85%,
   EC 1.8-2.8, pH 5.6-6.4, deterministic formulas, no RNG).

Check commands: `pnpm exec tsc --noEmit` (your files only) + `pnpm exec eslint <your files>`.
Report files, exact commands + real exit codes, assumptions, out-of-ownership needs.
