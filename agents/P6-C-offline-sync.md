# Brief P6-C — Offline queue (Dexie), PWA wiring into forms, sync idempotency tests

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§6 — THE sync design),
`docs/DECISIONS.md` (§3 sync_ops, §17 handlers), `docs/DATA-MODEL.md` (§4.13).
Foundation (orchestrator pre-wrote — read, never edit): `src/lib/offline/db.ts` (Dexie outbox +
refCache), `src/lib/offline/outbox.ts` (enqueue/flush/useOutboxStatus), `src/app/api/sync/route.ts`
(+ `src/modules/sync/registry.ts` OpKind→handler map), `src/lib/sync-ops.ts` (alreadySynced),
Serwist `src/app/sw.ts` + next.config wiring, `src/components/common/offline-badge.tsx`.

## You own
- `src/modules/sync/registry.ts` — EXTEND the registry with the handlers you extract below
- Handler extractions (move logic, keep behavior identical; actions keep wrapping handlers):
  - `src/modules/stock/handlers.ts` (extract `issueStockHandler` from stock/actions.ts —
    edit stock/actions.ts ONLY to delegate to it)
  - `src/modules/scouting/handlers.ts` (extract from scouting/actions.ts; note the photo is
    NOT offline-capable — the offline path queues scouting WITHOUT photo; handler takes an
    optional pre-uploaded fileId)
  - `src/modules/tasks/handlers.ts` (extract `completeTaskHandler`)
  (losses, applications, harvest, readings, sales already have handlers.ts)
- Offline wiring edits — in each of these forms add the enqueue-on-network-failure path via
  `src/lib/offline/outbox.ts` (submit → try server action → on fetch/network failure enqueue
  + optimistic toast "Saved on this phone — will sync"): harvest quick-entry form, stock
  issue form, application form, plant-loss form, task complete button, climate reading form.
  (Read each form first; your diff in each should be the submit wrapper + pending badge only.)
- `src/lib/offline/ref-cache.ts` — refresh hook: on each online visit of the relevant form
  pages, cache their form-refs query results into Dexie refCache so the forms open offline;
  wire into the same forms (SWR-style: render from cache when offline).
- `tests/integration/sync-idempotent.test.ts`
- `tests/e2e/offline-queue.spec.ts` (Playwright: context.setOffline — write it; orchestrator runs)

## Tasks
1. Handler extractions + registry: every OpKind in ARCHITECTURE §6 maps to a handler:
   `harvest.create`, `stock.issue`, `application.create`, `plantLoss.create`,
   `scouting.create` (no-photo variant), `task.complete`, `reading.create`.
2. **sync_ops insert-first** is done by the route (pre-written) — your handlers must be
   REPLAY-SAFE anyway (they already map 23505 → duplicate; keep that).
3. **`tests/integration/sync-idempotent.test.ts`**: for each OpKind: build input, call the
   route's dispatch function twice (import the registry directly, wrap with a test ctx —
   no HTTP), assert exactly ONE business row exists and the second call returned
   status 'duplicate'; assert a failing op (e.g. issue with insufficient stock) records
   sync_ops status 'failed' with the error and creates nothing.
4. Offline form wiring: minimal, surgical diffs; every wired form shows the OfflineBadge
   pending count; flush triggers on `online` event + app focus (outbox.ts provides it —
   you call its hook from the forms/shell? The hook mount point is
   `src/components/common/offline-badge.tsx` which is pre-wired — so forms only enqueue).

Check commands: `pnpm exec tsc --noEmit` (your files only) + `pnpm exec eslint <your files>`.
Report files, exact commands + real exit codes, every form file you edited with a one-line
description of the diff, assumptions, out-of-ownership needs.
