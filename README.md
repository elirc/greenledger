# GreenLedger

Inventory for greenhouse farms in Nigeria that grow tomatoes and peppers. GreenLedger tracks
what the farm has and where it went: inputs in the store, plants in each greenhouse, harvested
produce by grade, and equipment — with batch expiry (FEFO issuing), pre-harvest/re-entry safety
windows, offline logging for staff in the field, QR batch labels, sales with receivables, and
per-cycle profitability.

## Assumptions

- Users are commercial greenhouse and net-house farms with 1 to 50 structures, growing tomato and pepper (bell pepper, habanero, tatashe, chilli).
- Inventory means four things: inputs (seed, growing media, fertiliser, agrochemicals, packaging, consumables, spare parts), plants (seedlings in the nursery and plants in each greenhouse), harvested produce by grade, and equipment.
- Farms may grow in soil or in bags of cocopeat with fertigation. Nutrient and spray mixes are stored as recipes.
- Inputs are tracked by batch with an expiry date and issued earliest-expiry first.
- Each agrochemical has a pre-harvest interval and a re-entry interval. The farm enters these from the product label. The app has no built-in chemical database and gives no spray advice.
- Logging a harvest inside a pre-harvest interval triggers a warning and needs a manager's override with a reason.
- Fresh produce is short-lived. Default shelf life is 7 days for tomato and 10 for pepper at room temperature. Both are editable placeholders.
- Sales are recorded simply: customer, grade, weight, price, paid or unpaid. The app does not process customer payments and is not an accounting system.
- There are no sensors or climate controllers. Staff can type in temperature, humidity, EC and pH readings.
- Labels with QR codes are printed from the app and scanned with a phone camera to issue stock quickly.
- Staff work in greenhouses with poor signal, so harvests, stock issues, applications and tasks can be logged offline and sync later.
- Payroll and attendance are out of scope. Labour appears only as a cost entry and as tasks.
- Market: Nigeria first. Naira, Africa/Lagos time, metric units. Staff mostly use Android phones.
- A phone number is the main login, verified by a one-time code. The language is English.
- Web only: no native mobile apps in version one.
- The app is multi-tenant. Pricing is a placeholder: a monthly subscription per farm, tiered by number of greenhouses, with a 14-day free trial.

## Quick start (Docker)

```bash
cp .env.example .env          # defaults are fine for a local run (mock mode)
docker compose up --build -d  # db + web (runs migrations on boot) + worker
docker compose run --rm web pnpm db:seed
# open http://localhost:3000
```

> The compose stack was authored and reviewed but the development machine for v1 had no
> Docker, so it has not been executed there; the identical native path below is what every
> gate ran against.

## Quick start (native)

Requirements: Node 22, pnpm 9, PostgreSQL 16+ with databases `greenledger_dev` (and
`greenledger_test` for the integration suites).

```bash
pnpm install
cp .env.example .env.local    # adjust DATABASE_URL if needed
pnpm db:migrate
pnpm db:seed
pnpm dev                      # web on :3000
pnpm worker                   # pg-boss jobs (separate terminal)
```

## Demo logins (after `pnpm db:seed`)

| Who | Email | Password | Phone |
|---|---|---|---|
| Owner | owner@demo.farm | Demo1234! | +2348010000001 |
| Farm manager | manager@demo.farm | Demo1234! | +2348010000002 |
| Storekeeper | store@demo.farm | Demo1234! | +2348010000003 |
| Worker | worker@demo.farm | Demo1234! | +2348010000004 |
| Platform admin | admin@greenledger.local | Admin1234! | — |

Phone sign-in works for every farm user; **in mock mode the OTP is always `123456`** and no
SMS is sent. The app refuses to start in production with `AUTH_MOCK=1`.

The demo farm ships with 6 greenhouses, 40 items across ~70 batches (some expiring, one
expired with stock), 4 active tomato/pepper cycles, 10 weeks of fertigations and sprays
(GH2 is inside a pre-harvest interval, so the harvest-override flow can be demonstrated),
harvests, graded produce lots, sales with an unpaid/part-paid mix, equipment with one
overdue maintenance schedule, expenses, climate readings and tasks.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js app |
| `pnpm worker` | pg-boss worker (scheduled scans + notification dispatch) |
| `pnpm db:migrate` / `pnpm db:generate` | apply / generate Drizzle migrations |
| `pnpm db:seed` | wipe + reseed the demo farm (refuses in production) |
| `pnpm test` | unit suites (pure logic: FEFO, recipe scaling, safety dates, forecast, money/units/dates, profitability) |
| `pnpm test:integration` | integration + security suites against `DATABASE_URL_TEST` (stock/produce invariants, sync idempotency, tenancy isolation, worker price-redaction, billing) |
| `pnpm test:e2e` | Playwright end-to-end flow (needs a running seeded dev server) |
| `pnpm typecheck` / `pnpm lint` | TypeScript / ESLint |

## Stack

TypeScript (strict) · Next.js 16 App Router (Server Components for reads, Server Actions for
mutations, route handlers for webhooks/sync/PDF/Excel) · PostgreSQL + Drizzle ORM ·
Better Auth (phone OTP + email/password + organization plugin) · Tailwind CSS 4 + shadcn/ui ·
react-hook-form + Zod 4 · TanStack Table · Recharts · pg-boss worker · Serwist PWA + Dexie
offline outbox · `qrcode` + BarcodeDetector/`@zxing/browser` · @react-pdf/renderer · ExcelJS ·
env-selected adapters (SMS Termii, email Resend, payments Paystack, storage S3/local) each
with a mock driver.

### Library notes (current stable versions used; changes from the original spec list)

- **Zod 4** (the spec era assumed v3 APIs — schemas use `z.uuid()`, `z.email()`, `z.file()`).
- **react-day-picker 10** is newer than shadcn's calendar component supports, so the task
  calendar is a small date-fns month grid instead.
- **shadcn/ui CLI v5** ("nova" preset, radix base) no longer ships a `form` component; the
  classic react-hook-form wrapper lives in `src/components/ui/form.tsx`.
- **Better Auth 1.7.7**: its CLI generates `text` ids, so auth-table FKs are `text` while all
  business PKs are `uuid` (values are UUIDs either way).
- **date-fns 4 + date-fns-tz 3** for all Africa/Lagos display and calendar math.

## Engineering rules implemented

- Money is integer **kobo** (`bigint`); quantities live in each item's base unit
  (`kg/g/L/mL/pieces`); timestamps are UTC, displayed in Africa/Lagos.
- Input and produce stock change **only** through append-only movement tables
  (`src/modules/stock/movements.ts`, `src/modules/produce/movements.ts`): one transaction,
  row locks, stock can never go negative, corrections are new movements. On-hand is always
  `SUM(movements)` — enforced by invariant test suites.
- Every record created offline carries a client-generated UUID; `/api/sync` is idempotent
  (`sync_ops` insert-first, plus the business rows' own client-UUID primary keys).
- Every action validates with Zod, runs the server-side guard (session → organisation →
  role), scopes every query by organisation, and writes an audit row. Dedicated suites prove
  cross-tenant isolation and that workers never receive price fields.
- OTP requests are rate-limited (Better Auth, 3 attempts / 5-minute codes). Paystack webhook
  signatures are verified (HMAC-SHA512 of the raw body, timing-safe compare).
- Mobile-first at 360 px with ≥44 px touch targets; every screen has loading, empty and
  error states.

## Project layout

```
src/app         routes (thin) + API route handlers (auth, sync, webhooks, pdf, export, uploads)
src/modules     feature logic: schema.ts (zod) / queries.ts / actions.ts / handlers.ts / components
src/db          drizzle schema (52 tables), migrations, demo seed (runs through real services)
src/lib         guard, defineAction, audit, money/units/dates, offline outbox, notifications
src/adapters    sms / email / payments / storage — mock + real drivers picked by env
src/worker      pg-boss process: expiry/reorder/best-before/maintenance/billing scans
tests           unit · integration · security · e2e (Playwright)
docs            DATA-MODEL / ARCHITECTURE / DECISIONS / BUILD-PLAN (how this app was built)
```
