# GreenLedger — Build Plan

Orchestration model: **Fable orchestrates and pre-writes every shared file; Opus
subagents build modules under exact, disjoint file ownership; Fable reviews,
runs all gates serially, fixes, commits.** No phase ends without a bootable app
and a commit.

Environment reality (differs from spec where noted):

- Windows 11, pnpm, Node 22, **no Docker on this box** — compose files are
  authored and documented but verified only by review; all gates run against
  native Postgres 18 on `localhost:5432` (`greenledger_dev` / `greenledger_test`).
- Low-RAM machine: ONE serialized foreground install, suites run serially by
  the orchestrator only, nothing heavy in parallel with vitest.

## Global rules

1. **Keep-runnable rule.** Every phase ends with: tsc 0 errors, eslint clean,
   all existing vitest suites green (run twice if anything flakes), `pnpm build`
   succeeds, dev server boots and the new screens smoke-tested by the
   orchestrator, then a commit. Never start phase N+1 on a red phase N.
2. **Shared-file freeze.** Only the orchestrator may touch:
   `package.json`, lockfile, all config files (`next.config.*`,
   `drizzle.config.ts`, `vitest.config.ts`, `playwright.config.ts`,
   `tsconfig.json`, `eslint.config.*`), `src/db/schema/**`, `src/db/index.ts`,
   `src/lib/**`, `src/adapters/**`, `src/components/ui/**` (shadcn),
   `src/app/globals.css`, root layout and app-shell layout files,
   `docker-compose.yml`, `Dockerfile*`, `.env*`. Agents read them, never edit.
   The FULL Drizzle schema (every table in the spec) is written in Phase 1 so
   no later phase ever edits schema concurrently.
3. **One owner per file, per phase.** `src/db/seed.ts` has exactly one owner
   each phase (named below). After every agent wave the orchestrator runs
   `git status`/`git diff --stat` and reverts any out-of-ownership edit before
   review.
4. **Agents never run suites.** Allowed agent commands:
   `pnpm exec tsc --noEmit`, `pnpm exec eslint <own files>`. Everything else
   (vitest, playwright, dev servers, drizzle-kit, installs) is
   orchestrator-only, serial.
5. Every brief = `agents/_RULES.md` + ownership list + task spec + pointers to
   `docs/ARCHITECTURE.md` + `docs/DATA-MODEL.md` + the reference module to
   imitate.

## Phase 1 — Scaffold, auth, organisations, farm structure, wizard, seed

**Orchestrator pre-writes (foundation):** Next scaffold; all deps (one
install); complete Drizzle schema for the entire app + migrations; db client +
tx helper; Better Auth config (phone OTP w/ mock 123456 + email/password +
organization plugin, refuse-to-start check for mock auth in production); RBAC
matrix + `guard()` / `orgScope()` / `audit()` / `ActionResult` helpers;
money/units/dates libs; all four adapters (mock + real skeletons); design
tokens + app shell (nav, mobile-first); shadcn/ui set; vitest + playwright
configs + DB test helpers (truncate/reset, factories); docker-compose +
Dockerfiles + `.env.example`; seed skeleton; **reference module** (one small
CRUD slice, e.g. suppliers) showing the canonical action/page/form/table/state
pattern.

**Opus partition (3 agents):**

| Agent | Owns (create/edit) | Forbidden highlights |
|---|---|---|
| P1-A auth+users | `src/app/(auth)/**`, `src/app/(app)/settings/users/**`, `src/server/users/**`, `tests/unit/rbac.test.ts` | farm/*, seed, wizard |
| P1-B farm+wizard | `src/app/(app)/setup/**`, `src/app/(app)/farm/**` (sites, greenhouses, zones, stores), `src/server/farm/**` | auth/*, users/*, seed |
| P1-C seed+tenancy-test | `src/db/seed.ts`, `tests/factories/**`, `tests/security/tenancy.test.ts` | all src/app, all src/server |

**Gates:** tsc 0; eslint clean; `tenancy.test.ts` green (orchestrator-run);
boot → login as each of the 4 farm roles + platform admin with OTP 123456;
wizard creates site → greenhouses → stores → varieties stub; seed produces org
+ 5 users + 6 greenhouses. Commit: `phase 1: scaffold, auth, orgs, farm structure, wizard, seed`.

**Risks:** Better Auth plugin APIs drift — verify against installed package
docs before coding, not memory. Phone OTP + organization plugin interplay
(active org on session) is the fiddliest bit; orchestrator owns it.

## Phase 2 — Input store

**Pre-writes:** `src/server/stock/post-movement.ts` — the single transactional
movement poster (row locks, non-negative guard, append-only, correction =
new movement); FEFO `selectBatches()` pure fn; QR payload format + label PDF
scaffold; alert queries (reorder, expiring 60/30, expired).

**Opus partition (3):**

| Agent | Owns |
|---|---|
| P2-A receive | items CRUD, suppliers, receipts + receipt_lines, batch intake UI+actions (`src/server/store/receive*`, `src/app/(app)/store/items/**`, `.../receive/**`) |
| P2-B issue | issue/transfer/count/return flows + movements ledger + QR scan components (`src/server/store/issue*`, `transfer*`, `count*`, `src/app/(app)/store/issue/**` etc., `src/components/scan/**`) |
| P2-C alerts+tests | stock list w/ value + reorder + next-expiry, alerts UI, label printing page, `tests/unit/fefo.test.ts`, `tests/unit/units.test.ts`, `tests/integration/stock-invariant.test.ts`, `tests/security/worker-prices.test.ts`, seed extension (40 items + batches) |

**Gates:** all Phase-1 gates + fefo/units/invariant/worker-prices suites;
smoke: receive fertiliser → label → issue to greenhouse via FEFO → count →
adjustment; expired batch refuses issue without override. Commit
`phase 2: input store`.

**Risks:** row-lock semantics in Drizzle (use `SELECT ... FOR UPDATE` via sql
operator); BarcodeDetector absent on desktop — ship @zxing fallback and test
the fallback path.

## Phase 3 — Crops, nursery, cycles, losses, scouting, tasks

**Pre-writes:** crop-cycle status machine constants + transition guard.

**Opus partition (3):**

| Agent | Owns |
|---|---|
| P3-A nursery | crops/varieties CRUD, nursery_batches lifecycle (sow→germinate→ready→transplant/discard), transplant action (creates/updates cycle, sets plant count) |
| P3-B cycles | crop_cycles CRUD + status, plant_losses, per-greenhouse plant inventory views |
| P3-C scouting+tasks | scouting_logs w/ photo upload (storage adapter), tasks (list + calendar), seed extension (varieties + 4 active cycles), `tests/unit/cycle-status.test.ts` |

**Gates:** prior suites + new; smoke: sow → transplant → see plants alive →
log loss → scouting with photo → task on calendar. Commit `phase 3: crops, nursery, cycles, scouting, tasks`.

## Phase 4 — Recipes, applications, safety logic

**Pre-writes:** pure safety calcs (`harvestSafeDate = max(appliedAt + PHI_days)`,
`entrySafeAt = appliedAt + max REI_hours`), recipe scaling pure fn
(per-1000 L → volume), and the transactional application-posting core that
calls the Phase-2 movement engine.

**Opus partition (2):**

| Agent | Owns |
|---|---|
| P4-A recipes+apps | recipes + recipe_lines CRUD, application logging UI/actions (fertigation + spray), application_items |
| P4-B status+tests | greenhouse safety status (enter/harvest badges + times, on greenhouse card and store issue screens), `tests/unit/recipe-scaling.test.ts`, `tests/unit/safety-dates.test.ts`, stock-invariant extension for applications, seed extension (10 weeks applications) |

**Gates:** smoke: log fertigation → stock falls by scaled amounts; log spray →
greenhouse shows not-safe-to-enter until REI and not-safe-to-harvest until
PHI. Commit `phase 4: recipes, applications, safety logic`.

## Phase 5 — Harvest, produce, forecast, waste, sales

**Pre-writes:** produce movement poster (mirror of input engine, oldest-first
selection), manager-override pattern (role check + reason + audit row).

**Opus partition (3):**

| Agent | Owns |
|---|---|
| P5-A harvest | quick harvest entry (crates+kg per grade), PHI warning + manager override, produce_lots + best-before, waste entry + near-best-before alerts |
| P5-B sales | customers, sales + sale_lines (oldest stock first), payments_received, receivables ageing, delivery note + invoice PDFs |
| P5-C forecast+tests | harvest forecast fn + forecast-vs-actual UI, `tests/unit/harvest-forecast.test.ts`, invariant extension (produce flows), worker-prices extension (sales prices), seed extension (10 weeks harvests + sales) |

**Gates:** smoke: harvest inside PHI → warning → override w/ reason → sale →
delivery note PDF → receivables. Commit `phase 5: harvest, produce, sales`.

## Phase 6 — Equipment, expenses, dashboard, reports, offline sync, billing, platform admin, e2e, README

**Pre-writes:** Serwist PWA config + Dexie offline queue lib + idempotent sync
route handler contract (client UUIDs); pg-boss worker entry + job registry;
Paystack webhook signature verification helper; read-only-org middleware.

**Opus partition (4, two waves if needed):**

| Agent | Owns |
|---|---|
| P6-A equipment+expenses | equipment register, maintenance schedules/logs + reminders (pg-boss), expenses, climate readings + Recharts |
| P6-B dashboard+reports | farm dashboard, greenhouse cards (kg/m², kg/plant, grade-A share, cost/kg), all reports + ExcelJS/PDF exports, `tests/unit/profitability.test.ts` |
| P6-C offline+sync | Dexie queue wiring into harvest/issue/application/task forms, sync endpoint idempotency, `tests/integration/sync-idempotent.test.ts` |
| P6-D billing+admin | plans/subscriptions, Paystack hosted checkout + webhook, trial + read-only lockout, platform admin screens, notifications |

**Orchestrator finishes:** `tests/e2e/full-flow.spec.ts` (Playwright), README
(incl. verbatim Assumptions section + library-version notes), final full gate
run, `v1.0.0` tag. Commit `phase 6: dashboard, reports, offline sync, billing, admin, e2e`.

**Risks:** Serwist needs a production build to exercise; react-pdf and ExcelJS
must stay in route handlers (nodejs runtime, no RSC import into client
bundles); pg-boss creates its own schema — point it at the dev DB, not test.

## Test inventory (Definition of Done → file → phase)

| DoD item | File | Phase |
|---|---|---|
| FEFO batch selection | `tests/unit/fefo.test.ts` | 2 |
| Unit conversion | `tests/unit/units.test.ts` | 2 |
| Recipe scaling | `tests/unit/recipe-scaling.test.ts` | 4 |
| Entry-safe / harvest-safe dates | `tests/unit/safety-dates.test.ts` | 4 |
| Harvest forecast | `tests/unit/harvest-forecast.test.ts` | 5 |
| Cycle profitability | `tests/unit/profitability.test.ts` | 6 |
| Stock on hand == Σ movements after every flow | `tests/integration/stock-invariant.test.ts` | 2, extended 4 & 5 |
| Offline replay twice → one record | `tests/integration/sync-idempotent.test.ts` | 6 |
| Org A cannot read org B | `tests/security/tenancy.test.ts` | 1, extended 2 |
| Worker never receives price fields | `tests/security/worker-prices.test.ts` | 2, extended 5 |
| Full e2e flow (receive→…→spray record) | `tests/e2e/full-flow.spec.ts` | 6 |

## Seed plan (`src/db/seed.ts`, one owner per phase)

Deterministic (fixed RNG seed). Phase 1: org "Demo Farm", 5 logins (owner,
manager, storekeeper, worker, platform admin), 1 site, 6 greenhouses, zones,
3 stores. Phase 2: 8 suppliers, 40 items incl. chemicals w/ PHI/REI and NPK
fertilisers, batches w/ staggered expiries, opening receipts. Phase 3:
tomato + pepper varieties, nursery batches, 4 active cycles. Phase 4: 3
recipes, 10 weeks of fertigation + sprays (stock actually issued). Phase 5:
10 weeks of graded harvests + sales to 6 customers, some unpaid. Phase 6:
equipment + schedules, expenses per cycle, tasks, climate readings,
subscription on trial.

## Risk register (standing orders)

1. **Installs:** exactly one, foreground, by the orchestrator. An agent that
   "repairs" deps has violated rules — revert and re-brief.
2. **Pipe exit codes lie:** never ` | tail` a gate; redirect to file and check
   the real exit code.
3. **Shared test DB:** `greenledger_test`, vitest `fileParallelism: false`,
   orchestrator-only, serial.
4. **Orphaned dev servers:** before smoke, kill stray node processes / check
   the port; a green probe can come from the wrong process.
5. **Ownership:** verify with `git diff --stat` after every wave; revert
   violations rather than merging them.
6. **Flaky suites:** run twice before declaring green; low RAM manufactures
   failures that look real.
7. **Library drift:** check installed package docs (node_modules docs/ or
   official site) before coding each integration — Better Auth, Paystack,
   Termii, Serwist, pg-boss. Never code from memory.
