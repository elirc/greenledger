# GreenLedger — Data Model (source of truth for the schema author)

Status: FINAL plan, 2026-10-08. Transcribe into Drizzle without redesigning. Where a decision
was possible, it has been made here. Anything marked **UNVERIFIED** must be re-checked against
generated output or current docs during implementation — do not guess past it.

---

## 1. Global conventions (already decided — do not revisit)

- **Primary keys**: `uuid`, default `gen_random_uuid()`. Every PK column accepts a
  client-supplied UUID (offline-created rows send their own id). Tables that can be created
  offline are flagged `[offline]` below; their inserts MUST use the client id when given.
- **Money**: `bigint` kobo for all monetary *amounts* (totals, line totals, prices, costs,
  expenses, payments). Exception: *per-base-unit cost rates* (e.g. kobo per gram) may be
  fractional and are `numeric(16,6)` kobo — they are rates, not amounts; any amount derived
  from a rate is rounded to integer kobo at posting time (round half up).
- **Quantities**: `numeric(14,3)` in the item's base unit. Base units enum: `kg, g, l, ml, pcs`
  (lowercase in pg; display as kg/g/L/mL/pieces).
- **Timestamps**: `timestamptz`, stored UTC, displayed Africa/Lagos. Calendar-only values
  (expiry, best-before, due dates, sow/transplant dates) are `date` and mean "Lagos calendar day".
- **Tenancy**: every business table carries `organisation_id uuid NOT NULL` FK →
  `organization.id` (Better Auth's table — see §2), `ON DELETE restrict` (orgs are never
  deleted, they go read-only). Every query filters by it; composite indexes lead with it.
- **Append-only movements**: `inventory_movements` and `produce_movements` never receive
  UPDATE or DELETE. Corrections are new rows (type `adjustment`). Stock on hand is always
  `SUM(signed quantity)`. Enforce in app code + an invariant test; optionally a pg trigger
  that raises on UPDATE/DELETE of these two tables (nice-to-have, not required for v1).
- **Signed quantities**: movement `quantity`/`kg` is SIGNED. Positive = into the store,
  negative = out. CHECK constraints per type (see tables).
- **Naming**: business tables/columns are `snake_case`. Drizzle: use `casing: 'snake_case'`
  in both `drizzle.config.ts` and the `drizzle()` client so TS camelCase props map to
  snake_case columns automatically.
- **Roles**: membership roles are `owner | farm_manager | storekeeper | worker`, stored in
  Better Auth `member.role` (string). Platform admin is `user.is_platform_admin boolean
  NOT NULL DEFAULT false` — an additionalField on the Better Auth user, NOT a membership.
- **Grades**: pgEnum `produce_grade`: `a, b, c, reject`.
- **Soft delete**: none. Rows are deactivated (`is_active`) where listed; nothing is hard-deleted
  except by platform admin tooling out of scope for v1.

## 2. Better Auth tables (owned by the Better Auth generator)

We use Better Auth latest stable (v1.7.x line as of Oct 2026) with the **phoneNumber** and
**organization** plugins and the Drizzle adapter. **Run `npx @better-auth/cli@latest generate`
and treat its output as authoritative** — the shapes below are from training knowledge and the
docs' prose (field tables would not render in the docs; **UNVERIFIED** at column level).

Expected shapes (UNVERIFIED, re-check against generated file):

- `user`: id (text/uuid PK), name, email (unique), email_verified bool, image?,
  created_at, updated_at, + phoneNumber plugin: `phone_number` (unique, nullable),
  `phone_number_verified` (bool, nullable), + our additionalFields:
  **`is_platform_admin` boolean NOT NULL default false**.
- `session`: id, user_id FK, token (unique), expires_at, ip_address?, user_agent?,
  created_at, updated_at, + organization plugin: **`active_organization_id`** (nullable).
- `account`: id, user_id FK, account_id, provider_id, access_token?, refresh_token?,
  id_token?, access_token_expires_at?, refresh_token_expires_at?, scope?, password?,
  created_at, updated_at. (Email+password credentials live here, provider `credential`.)
- `verification`: id, identifier, value, expires_at, created_at, updated_at. Phone OTPs are
  stored here by the plugin (identifier keyed to the phone number) — UNVERIFIED, confirm.
- `organization`: id (PK — **this is our tenant id**), name, slug (unique), logo?, metadata?,
  created_at. We do NOT add business columns here; org-level business state lives in
  `subscriptions` and other business tables keyed by organisation_id.
- `member`: id, organization_id FK, user_id FK, role (text — our 4 role strings), created_at.
- `invitation`: id, organization_id, email, role?, status (default pending), expires_at,
  inviter_id. NOTE: our invites are phone-first; we still use this table but put the phone
  number in `email`-adjacent custom field OR invite by phone via our own flow — DECISION:
  v1 invites are created by owner/manager entering a phone number; implement with our own
  lightweight flow if the plugin's email-centric invitation fights us: table
  `staff_invites` (below) is the fallback. Build plugin-first; add `staff_invites` only if needed.

Config decisions to document in code: `generateId: 'uuid'` (pg generates UUIDs);
`signUpOnVerification.getTempEmail = (phone) => `${phone}@placeholder.greenledger.local``;
OTP `allowedAttempts: 3`, `expiresIn: 300`, `otpLength: 6`; mock SMS driver returns OTP
`123456` always (never log real OTPs). Better Auth's built-in rate limiting with database
storage adds a `rate_limit` table (key, count, last_request) — enable it; shape UNVERIFIED,
comes from the generator.

ID type note: Better Auth text ids vs our `uuid` columns — if the generator emits `text` PKs
for auth tables, keep them `text` and make business FKs to `organization.id`/`user.id` use the
same `text` type. Do NOT fight the generator. All *business-table* PKs remain `uuid`.

## 3. pgEnums (one place)

| enum | values |
|---|---|
| `base_unit` | kg, g, l, ml, pcs |
| `item_category` | seed, growing_media, fertiliser, agrochemical, packaging, consumable, spare_part |
| `greenhouse_type` | greenhouse, net_house, shade_house, open_field |
| `store_type` | input_store, cold_room, packhouse |
| `cycle_status` | planned, nursery, growing, harvesting, closed |
| `nursery_batch_status` | open, transplanted, discarded |
| `inventory_movement_type` | receive, issue, transfer_in, transfer_out, adjustment, return |
| `produce_movement_type` | harvest_in, transfer_in, transfer_out, sale, waste, adjustment |
| `application_type` | fertigation, spray |
| `produce_grade` | a, b, c, reject |
| `task_status` | open, in_progress, done, cancelled |
| `sale_status` | unpaid, part_paid, paid |
| `scouting_severity` | low, medium, high |
| `expense_category` | labour, power, water, repairs, transport, other |
| `equipment_status` | operational, needs_service, broken, retired |
| `subscription_status` | trialing, active, past_due, cancelled |
| `stock_count_status` | draft, posted |
| `membership_role` (app-level constant, NOT a pgEnum — Better Auth member.role is text) | owner, farm_manager, storekeeper, worker |

## 4. Business tables

Format: columns → constraints → indexes. `org` = `organisation_id uuid NOT NULL` FK
`organization.id` on delete restrict. `ts` = `created_at timestamptz NOT NULL default now()`,
`updated_at timestamptz NOT NULL default now()` (app-maintained). `by(u)` = FK `user.id`.

### 4.1 Farm structure

**sites** — id, org, name text NOT NULL, address text?, ts.
Unique (org, name). Index (org).

**greenhouses** — id, org, site_id FK sites (restrict), name text NOT NULL,
type greenhouse_type NOT NULL default 'greenhouse', area_m2 numeric(10,2) NOT NULL,
plant_capacity int NOT NULL default 0, notes text?, is_active bool NOT NULL default true, ts.
Unique (org, name). Index (org, site_id).

**zones** — id, org, greenhouse_id FK greenhouses (cascade), name text NOT NULL,
position int NOT NULL default 0, ts.
Unique (greenhouse_id, name). Index (org, greenhouse_id).

**stores** — id, org, site_id FK sites (restrict), name text NOT NULL,
type store_type NOT NULL default 'input_store', is_default bool NOT NULL default false, ts.
Unique (org, name). Index (org, site_id).

**greenhouse_assignments** — id, org, user_id FK user (cascade), greenhouse_id FK greenhouses
(cascade), created_at.
Unique (org, user_id, greenhouse_id). Index (org, user_id).
Semantics: workers see/log only assigned greenhouses; owner/manager/storekeeper ignore this table.

### 4.2 Crops

**crops** — id, org, name text NOT NULL, shelf_life_days int NOT NULL (seed: tomato 7,
pepper 10 — editable placeholder per Assumptions), ts.
Unique (org, name).

**varieties** — id, org, crop_id FK crops (restrict), name text NOT NULL,
days_to_first_harvest int NOT NULL (from transplant), harvest_duration_weeks int NOT NULL,
expected_yield_kg_per_plant numeric(6,2) NOT NULL, notes text?, is_active bool default true, ts.
Unique (org, crop_id, name). Index (org, crop_id).

### 4.3 Nursery & cycles

**nursery_batches** — id, org, variety_id FK varieties (restrict), seed_item_batch_id FK
item_batches (set null)?, sow_date date NOT NULL, trays int NOT NULL, cells_per_tray int NOT NULL,
seeds_sown int NOT NULL, germinated int NOT NULL default 0, ready int NOT NULL default 0,
transplanted int NOT NULL default 0, discarded int NOT NULL default 0,
status nursery_batch_status NOT NULL default 'open', notes text?, created_by by(u), ts.
Index (org, status), (org, variety_id).
Germination rate = germinated / seeds_sown (derived, never stored).
CHECK: trays > 0, cells_per_tray > 0, seeds_sown > 0, counts >= 0.

**crop_cycles** — id, org, greenhouse_id FK greenhouses (restrict), zone_id FK zones (set null)?,
variety_id FK varieties (restrict), nursery_batch_id FK nursery_batches (set null)?,
code text NOT NULL (e.g. "GH1-2026-01"), sow_date date?, transplant_date date?,
plants_transplanted int NOT NULL default 0, plants_alive int NOT NULL default 0,
expected_first_harvest date?, expected_end date?, status cycle_status NOT NULL default 'planned',
closed_at timestamptz?, notes text?, ts.
Unique (org, code). Index (org, greenhouse_id, status), (org, status).
`plants_alive` is DENORMALIZED: updated in the same transaction as every `plant_losses` insert
and on transplant. Invariant (tested): plants_alive = plants_transplanted − SUM(plant_losses.count).
`expected_first_harvest` = transplant_date + variety.days_to_first_harvest (stored at transplant,
recomputed if transplant_date edited). `expected_end` = expected_first_harvest +
variety.harvest_duration_weeks * 7 days.

**plant_losses** `[offline]` — id, org, crop_cycle_id FK crop_cycles (cascade), date date NOT NULL,
count int NOT NULL CHECK (count > 0), cause text NOT NULL (free text; UI offers pest/disease/
physical/heat/other), notes text?, created_by by(u), created_at.
Index (org, crop_cycle_id, date).

**scouting_logs** `[offline]` — id, org, crop_cycle_id FK crop_cycles (cascade), date date NOT NULL,
pest_or_disease text NOT NULL, severity scouting_severity NOT NULL, photo_file_id FK files
(set null)?, action_taken text?, created_by by(u), created_at.
Index (org, crop_cycle_id, date).

### 4.4 Items, suppliers, batches, receipts

**items** — id, org, name text NOT NULL, category item_category NOT NULL,
base_unit base_unit NOT NULL, reorder_level numeric(14,3) NOT NULL default 0,
active_ingredient text? (agrochemicals), phi_days int? (pre-harvest interval, agrochemicals),
rei_hours int? (re-entry interval, agrochemicals), n_pct numeric(5,2)?, p_pct numeric(5,2)?,
k_pct numeric(5,2)? (fertilisers), is_active bool NOT NULL default true, notes text?, ts.
Unique (org, name). Index (org, category).
CHECK: category = 'agrochemical' OR (phi_days IS NULL AND rei_hours IS NULL) — optional; at
minimum validate in Zod.

**suppliers** — id, org, name text NOT NULL, phone text?, email text?, notes text?, ts.
Unique (org, name).

**item_batches** — id, org, item_id FK items (restrict), supplier_id FK suppliers (set null)?,
batch_number text NOT NULL, expiry_date date?, unit_cost_kobo numeric(16,6) NOT NULL default 0
(kobo per base unit — RATE, see §1), received_at timestamptz NOT NULL default now(), ts.
Unique (org, item_id, batch_number). Index (org, item_id), (org, expiry_date).
No store column: location is derived from movements (a batch can sit in several stores after
transfers). The spec's "store" on the batch is the receiving store, recorded by the receive
movement. Spec's FEFO: "issued earliest-expiry first" — proposal = batch with stock in the
source store, MIN(expiry_date NULLS LAST), tie-break oldest received_at.

**receipts** — id, org, supplier_id FK suppliers (restrict), store_id FK stores (restrict),
reference text? (supplier invoice no), received_at timestamptz NOT NULL default now(),
received_by by(u), total_cost_kobo bigint NOT NULL default 0 (stored sum of lines), notes?, ts.
Index (org, received_at), (org, supplier_id).

**receipt_lines** — id, org, receipt_id FK receipts (cascade), item_id FK items (restrict),
item_batch_id FK item_batches (restrict), quantity numeric(14,3) NOT NULL CHECK (> 0),
unit_cost_kobo numeric(16,6) NOT NULL, line_cost_kobo bigint NOT NULL.
Index (receipt_id), (org, item_id).
Receiving flow (one transaction): upsert/create item_batch → insert receipt + lines → insert
`receive` movement per line.

### 4.5 Inventory movements & counts

**inventory_movements** `[offline]` **APPEND-ONLY** — id, org, item_id FK items (restrict)
(denormalized copy of batch's item for fast per-item sums), item_batch_id FK item_batches
(restrict), store_id FK stores (restrict), type inventory_movement_type NOT NULL,
quantity numeric(14,3) NOT NULL (SIGNED), greenhouse_id FK (set null)?, crop_cycle_id FK
(set null)?, application_id FK applications (set null)?, receipt_line_id FK (set null)?,
stock_count_id FK stock_counts (set null)?, transfer_id uuid? (same value on the paired
transfer_out/transfer_in rows), reason text? (required in app for adjustment/return/override),
performed_by by(u), performed_at timestamptz NOT NULL default now(), created_at.
CHECK: (type IN ('receive','transfer_in','return') AND quantity > 0) OR
(type IN ('issue','transfer_out') AND quantity < 0) OR (type = 'adjustment' AND quantity <> 0).
Indexes: (org, item_batch_id, store_id), (org, item_id), (org, store_id),
(org, crop_cycle_id), (org, performed_at), (transfer_id).
Stock on hand(batch, store) = SUM(quantity) over (item_batch_id, store_id). Posting an
outbound movement runs in ONE transaction: `SELECT ... FOR UPDATE` on the batch's movement
scope is not possible on an append-only table — instead lock the parent `item_batches` row
(`SELECT id FROM item_batches WHERE id = $1 FOR UPDATE`), then compute SUM, then insert iff
sufficient. Same pattern for produce via `produce_lots`. **Never allow negative on-hand.**

**stock_counts** — id, org, store_id FK stores (restrict), status stock_count_status NOT NULL
default 'draft', counted_at timestamptz NOT NULL default now(), counted_by by(u),
posted_at timestamptz?, posted_by by(u)?, notes?, ts.
Index (org, store_id, status).

**stock_count_lines** — id, org, stock_count_id FK stock_counts (cascade), item_batch_id FK
item_batches (restrict), counted_quantity numeric(14,3) NOT NULL CHECK (>= 0),
system_quantity numeric(14,3) NOT NULL (snapshot at posting), difference numeric(14,3) NOT NULL.
Unique (stock_count_id, item_batch_id).
Posting creates one `adjustment` movement per non-zero difference, all in one transaction.

### 4.6 Recipes & applications

**recipes** — id, org, name text NOT NULL, type application_type NOT NULL,
description text?, is_active bool default true, ts. Unique (org, name).

**recipe_lines** — id, org, recipe_id FK recipes (cascade), item_id FK items (restrict),
quantity_per_1000l numeric(14,3) NOT NULL CHECK (> 0).
Unique (recipe_id, item_id).

**applications** `[offline]` — id, org, greenhouse_id FK (restrict), crop_cycle_id FK (restrict),
type application_type NOT NULL, recipe_id FK recipes (set null)?, water_volume_litres
numeric(10,1) NOT NULL CHECK (> 0), applied_at timestamptz NOT NULL, operator_id by(u),
entry_safe_at timestamptz? (spray: applied_at + MAX(rei_hours) among items; fertigation: null),
harvest_safe_date date? (spray: Lagos date of applied_at + MAX(phi_days); fertigation: null),
notes?, created_at.
Index (org, greenhouse_id, applied_at), (org, crop_cycle_id).
Posting scales recipe lines by water_volume_litres/1000, FEFO-selects batches, inserts `issue`
movements (negative) linked by application_id — one transaction with batch row locks.

**application_items** — id, org, application_id FK applications (cascade), item_id FK (restrict),
item_batch_id FK (restrict), quantity numeric(14,3) NOT NULL CHECK (> 0),
phi_days_snapshot int?, rei_hours_snapshot int? (label values AT application time — the spray
record must not drift when the item master is edited).
Index (application_id), (org, item_id).

### 4.7 Harvests & produce

**harvests** `[offline]` — id, org, greenhouse_id FK (restrict), crop_cycle_id FK (restrict),
harvested_at timestamptz NOT NULL, harvested_by by(u), phi_override bool NOT NULL default false,
phi_override_reason text?, phi_override_by by(u)?, notes?, created_at.
Index (org, crop_cycle_id, harvested_at), (org, greenhouse_id).
CHECK: phi_override = false OR (phi_override_reason IS NOT NULL AND phi_override_by IS NOT NULL).

**harvest_lines** — id, org, harvest_id FK harvests (cascade), grade produce_grade NOT NULL,
crates numeric(8,2) NOT NULL default 0, kg numeric(14,3) NOT NULL CHECK (> 0).
Unique (harvest_id, grade).

**produce_lots** — id, org, crop_id FK crops (restrict), variety_id FK varieties (restrict),
grade produce_grade NOT NULL, harvest_id FK harvests (set null)?, harvested_at timestamptz NOT NULL,
best_before_date date NOT NULL (harvest Lagos date + crops.shelf_life_days; editable), ts.
Index (org, grade, best_before_date), (org, harvested_at).
One lot per harvest_line; initial stock enters via a `harvest_in` produce_movement into the
chosen store (default: packhouse). On-hand kg per (lot, store) = SUM(produce_movements.kg).

**produce_movements** `[offline]` **APPEND-ONLY** — id, org, produce_lot_id FK produce_lots
(restrict), store_id FK stores (restrict), type produce_movement_type NOT NULL,
kg numeric(14,3) NOT NULL (SIGNED), sale_line_id FK sale_lines (set null)?,
waste_reason text? (required in app when type='waste'), transfer_id uuid?,
performed_by by(u), performed_at timestamptz NOT NULL default now(), created_at.
CHECK: (type IN ('harvest_in','transfer_in') AND kg > 0) OR
(type IN ('transfer_out','sale','waste') AND kg < 0) OR (type='adjustment' AND kg <> 0).
Indexes: (org, produce_lot_id, store_id), (org, store_id), (org, performed_at), (sale_line_id).
FIFO rule: sales allocate from lots with stock, ordered oldest harvested_at first.

### 4.8 Customers & sales

**customers** — id, org, name text NOT NULL, phone text?, email text?, notes?, ts.
Unique (org, name).

**sales** — id, org, customer_id FK customers (restrict), invoice_number text NOT NULL
(format "INV-000123", per-org sequence via `counters`), sale_date date NOT NULL,
status sale_status NOT NULL default 'unpaid', total_kobo bigint NOT NULL default 0,
amount_paid_kobo bigint NOT NULL default 0, notes?, created_by by(u), ts.
Unique (org, invoice_number). Index (org, sale_date), (org, status), (org, customer_id).
status is maintained: paid when amount_paid >= total, part_paid when 0 < paid < total.
Receivables ageing buckets (report, derived): 0-7, 8-14, 15-30, >30 days since sale_date on
sales with status != 'paid'.

**sale_lines** — id, org, sale_id FK sales (cascade), crop_id FK crops (restrict),
grade produce_grade NOT NULL, kg numeric(14,3) NOT NULL CHECK (> 0), crates numeric(8,2)?,
price_basis text NOT NULL default 'per_kg' ('per_kg' | 'per_crate'),
unit_price_kobo bigint NOT NULL, line_total_kobo bigint NOT NULL.
Index (sale_id).
Posting a sale allocates FIFO lots → negative `sale` produce_movements with sale_line_id,
one transaction, lot rows locked.

**payments_received** — id, org, sale_id FK sales (restrict), amount_kobo bigint NOT NULL
CHECK (> 0), method text NOT NULL default 'cash' (cash|transfer|other), received_at timestamptz
NOT NULL default now(), received_by by(u), notes?.
Index (org, sale_id), (org, received_at).

**counters** — id, org, key text NOT NULL ('invoice' | 'delivery_note'), value bigint NOT NULL
default 0. Unique (org, key). Increment with `UPDATE ... SET value = value + 1 RETURNING value`
inside the posting transaction.

### 4.9 Equipment & maintenance

**equipment** — id, org, name text NOT NULL, category text NOT NULL (pump|tank|dosing_unit|
sprayer|cover|net|irrigation|other — app constant, not pgEnum), site_id FK (set null)?,
greenhouse_id FK (set null)?, location_note text?, serial_number text?, purchase_date date?,
cost_kobo bigint NOT NULL default 0, status equipment_status NOT NULL default 'operational',
notes?, ts. Index (org, status).

**maintenance_schedules** — id, org, equipment_id FK equipment (cascade), name text NOT NULL,
interval_days int NOT NULL CHECK (> 0), last_done_date date?, next_due_date date NOT NULL,
is_active bool default true, ts. Index (org, next_due_date) WHERE is_active.
On logging work against a schedule: last_done_date = done date, next_due_date = done +
interval_days (same transaction).

**maintenance_logs** — id, org, equipment_id FK equipment (restrict), schedule_id FK
maintenance_schedules (set null)?, done_date date NOT NULL, description text NOT NULL,
cost_kobo bigint NOT NULL default 0, done_by by(u)?, notes?, created_at.
Index (org, equipment_id, done_date).

### 4.10 Expenses, climate, tasks

**expenses** — id, org, category expense_category NOT NULL, amount_kobo bigint NOT NULL
CHECK (> 0), incurred_date date NOT NULL, site_id FK (set null)?, crop_cycle_id FK (set null)?,
greenhouse_id FK (set null)?, description text?, created_by by(u), ts.
Index (org, incurred_date), (org, crop_cycle_id).
Profitability: expense is attributed to a cycle when crop_cycle_id set; site/org-level
expenses are NOT allocated across cycles in v1 (report shows them separately).

**climate_readings** `[offline]` — id, org, greenhouse_id FK (cascade), recorded_at timestamptz
NOT NULL, temperature_c numeric(5,2)?, humidity_pct numeric(5,2)?, ec_ms_cm numeric(6,3)?,
ph numeric(4,2)?, recorded_by by(u), created_at.
CHECK: at least one of the four readings NOT NULL. Index (org, greenhouse_id, recorded_at).

**tasks** `[offline — status updates too]` — id, org, title text NOT NULL, description?,
greenhouse_id FK (set null)?, crop_cycle_id FK (set null)?, assigned_to by(u)?,
due_date date?, status task_status NOT NULL default 'open', completed_at timestamptz?,
completed_by by(u)?, created_by by(u), ts.
Index (org, status, due_date), (org, assigned_to, status).

### 4.11 Notifications, audit, files

**notifications** — id, org, user_id by(u) NOT NULL, type text NOT NULL (low_stock|expiry_60|
expiry_30|expired|produce_best_before|maintenance_due|task_due|trial_ending|payment_failed|
subscription_read_only), title text NOT NULL, body text?, entity_type text?, entity_id uuid?,
read_at timestamptz?, created_at.
Index (org, user_id, read_at), (org, created_at).
Fan-out: pg-boss jobs create one row per owner/manager (and storekeeper for stock alerts).
Dedupe rule: don't re-create an unread notification with same (org, type, entity_id).

**audit_log** **APPEND-ONLY** — id, org uuid? (nullable — platform-admin actions),
user_id by(u)?, action text NOT NULL ("item.create", "harvest.phi_override", ...),
entity_type text NOT NULL, entity_id uuid?, before jsonb?, after jsonb?, reason text?
(overrides/approvals), created_at.
Index (org, created_at desc), (org, entity_type, entity_id).

**files** — id, org, storage_key text NOT NULL (adapter key), filename text NOT NULL,
content_type text NOT NULL, size_bytes int NOT NULL, uploaded_by by(u), created_at.
Index (org).

### 4.12 Billing & platform

**plans** — id, code text NOT NULL unique ('starter'|'growth'|'estate'), name text NOT NULL,
max_greenhouses int NOT NULL, monthly_price_kobo bigint NOT NULL,
paystack_plan_code text?, is_active bool default true, ts. NO org column (global).
Seed: starter (up to 5 GH, ₦25,000), growth (up to 20, ₦60,000), estate (up to 50, ₦120,000)
— placeholder prices per Assumptions.

**subscriptions** — id, org UNIQUE, plan_id FK plans (restrict), status subscription_status
NOT NULL default 'trialing', trial_ends_at timestamptz NOT NULL (org creation + 14 days),
current_period_end timestamptz?, paystack_customer_code text?, paystack_subscription_code text?,
ts. Index (status).
**Read-only rule** (enforced in a single helper used by every mutating action):
read_only ⇔ (status='trialing' AND trial_ends_at < now()) OR status IN ('past_due','cancelled').
Platform admin can override via subscriptions edit. Org data is NEVER deleted.

**webhook_events** — id, provider text NOT NULL default 'paystack', event_type text NOT NULL,
external_id text NOT NULL (Paystack event id — idempotency), payload jsonb NOT NULL,
processed_at timestamptz?, error text?, created_at.
Unique (provider, external_id). NO org column (resolved during processing).

### 4.13 Offline sync

**client_mutations** — id uuid PK (THE client-generated mutation id), org, user_id by(u),
kind text NOT NULL ('harvest.create'|'application.create'|'stock.issue'|'plant_loss.create'|
'scouting.create'|'climate_reading.create'|'task.update_status'), payload jsonb NOT NULL,
status text NOT NULL ('applied'|'failed'), result jsonb?, error text?, applied_at timestamptz
NOT NULL default now().
Index (org, user_id, applied_at).
Idempotency contract: sync endpoint inserts this row FIRST (ON CONFLICT (id) DO NOTHING);
if the row already existed, return the stored result WITHOUT re-applying. Replaying an offline
record twice creates exactly one business row (Definition-of-Done test). Belt-and-braces: the
business rows themselves also use client UUIDs, so a replay that slipped past would still hit
a PK conflict.

No CSV-import staging table: import preview is stateless (parse in the action, return row
errors; commit inserts on confirm).

## 5. Derived-state rules (never stored unless listed)

- **Input stock on hand** (batch, store) = SUM(inventory_movements.quantity). Per item =
  SUM over its batches. Stock value = Σ (on-hand(batch) × item_batches.unit_cost_kobo),
  rounded to kobo at display.
- **Produce on hand** (lot, store) = SUM(produce_movements.kg). Age = now − harvested_at.
- **Plants alive** = crop_cycles.plants_alive (denormalized; invariant vs plant_losses).
- **Greenhouse entry-safe**: NOT entry-safe while EXISTS application in that greenhouse with
  entry_safe_at > now(). Status shows MAX(entry_safe_at).
- **Cycle harvest-safe**: NOT harvest-safe while EXISTS application for that cycle with
  harvest_safe_date > today (Lagos). Status shows MAX(harvest_safe_date). Harvest form warns
  and requires manager override (role owner|farm_manager + reason) when violated.
- **Harvest forecast** (per week, per cycle): plants_alive × variety.expected_yield_kg_per_plant
  ÷ harvest_duration_weeks, for each of the `harvest_duration_weeks` ISO weeks starting the week
  of expected_first_harvest. Farm forecast = Σ cycles. Compare to Σ harvest_lines.kg per week.
- **Cycle profitability** = revenue (Σ sale_lines.line_total allocated via produce_movements →
  lots → harvests → cycle) − input cost (Σ |issue movements| × batch unit_cost for the cycle)
  − Σ expenses with crop_cycle_id. Document in report that unallocated org-level expenses are
  excluded.
- **Receivables ageing**: buckets 0-7 / 8-14 / 15-30 / >30 days on unpaid balance
  (total − paid) grouped by customer.
- **Reorder flag**: on-hand(item) ≤ items.reorder_level. **Expiry alerts**: batches with
  on-hand > 0 and expiry_date within 60/30 days or past. Expired batches cannot be issued
  without manager override (reason → movement.reason + audit row).

## 6. Seed data requirements (Definition of Done demo farm)

One org "Demo Farms Ltd" (slug demo-farms), subscription trialing (trial_ends_at = seed + 14d),
plan growth. Platform admin user separate (is_platform_admin, no membership).

- Users: +2348010000001 Owner "Ada Obi" (owner), ...002 "Musa Bello" (farm_manager),
  ...003 "Chinedu Eze" (storekeeper), ...004 "Blessing Ola" (worker, assigned GH1-GH3).
  All with email+password fallback (owner@demo.farm / Demo1234! etc). OTP mock = 123456.
- Structure: 1 site "Main Farm, Ogun State"; 6 greenhouses GH1..GH6 (4 greenhouse, 2 net_house,
  ~480 m², capacity ~1,100 each); zones A/B per greenhouse; stores: Input Store (default),
  Cold Room, Packhouse.
- Crops: Tomato (shelf 7d) + varieties Padma F1, Cobra F1 (yield ~4.5 kg/plant, 75d to first
  harvest, 10 harvest weeks); Pepper (shelf 10d) + varieties California Wonder (bell),
  Habanero Red, Tatashe, Chilli Long Slim (~2.0 kg/plant, 70d, 12 weeks).
- Items: 40 across all 7 categories; ≥6 agrochemicals with real-ish PHI/REI label values
  (e.g. lambda-cyhalothrin PHI 7d REI 24h; mancozeb PHI 7d REI 24h; abamectin PHI 7d REI 12h;
  copper oxychloride PHI 3d REI 24h; imidacloprid PHI 14d REI 12h; sulphur PHI 1d REI 24h);
  ≥8 fertilisers with NPK (e.g. CalNit 15.5-0-0, MKP 0-52-34, NPK 20-20-20, urea 46-0-0);
  seeds, cocopeat, crates, nylon, drip spares, gloves. Each item 1-3 batches with varied
  expiries (some <30d, ≥1 expired) → receipts from 4 suppliers, ~70 batches total.
- Nursery: 2 closed transplanted batches (history for the 4 cycles) + 1 open batch.
- Cycles: 4 active (GH1 Padma growing→harvesting, GH2 Cobra harvesting, GH3 California Wonder
  harvesting, GH4 Habanero growing), transplant dates 10-14 weeks ago; plants ~1,000 each;
  plant_losses sprinkled (alive ≈ 950-990). 2 planned cycles (GH5, GH6) + 1 closed historic.
- 10 weeks of activity (write a deterministic generator, seeded RNG, running week by week):
  weekly fertigation per active cycle (2 recipes: "Veg Feed", "Fruit Feed"), bi-weekly sprays
  alternating chemicals (sets entry/harvest-safe windows; at least one PHI-override harvest
  with reason), 2-3 harvests/week for harvesting cycles with grade split ~55/25/12/8 →
  produce lots, ~2 sales/week to 5 customers (Mile 12 trader, 2 supermarkets, hotel, exporter)
  at ₦1,200-2,000/kg A-grade; some waste rows; ~30% sales unpaid/part-paid for ageing.
  Expenses weekly (labour, power/diesel, water); climate readings ~3/week/GH; ~15 tasks mixed
  states; 8 equipment rows + 3 schedules (one overdue); a few stock counts incl. 1 posted with
  differences.
- Row-count ballpark: ~70 item_batches, ~25 receipts, ~900 inventory_movements, ~40
  applications + ~120 application_items, ~90 harvests + ~250 harvest_lines + lots, ~700
  produce_movements, ~20 sales + ~45 sale_lines + ~25 payments, ~60 expenses, ~180 climate
  readings, ~40 notifications. Seed must run through the SAME service functions as the app
  (so invariants hold), not raw inserts — except Better Auth users via its server API.

## 7. Open questions / notes for implementer

1. Better Auth column shapes (§2) — regenerate and reconcile; if generator emits `text` ids,
   business FKs to organization/user follow suit.
2. Invitation flow: try the organization plugin's invitation with email; if phone-first invites
   fight it, add `staff_invites` (org, phone, role, status, invited_by, expires_at) — do not
   build it pre-emptively.
3. pg triggers blocking UPDATE/DELETE on the two movement tables: optional hardening, skip if
   time-pressed (tests cover the invariant).
4. All cross-tenant uniqueness is (org, …) — never global (two farms can both have "Input Store").
5. gen_random_uuid() needs pg 13+ (we're on PG 18 dev / pg 16+ in Docker — fine, no extension).
