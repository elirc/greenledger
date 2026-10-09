# Brief P6-D — Billing (Paystack mock-first), read-only lockout, platform admin, notifications

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§2 Paystack facts, §3
read-only, §7 payments adapter, §8 jobs, §12 notifications), `docs/DATA-MODEL.md` (§4.11,
§4.12), `docs/DECISIONS.md` (§5 billing state in subscriptions). Imitate `src/modules/suppliers/**`.
Foundation (read, never edit): `src/adapters/payments/**` (createCheckout, verifyWebhook,
MOCK_PAYSTACK_SECRET, hmac helpers), `src/lib/notify.ts` (orchestrator pre-write),
`src/lib/jobs.ts`, `src/worker/jobs/index.ts` registry (you may edit ONLY the entries for
JOBS.expiryScan, JOBS.reorderScan, JOBS.bestBeforeScan, JOBS.billingCheck, JOBS.notifyDispatch).

## You own
- `src/modules/billing/` (schema.ts, queries.ts, actions.ts, components/)
- `src/app/(app)/settings/billing/**`
- `src/app/billing/checkout-mock/**` (mock Paystack hosted page — OUTSIDE (app) group,
  minimal page: shows plan + amount, "Pay now" button that signs a charge.success +
  subscription.create event with the mock secret and POSTs them to the webhook, then
  redirects to the callback)
- `src/app/api/webhooks/paystack/route.ts` (raw body → verifyWebhook → store webhook_events
  unique (provider, external_id) → process: update subscriptions status/period/codes →
  notifyRole on failures; 200 fast; idempotent)
- `src/modules/notifications/` (queries.ts, actions.ts markRead, components/bell +
  notification list sheet) + EDIT `src/components/shell/app-shell.tsx` ONLY to mount the
  bell in the header slot placeholder
- `src/components/shell/read-only-banner.tsx` + EDIT `src/app/(app)/layout.tsx` ONLY to
  render it (server-side org status fetch is already available via guard — read the layout
  first; keep the diff minimal)
- `src/worker/jobs/{expiry-scan,reorder-scan,best-before-scan,billing-check,notify-dispatch}.ts`
- `src/app/(platform)/platform/**` + `src/modules/platform/` (queries/actions)
- `tests/integration/billing.test.ts`
- `src/db/seed/09-notifications.ts` (a few seeded unread notifications) + index wiring

## Tasks
1. **Billing page** (`/settings/billing`, owner only): current plan card, subscription
   status + trial countdown (TRIAL_WARN_DAYS), plan picker (3 seeded plans, greenhouse
   limits), "Subscribe / Change plan" → `payments.createCheckout` → redirect to its url
   (mock: /billing/checkout-mock). After webhook lands, page reflects active status +
   period end. Greenhouse-limit note: farm exceeding the plan's max shows a warning (no
   hard block in v1).
2. **Webhook route**: EXACTLY per ARCHITECTURE §2 — raw text body, x-paystack-signature
   HMAC-SHA512 timing-safe verify BEFORE parse, store event (ON CONFLICT DO NOTHING →
   200), handle subscription.create / charge.success (activate; set period end +30d),
   invoice.payment_failed (past_due + notify), subscription.disable (cancelled). Org
   resolution via metadata.orgId you send in createCheckout.
3. **Read-only lockout**: `billing-check` job daily — trials ending in ≤3d → notify owner;
   expired trial / past_due → subscriptions stay as-is (status already computed by guard;
   job's role is notifications + flipping trialing→past_due? NO — keep DATA-MODEL §4.12
   predicate: guard computes read_only from trial_ends_at; job only notifies). Banner
   component: amber "Trial ended — GreenLedger is read-only. Renew to continue" linking
   billing; mutations already blocked by assertWritable (verify by testing one action in
   billing.test.ts with an expired-trial org).
4. **Scan jobs**: expiry (60/30/expired buckets → notifyRole owner+manager+storekeeper,
   dedup `exp:<batchId>:<bucket>`), reorder (`reorder:<itemId>` while below), best-before
   (produce lots ≤2d / past, `bb:<lotId>:<bucket>`), notify-dispatch (per ARCHITECTURE §12:
   urgent types → email+sms adapters; mock adapters just log/push arrays).
5. **Notifications UI**: bell with unread count in shell header, sheet listing (icon per
   type, title, body, link, time, mark-read on tap + mark-all).
6. **Platform admin** (`/platform`, requirePlatformAdmin, its own minimal layout — NOT the
   farm shell): orgs list (name, plan, status, greenhouses, users, created), org detail
   (subscription editing: extend trial, change status — audited with org=null actor org),
   plans CRUD (price in kobo), usage counts, cross-org audit log (filterable, latest 200),
   system health card (DB ok, last job runs from pgboss schema if cheap, else omit).
7. **`tests/integration/billing.test.ts`**: webhook signature verify (valid/invalid/replay
   → single processing), subscription activation flow updates status+period, expired-trial
   org: a mutating action returns READ_ONLY and reads still work, platform admin queries
   cross org boundaries but requirePlatformAdmin blocks non-admins.

Check commands: `pnpm exec tsc --noEmit` (your files only) + `pnpm exec eslint <your files>`.
Report files, exact commands + real exit codes, assumptions, out-of-ownership needs.
