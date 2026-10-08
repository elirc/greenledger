# GreenLedger — Implementation Architecture

Status: binding conventions for all builders. If a builder needs a convention not covered
here, STOP and ask the orchestrator — do not invent one.

Dev environment reality: Windows 11, no Docker locally (compose files are authored and must
be correct, but verified only natively), Postgres 18 on `localhost:5432`
(`postgres`/`postgres`), DBs `greenledger_dev` and `greenledger_test`. Node 22, pnpm 9.

---

## 1. Directory layout

Single Next.js app (no monorepo). Feature logic lives in `src/modules/*`; `src/app` route
files stay thin (fetch via module queries, render module components).

```
src/
  app/
    (auth)/sign-in, (auth)/verify, (auth)/accept-invite   # public auth screens
    (app)/...            # authenticated farm app (see route map §5); layout.tsx = shell+nav
    (platform)/platform/...  # platform admin (isPlatformAdmin only)
    api/
      auth/[...all]/route.ts      # Better Auth handler
      sync/route.ts               # offline sync endpoint (POST)
      webhooks/paystack/route.ts  # raw-body webhook
      pdf/[doc]/route.ts          # PDF streams (label, delivery-note, invoice, spray-record)
      export/[report]/route.ts    # ExcelJS streams
      uploads/[...path]/route.ts  # serves local-disk storage driver files (dev)
    manifest.ts  sw.ts            # PWA (Serwist)
  modules/
    <feature>/                    # store, nursery, cycles, applications, harvest, produce,
                                  # sales, equipment, tasks, readings, dashboard, reports,
                                  # setup, billing, platform, sync
      actions.ts     # 'use server' mutations only
      queries.ts     # server-only reads (price redaction enforced HERE)
      components/    # feature components (client or server)
      logic.ts       # pure functions (FEFO pick, recipe scaling, forecast...) — unit-tested
  db/
    index.ts         # pg Pool + drizzle instance (server-only)
    schema/          # one file per domain + auth.ts (Better Auth tables); barrel index.ts
    seed.ts          # demo farm seed (pnpm db:seed)
  lib/
    auth.ts          # betterAuth() config (server)
    auth-client.ts   # createAuthClient + plugins
    guard.ts         # requireMember / requirePlatformAdmin / assertWritable
    action.ts        # defineAction() wrapper + ActionResult<T>
    audit.ts         # writeAudit(tx, ctx, {...})
    money.ts units.ts dates.ts ids.ts   # §11
    jobs.ts          # pg-boss send/schedule helpers (shared web+worker)
    offline/         # Dexie db, outbox helpers, useOutbox hooks (client)
  adapters/
    sms/ email/ payments/ storage/      # index.ts picks driver by env; mock.ts; <real>.ts
  components/
    ui/              # shadcn/ui generated
    shell/           # app shell, bottom nav, page header
    common/          # EmptyState, ErrorState, LoadingList, StatusBadge, QtyInput, MoneyText,
                     #  QrScanner, OfflineBadge, ConfirmDialog, DataTable (TanStack wrapper)
  worker/
    index.ts         # pg-boss bootstrap + job handlers (run with tsx)
    jobs/*.ts
tests/
  unit/              # vitest, pure logic — no DB
  integration/       # vitest, hits greenledger_test via direct action/query calls
  e2e/               # Playwright
docs/  drizzle/ (migrations)  agents/ (briefs)
```

Rules: `db`, `modules/*/queries.ts|actions.ts`, `lib/guard|audit|jobs` import
`server-only`. Client components never import from `src/db`. Path alias `@/*`.

---

## 2. External API facts (researched 2026-10-08)

### Better Auth — phoneNumber plugin (docs: better-auth.com/docs/plugins/phone-number)
- Server: `phoneNumber({ sendOTP: ({ phoneNumber, code }, ctx) => {...}, otpLength: 6, expiresIn: 300, allowedAttempts: 3, signUpOnVerification: { getTempEmail: (p) => ..., getTempName }, requireVerification, callbackOnVerification })`.
- Client: `phoneNumberClient()`; `authClient.phoneNumber.sendOtp({ phoneNumber })`,
  `authClient.phoneNumber.verify({ phoneNumber, code })`. (Prose in docs says
  `sendVerificationCode`; the real method is `sendOtp`.)
- Server API: `auth.api.sendPhoneNumberOTP({ body })`, `auth.api.verifyPhoneNumber({ body })`.
- Email+password: core `emailAndPassword: { enabled: true }`.
- Our `sendOTP` calls the SMS adapter. Mock driver logs the code; mock OTP "always 123456"
  is implemented by a custom `verifyOTP` override when `AUTH_MOCK=1` (returns
  `code === '123456'`), plus sendOTP no-op. See §7.

### Better Auth — organization plugin (docs: better-auth.com/docs/plugins/organization)
- Server config: `organization({ ac, roles, creatorRole: 'owner', allowUserToCreateOrganization })`.
- Custom roles via `createAccessControl(statement)` then `ac.newRole({...})`; pass `ac` +
  `roles` to BOTH server plugin and `organizationClient`.
- Session carries `activeOrganizationId` (set via `databaseHooks.session.create.before`).
- Server APIs: `auth.api.listOrganizations({ headers })`,
  `auth.api.getFullOrganization({ query, headers })`,
  `auth.api.setActiveOrganization({ body: { organizationId }, headers })`,
  `auth.api.getActiveMember({ headers })`, `auth.api.getActiveMemberRole({ headers })`.
- We use roles: `owner`, `manager`, `storekeeper`, `worker` (custom, defined in
  `src/lib/permissions.ts`). Platform admin is NOT an org role: `user.isPlatformAdmin`
  boolean via `user.additionalFields`.
- The Better Auth `organization` table IS our tenant table — extended with business columns
  (status, trialEndsAt, planId, …). Membership extras (assigned greenhouses) live in our own
  `member_greenhouses` join table keyed by Better Auth `member.id`.

### Serwist (docs: serwist.pages.dev/docs/next/getting-started)
- `npm i @serwist/next` + dev `serwist`. Wrap next.config with
  `withSerwistInit({ swSrc: 'src/app/sw.ts', swDest: 'public/sw.js', disable: dev })`.
- `src/app/sw.ts`: `new Serwist({ precacheEntries: self.__SW_MANIFEST, skipWaiting: true, clientsClaim: true, navigationPreload: true, runtimeCaching: defaultCache, fallbacks: { entries: [{ url: '/~offline', matcher: ({request}) => request.destination === 'document' }] } }).addEventListeners()`.
- tsconfig: types `@serwist/next/typings`, lib `webworker`, exclude `public/sw.js`;
  gitignore `public/sw*`, `public/swe-worker*`. Manifest via `app/manifest.ts`.

### Paystack (webhooks verified via multiple sources; REST shapes from training — UNVERIFIED, re-check paystack.com/docs/api before coding real driver)
- Webhook: header `x-paystack-signature` = HMAC-SHA512 hex of the RAW request body keyed
  with the API secret key (no separate webhook secret). Verify with `crypto.timingSafeEqual`
  on the raw text BEFORE `JSON.parse`. Return 200 fast; deliveries repeat → handler must be
  idempotent (store processed event ids).
- Events we handle: `subscription.create`, `charge.success`, `invoice.create`,
  `invoice.update`, `invoice.payment_failed`, `subscription.disable`, `subscription.not_renew`.
- Flow (UNVERIFIED details): create plan `POST /plan {name, interval: 'monthly', amount}` (amount in kobo);
  subscribe via `POST /transaction/initialize {email, amount, plan, callback_url}` →
  `{authorization_url, reference}`; customer pays on hosted page; `charge.success` +
  `subscription.create` arrive. Base `https://api.paystack.co`, `Authorization: Bearer sk_...`.

### Termii SMS (developer page + SDKs; re-check field casing before real use)
- `POST https://api.ng.termii.com/api/sms/send`, JSON body
  `{ to, from, sms, type: 'plain', channel: 'generic' | 'dnd', api_key }`.
  Response has `message_id`, balance. For OTP delivery to DND-registered Nigerian numbers
  the `dnd` channel is required — make channel an env (`TERMII_CHANNEL`, default `dnd`).

### Resend (training knowledge — UNVERIFIED, confirm at resend.com/docs)
- SDK `new Resend(key)`; `resend.emails.send({ from, to, subject, html })`; or raw
  `POST https://api.resend.com/emails` with Bearer key.

---

## 3. Auth & tenancy

`src/lib/auth.ts` outline:

```ts
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true },
  user: { additionalFields: { isPlatformAdmin: { type: 'boolean', defaultValue: false } } },
  databaseHooks: { session: { create: { before: /* set activeOrganizationId to first membership */ } } },
  plugins: [
    phoneNumber({ sendOTP, ...(isMockAuth ? { verifyOTP: mockVerify } : {}), signUpOnVerification: { getTempEmail: p => `${p.replace(/\D/g,'')}@phone.greenledger.local` } }),
    organization({ ac, roles: { owner, manager, storekeeper, worker }, creatorRole: 'owner' }),
    nextCookies(), // keep LAST — makes Server Action cookie setting work
  ],
})
```

`nextCookies` from `better-auth/next-js` is REQUIRED (last plugin) or sign-in from Server
Actions won't set cookies.

### Request context — the one true guard

```ts
// src/lib/guard.ts
export type Role = 'owner' | 'manager' | 'storekeeper' | 'worker'
export interface Ctx {
  userId: string
  orgId: string
  role: Role
  user: { id: string; name: string; phoneNumber: string | null; isPlatformAdmin: boolean }
  org: { id: string; name: string; status: OrgStatus /* 'trial'|'active'|'read_only' */ }
  assignedGreenhouseIds: string[] | null   // null = unrestricted (non-workers)
  canSeeMoney: boolean                      // role !== 'worker'
}
export async function requireMember(opts?: { roles?: Role[] }): Promise<Ctx>  // throws AuthError('UNAUTHENTICATED'|'FORBIDDEN'|'NO_ORG')
export async function requirePlatformAdmin(): Promise<{ userId: string }>
export function assertWritable(ctx: Ctx): void        // throws 'READ_ONLY' unless status trial|active
export function assertGreenhouse(ctx: Ctx, greenhouseId: string): void // workers: must be assigned
```

Implementation: ONE query joining session → member (role) → organization (+status) →
member_greenhouses. Every `queries.ts` function and every action takes/derives `ctx`; every
SQL statement filters `organisation_id = ctx.orgId` — no exceptions, enforced in review.

Role capability matrix (single source: `src/lib/permissions.ts`, also feeds Better Auth ac):

| capability | owner | manager | storekeeper | worker |
|---|---|---|---|---|
| billing, users/roles, plan | ✓ | – | – | – |
| overrides (PHI harvest, expired issue), costs/expenses, reports | ✓ | ✓ | – | – |
| receive/issue/transfer/count/returns, labels, suppliers | ✓ | ✓ | ✓ | – |
| log harvest/application/loss/scouting/readings, tasks (assigned GH only) | ✓ | ✓ | – | ✓ |
| see prices/costs/sales values | ✓ | ✓ | ✓(input costs) | ✗ NEVER |

### Worker price redaction
Enforced server-side in `queries.ts`: every query function that touches money columns
takes `ctx` and selects cost/price columns ONLY when `ctx.canSeeMoney` (build two explicit
drizzle select objects — never spread full rows). Components receive `number | null` and
render `MoneyText` which hides nulls. Integration test
`tests/integration/redaction.test.ts` calls every exported query as a worker ctx and
asserts the JSON contains no keys matching `/cost|price|amount|value|kobo/i` with non-null
values. New query files MUST be added to that test's registry.

### Read-only lockout (trial expired / payment failed)
`organisation.status = 'read_only'` set by billing webhook/cron. `defineAction` (§4) calls
`assertWritable` for every mutation except billing + auth actions (flag
`{ allowReadOnly: true }`). Reads stay available. Banner in shell when read_only.

---

## 4. Server Action conventions

All mutations are Server Actions in `src/modules/<feature>/actions.ts` ('use server' at
top). Route handlers only for: auth, webhooks, sync, file/PDF/export streams.

```ts
// src/lib/action.ts
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: ErrCode; fieldErrors?: Record<string, string[]> }

export function defineAction<S extends z.ZodType, T>(cfg: {
  name: string                       // 'store.issueStock' — audit action name
  schema: S
  roles?: Role[]
  allowReadOnly?: boolean
  handler: (input: z.infer<S>, ctx: Ctx) => Promise<T>   // throws DomainError(code, msg)
}): (raw: unknown) => Promise<ActionResult<T>>
```

`defineAction` does, in order: `schema.safeParse(raw)` → `requireMember({roles})` →
`assertWritable` → `handler` → map thrown `DomainError`/`AuthError`/zod to `ActionResult`
(never let raw errors leak). Handlers run their own `db.transaction`. NEVER return
redirect(); return result, client navigates.

Worked example (canonical; FEFO issue with lock + no-negative + audit):

```ts
export const issueStock = defineAction({
  name: 'store.issueStock',
  schema: z.object({
    clientId: z.string().uuid(),               // offline idempotency (§6)
    itemId: z.string().uuid(),
    batchId: z.string().uuid().optional(),      // absent → FEFO auto-pick
    storeId: z.string().uuid(),
    quantity: z.number().positive(),            // base units
    greenhouseId: z.string().uuid().optional(),
    cropCycleId: z.string().uuid().optional(),
    override: z.object({ reason: z.string().min(3) }).optional(), // expired-batch issue
  }),
  roles: ['owner', 'manager', 'storekeeper'],
  handler: (input, ctx) => db.transaction(async (tx) => {
    if (await alreadySynced(tx, ctx, input.clientId)) return { duplicate: true }
    const batch = input.batchId
      ? await lockBatch(tx, ctx, input.batchId)                    // SELECT ... FOR UPDATE
      : await pickFefoBatch(tx, ctx, input.itemId, input.storeId)  // earliest expiry, locked
    if (!batch) throw new DomainError('NO_STOCK', 'No stock available')
    if (isExpired(batch) && !input.override) throw new DomainError('EXPIRED_BATCH', ...)
    const onHand = await batchOnHand(tx, ctx, batch.id, input.storeId) // SUM(movements)
    if (onHand < input.quantity) throw new DomainError('INSUFFICIENT_STOCK', ...)
    const [mv] = await tx.insert(inventoryMovements).values({
      organisationId: ctx.orgId, clientId: input.clientId, batchId: batch.id,
      storeId: input.storeId, type: 'issue', quantity: neg(input.quantity),
      greenhouseId: input.greenhouseId, cropCycleId: input.cropCycleId,
      createdBy: ctx.userId,
    }).returning()
    await writeAudit(tx, ctx, { action: 'store.issueStock', entity: 'inventory_movement',
      entityId: mv.id, override: input.override?.reason })
    revalidatePath('/store')
    return { movementId: mv.id, batchId: batch.id }
  }),
})
```

Conventions this fixes for everyone:
- Row locks: `FOR UPDATE` on `item_batches` row before computing on-hand; on-hand is always
  `SUM(inventory_movements.quantity)` — issues/waste/transfers-out are NEGATIVE quantities,
  receives/returns/transfers-in POSITIVE; one `type` enum; corrections = new `adjustment`.
- Stock can never go negative: check inside the same tx as the insert, after the lock.
- Every mutating action writes exactly one audit row per logical event via `writeAudit`.
- Every offline-capable action takes `clientId` (client UUID) — see §6.
- Forms: react-hook-form + zodResolver client-side with the SAME zod schema imported from
  `src/modules/<f>/schema.ts` (schemas live in a shared file importable by client), action
  re-validates server-side.

---

## 5. Route map (all under `(app)` unless noted; mobile-first 360px)

Legend O/M/S/W = roles with access (server-enforced via layout/`requireMember` + per-action).

| Route | Roles | Content |
|---|---|---|
| `/` dashboard | OMSW (worker: tasks + assigned GH cards only, no money) | stat tiles, alerts, week harvest vs forecast, tasks due |
| `/store` | OMS | stock list: on-hand, value(≠W), reorder flag, next expiry; search+category filter |
| `/store/items/[id]` | OMS | item detail, batches table, movements |
| `/store/receive` | OMS | receive form (supplier, lines, batch no, expiry, cost) → print labels CTA |
| `/store/issue` | OMS | issue form; scan button; FEFO proposal |
| `/store/transfer`, `/store/counts`, `/store/counts/[id]`, `/store/returns` | OMS | |
| `/store/suppliers`(+`/[id]`) | OMS | |
| `/store/items/manage`(new/edit) | OM | item CRUD incl. PHI/REI, NPK |
| `/scan` | OMSW | camera scan page → routes to issue/batch/produce lot |
| `/nursery` (+`/new`, `/[id]`) | OMW | nursery batches, germination, transplant action |
| `/greenhouses` | OMSW(assigned) | greenhouse cards: status chips (entry-safe/harvest-safe), cycle, plants alive |
| `/greenhouses/[id]` | OMSW(assigned) | card detail: KPIs (money hidden for W), cycles, readings chart |
| `/cycles` (+`/new`, `/[id]`) | OMW | crop cycles list/detail: losses, scouting, applications, harvests |
| `/cycles/[id]/losses/new`, `/scouting/new` | OMW | |
| `/applications` (+`/new`) | OMW | fertigation/spray log; recipe picker, volume → scaled lines preview |
| `/recipes` (+`/new`, `/[id]`) | OM | |
| `/harvest` | OMW | quick entry: GH → cycle → grade lines (crates+kg); PHI warning + override(M/O) |
| `/produce` | OMS | lots by grade/store, age, best-before; waste entry; FIFO sale source |
| `/sales` (+`/new`, `/[id]`) | OM | sales, delivery note/invoice PDFs, mark paid |
| `/sales/customers`(+`/[id]`), `/sales/receivables` | OM | ageing buckets |
| `/equipment` (+`/new`, `/[id]`) | OMS | register, schedules, log work |
| `/tasks` | OMSW | list + calendar toggle; assign (OM), complete |
| `/readings` (+`/new`) | OMW | per-GH climate/EC/pH entry + Recharts lines |
| `/reports` | OM | hub; each report page has Excel + PDF export buttons |
| `/reports/{profitability,input-use,harvest,waste,stock-valuation,purchases,spray-record}` | OM | |
| `/expenses` (+`/new`) | OM | |
| `/settings/{farm,greenhouses,stores,varieties,users,billing}` | O (users/billing O; farm OM) | |
| `/setup` wizard | O | steps: site → greenhouses → stores → varieties → items → opening stock → done; CSV import at items/stock steps |
| `/billing/checkout-mock` | O | mock Paystack hosted page (mock driver only) |
| `(platform)/platform/{orgs,orgs/[id],plans,health,audit}` | isPlatformAdmin | |
| `(auth)/sign-in` | public | phone → OTP (or email+password toggle) |
| `(auth)/verify` | public | 6-digit OTP input |
| `/~offline` | public | PWA offline fallback |

UI states: every list page ships `loading.tsx` (skeleton via `LoadingList`), `error.tsx`
(ErrorState with retry), and renders `EmptyState` (icon, line, CTA) when zero rows. Touch
targets ≥ 44px (`h-11` min on inputs/buttons). Bottom tab nav (5 slots: Home, Store,
Harvest, Tasks, More) + "More" sheet for the rest; desktop gets sidebar. Money shown with
`MoneyText` only.

---

## 6. Offline sync

Client: Dexie db `greenledger-offline` (src/lib/offline/db.ts):

```ts
outbox: { id: string /* uuid, PK */, kind: OpKind, payload: unknown,
          createdAt: number, attempts: number, lastError?: string,
          status: 'pending' | 'rejected' }
refCache: { key: string /* e.g. 'issue-form-refs' */, data: unknown, fetchedAt: number }
```

Offline-capable ops (`OpKind`): `harvest.create`, `stock.issue`, `application.create`,
`plantLoss.create`, `scouting.create`, `task.complete`, `reading.create`. Each maps 1:1 to
the Server Action's zod schema; `payload` IS the action input (incl. `clientId` = outbox id).

Flow: submit → if `navigator.onLine` call the Server Action directly; on network failure or
offline, enqueue to outbox and show optimistic "pending sync" badge. Flush on `online`
event + app focus + manual button: `POST /api/sync { ops: [{id, kind, payload}] }` →
`{ results: [{ id, status: 'applied'|'duplicate'|'rejected', error? }] }`. Applied/duplicate
→ delete from outbox; rejected → keep with `status:'rejected'` shown in a "Needs attention"
list (`/tasks` badge) — server wins, user re-enters.

Server `/api/sync/route.ts`: authenticates via normal session cookie, then dispatches each
op to the SAME handler functions as the Server Actions (module exports
`handlers: Record<OpKind, (input, ctx) => ...>`) sequentially in order; each wrapped so one
rejection doesn't abort the batch.

Idempotency: table `sync_ops (id uuid PK, organisation_id, kind, user_id, applied_at)`.
Every offline-capable handler calls `alreadySynced(tx, ctx, clientId)` which does
`INSERT ... ON CONFLICT (id) DO NOTHING RETURNING id` as the FIRST statement of its
transaction; no row returned → duplicate → return `{duplicate: true}` without side effects.
(Replaying an offline record twice creates one record — spec test hook.)

PWA: Serwist precache + `defaultCache`; app shell and reference data pages work offline via
runtime cache; form reference data (items, batches summary, greenhouses, cycles, grades)
cached in Dexie `refCache` refreshed on each online visit, so entry forms open offline.

---

## 7. Adapters (`src/adapters`)

```ts
// sms:      send(msg: { to: string; body: string }): Promise<{ id: string }>
// email:    send(msg: { to: string; subject: string; html: string }): Promise<{ id: string }>
// payments: createCheckout(i: { orgId; planCode; email; amountKobo; callbackUrl }) => { url; reference }
//           verifyWebhook(rawBody: string, signature: string | null): boolean
//           parseEvent(rawBody: string): PaystackEvent
// storage:  put(key, data: Buffer, contentType) => { key }; getUrl(key) => string; get(key) => Buffer
```

Driver selection in each `index.ts`: `ADAPTER_SMS=mock|termii`, `ADAPTER_EMAIL=mock|resend`,
`ADAPTER_PAYMENTS=mock|paystack`, `ADAPTER_STORAGE=local|s3`. Mocks: log a single line
`[mock:sms] to=... body=...` AND insert a `notifications` row (channel 'mock') so tests can
assert; payments mock returns `/billing/checkout-mock?ref=...` and that page POSTs a
simulated `charge.success`+`subscription.create` to the webhook route (signed with the mock
secret) — the full billing loop is testable offline. Storage local driver writes
`./storage/<orgId>/<key>` served by `/api/uploads/...` (auth-checked).

Auth mock: `AUTH_MOCK=1` → phoneNumber plugin gets `verifyOTP: ({code}) => code === '123456'`
and sendOTP that only logs. Production guard: `src/lib/env.ts` (imported by
`next.config.ts`, `src/lib/auth.ts`, and `src/worker/index.ts`) validates env with zod and
**throws at startup if `NODE_ENV === 'production' && AUTH_MOCK === '1'`**.

---

## 8. pg-boss (worker)

`src/worker/index.ts`: validate env → `new PgBoss(DATABASE_URL)` → `boss.start()` →
register handlers → `boss.schedule(...)`. Dev: `pnpm worker` = `tsx watch src/worker/index.ts`.

| job | schedule (Africa/Lagos via cron `tz` option) | does |
|---|---|---|
| `scan.expiry` | daily 05:30 | batches expiring ≤60d, ≤30d, expired → notifications (dedup per batch+threshold) |
| `scan.reorder` | daily 05:35 | items with on-hand < reorder_level → notification |
| `scan.bestBefore` | daily 05:40 | produce lots within 2d of best_before / past → notification |
| `scan.maintenance` | daily 05:45 | schedules due within 7d / overdue → notification + task |
| `billing.check` | daily 06:00 | trials ending (notify 3d before), trial ended / payment overdue → set org `read_only` |
| `notify.dispatch` | queue (on insert) | fan out a notifications row to email/SMS adapters per user prefs |

Web enqueues via `src/lib/jobs.ts` (`sendJob(name, data)` — its own PgBoss instance,
`boss.send` only). All scans iterate per-organisation and write `notifications` rows;
`notify.dispatch` handles delivery. Alert thresholds (60/30/2/7 days) live in
`src/lib/alerts.ts` constants.

---

## 9. QR labels & scanning

Payload = URL: `${NEXT_PUBLIC_APP_URL}/scan?t=<batch|lot|equip>&id=<uuid>` (works from any
phone camera app; in-app scanner parses the same). `/scan` page: `BarcodeDetector` when
`'BarcodeDetector' in window` else `@zxing/browser` `BrowserQRCodeReader` on a `<video>`;
on decode → `t=batch` → `/store/issue?batchId=...` (or batch page via "view" toggle),
`t=lot` → produce lot, `t=equip` → equipment. Labels: `GET /api/pdf/label?batchId=` or
`?receiptId=` (sheet of all lines). Layout: A4, 48×25mm cells, 4×11 grid — QR left, right
side: item name, batch no, expiry `dd MMM yyyy`, unit. `qrcode` pkg `toDataURL` embedded in
react-pdf `<Image>`.

---

## 10. PDFs & Excel

Route handlers (never in Server Components): `/api/pdf/[doc]/route.ts` with
`doc ∈ label | delivery-note | invoice | spray-record`, params via query. Use
`renderToBuffer` from `@react-pdf/renderer`; shared primitives in
`src/modules/documents/` (DocHeader with farm name/address, MetaBlock, LinesTable, money
formatting — PDFs are OM-only so money allowed; spray-record includes product, rates, PHI/REI,
entry/harvest-safe times, operator, and subsequent harvest dates per the spec).
Excel: `/api/export/[report]/route.ts` — ExcelJS `workbook.xlsx.writeBuffer()`, one sheet,
header row bold + frozen, column widths set, filename
`greenledger-<report>-<yyyyMMdd>.xlsx` via Content-Disposition. Every report page gets both
buttons wired to these URLs.

---

## 11. Money / units / dates (src/lib)

- **money.ts**: all money INTEGER KOBO (`bigint` column, drizzle `{ mode: 'number' }`).
  `formatNaira(kobo)` → `₦12,345.67` (Intl NumberFormat en-NG, NGN); `nairaToKobo(input: string)` parse helper.
  Workers: values never reach the client (§3), `MoneyText` renders `—` for null.
- **units.ts**: base units `kg | L | pcs` stored in `numeric(14,3)` columns; items declare
  `baseUnit` + `displayUnit` (`g`,`kg`,`mL`,`L`,`pcs`). `toBase(qty, unit)`, `fromBase(qty, unit)`,
  `formatQty(baseQty, item)` (auto g when <1kg etc.). Conversion table only g↔kg (×1000),
  mL↔L (×1000), pcs identity — no cross-dimension.
- **dates.ts**: columns `timestamptz` (UTC); date-only business fields (`expiry_date`,
  `best_before`, `harvest_safe_date`, task due) are `date` columns = Lagos calendar dates.
  Display: `date-fns` + `@date-fns/tz` `TZDate` pinned to `Africa/Lagos` —
  `formatLagos(d, 'dd MMM yyyy HH:mm')`, `todayLagos()` for date comparisons. NEVER
  `toLocaleString` without zone.
- **ids.ts**: `crypto.randomUUID()` wrapper `newId()`; all PKs `uuid` default
  `gen_random_uuid()`.

---

## 12. Notifications & alerts

`notifications` table rows are the in-app feed (bell in shell, unread count). Each row:
org, user (nullable = role-targeted: `target_role`), type (`expiry`,`reorder`,`best_before`,
`maintenance`,`billing`,`sync`,`system`), title, body, link, read_at, dedup_key (unique per
org — scans upsert on dedup_key so daily jobs don't spam). `notify.dispatch` sends
email/SMS via adapters for severities marked urgent (expired batch, read_only, payment
failed). PHI/REI status is NOT a notification: it's computed state on the greenhouse
(`entry_safe_at`, `harvest_safe_date` maintained by application actions) rendered as
red/green chips.

---

## 13. Env & Docker

`.env.example` (authoritative list — keep in sync with src/lib/env.ts zod schema):

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/greenledger_dev
BETTER_AUTH_SECRET=change-me BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_MOCK=1
ADAPTER_SMS=mock ADAPTER_EMAIL=mock ADAPTER_PAYMENTS=mock ADAPTER_STORAGE=local
TERMII_API_KEY= TERMII_SENDER_ID=GreenLedger TERMII_CHANNEL=dnd
RESEND_API_KEY= EMAIL_FROM=no-reply@greenledger.example
PAYSTACK_SECRET_KEY= PAYSTACK_PUBLIC_KEY=
S3_ENDPOINT= S3_BUCKET= S3_ACCESS_KEY_ID= S3_SECRET_ACCESS_KEY= S3_REGION=
STORAGE_DIR=./storage
PGBOSS_SCHEMA=pgboss
```

docker-compose.yml: `db` (postgres:18-alpine, healthcheck pg_isready, volume),
`web` (Dockerfile target web: `pnpm build` → `next start`, depends_on db healthy, env from
.env, port 3000), `worker` (same image, command `pnpm worker:prod` = `tsx src/worker/index.ts`,
depends_on db). One multi-stage Dockerfile (base deps → build → runner with standalone
output). Seed: `docker compose run --rm web pnpm db:seed` (README documents exact order:
up → migrate (`pnpm db:migrate` runs drizzle-kit migrate) → seed). NOTE: compose cannot be
run on the dev box (no Docker) — keep it boring and correct; orchestrator will note this in
README.

---

## 14. Testing conventions

- Unit (tests/unit, vitest `environment: 'node'`): pure logic from `modules/*/logic.ts` —
  FEFO pick, recipe scaling, PHI/REI date math, forecast spread, unit conversion, kobo math,
  profitability. No DB, no mocks of our own modules.
- Integration (tests/integration): run against `greenledger_test`
  (`DATABASE_URL_TEST`); global setup pushes schema (drizzle-kit push) + truncates between
  files; `fileParallelism: false` (one DB). Build ctx objects directly (bypass HTTP). Covers:
  movement-sum invariant after each flow, sync idempotency (replay op twice → one row),
  org isolation (org B cannot read org A via every query fn), worker redaction, override
  audit rows.
- E2E (Playwright, dev server + seeded dev DB): the spec's single long scenario (§Definition
  of done) as one spec file with steps, plus a smoke of each nav destination.
- ONLY the orchestrator runs integration/E2E suites (shared DB). Builders may run
  `pnpm typecheck`, `pnpm lint`, and unit tests on files they own.

---

## 15. Decisions builders must not re-litigate

1. Quantities: positive numbers in forms; movement sign fixed by `type` mapping in one
   helper `signedQty(type, qty)` (receive/return/transfer_in/adjustment_in → +).
2. Transfers = two movement rows (out negative at source store, in positive at dest) sharing
   a `transfer_group` uuid, one tx.
3. Stock counts post differences as `adjustment` movements on approval, never edit history.
4. Produce mirrors inputs exactly: `produce_lots` + signed `produce_movements`
   (in/transfer/sale/waste/adjustment), FIFO by `harvested_at` for sale picking (oldest first).
5. Harvest-safe/entry-safe: stored on `greenhouses` (`entry_safe_at timestamptz`,
   `harvest_safe_date date`) recomputed as GREATEST(existing, new) when an application posts;
   PHI from max PHI-days among items in the application, REI from max REI-hours.
6. Forecast: for each active cycle, weekly kg = plants_alive × variety.expected_yield_kg
   ÷ variety.harvest_weeks, from expected_first_harvest for harvest_weeks weeks; actual =
   SUM(harvest_lines.kg) grouped by ISO week (Lagos).
7. Cycle profitability = revenue(sale_lines of lots from the cycle's harvests)
   − input cost(issued movements valued at batch unit_cost) − expenses(cycle-tagged).
8. Audit log: write via `writeAudit` only; fields org, user, action, entity, entity_id,
   override_reason, diff jsonb (small, optional), created_at. Platform admin reads cross-org.
9. IDs in URLs are uuids; no sequential ints exposed.
10. Dates in forms: native `<input type="date">`/`<input type="datetime-local">` (mobile
    friendly), zod coerce.

## Open items for the foundation builder

- UNVERIFIED (re-check official docs when wiring real drivers; mocks unaffected): Paystack
  REST field names for /plan + /transaction/initialize; Resend SDK current major; Termii
  response schema. Webhook signature scheme IS verified (HMAC-SHA512 raw body, API secret).
- Better Auth drizzle schema: generate with `pnpm dlx @better-auth/cli generate` after
  configuring plugins, then move into `src/db/schema/auth.ts` and extend organization table
  columns there (single source of truth = our schema files).
- Reconcile with docs/DATA-MODEL.md (written in parallel): `sync_ops`, `member_greenhouses`,
  `notifications.dedup_key`, `transfer_group`, greenhouse safety columns, `clientId`
  uniqueness strategy (sync_ops PK, NOT per-table client_id columns).
