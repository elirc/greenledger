# Brief P2-B — Issue, transfer, counts, returns, QR scanning

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§4, §5, §9), `docs/DATA-MODEL.md`
(§4.5), `docs/DECISIONS.md`. Imitate `src/modules/suppliers/**` + its pages.
Foundation (read, never edit): `src/modules/stock/movements.ts` (postMovement, lockBatch,
batchOnHand, pickFefoBatch), `src/modules/stock/logic.ts` (pure FEFO), `src/lib/qr.ts` (parseQrPayload).

## You own
- `src/modules/stock/schema.ts`, `src/modules/stock/actions.ts`, `src/modules/stock/queries.ts`
  (queries for issue/transfer/count flows; the movement engine files movements.ts/logic.ts are
  orchestrator-owned — extend around them, never edit them)
- `src/modules/stock/components/**`
- `src/app/(app)/store/issue/**`, `/store/transfer/**`, `/store/counts/**` (list + [id] + new),
  `/store/returns/**`
- `src/app/(app)/scan/**` + `src/components/scan/**` (QrScanner component)

## Tasks
1. **Issue** (roles OMS): form: item combobox (with on-hand per store), store, quantity,
   destination greenhouse + crop cycle (optional selects), batch override toggle. Default:
   FEFO proposal shown ("Will issue from batch B123, exp 12 Jan 2027") via `pickFefoBatch`
   preview query; scan button fills item/batch from a scanned batch QR. Action `issueStock`
   (take `clientId: z.uuid()` in the schema — offline sync hook, generate client-side with
   crypto.randomUUID): calls postMovement type 'issue' (negative), FEFO when no batch chosen;
   expired batch → DomainError EXPIRED_BATCH unless override {reason} provided AND role is
   owner/manager (storekeeper cannot override — return FORBIDDEN_OVERRIDE); override reason
   goes to movement.reason + audit.
2. **Transfer** (OMS): source store, dest store, item, batch (FEFO default), qty → two
   movements (transfer_out negative + transfer_in positive) sharing one `transferId` uuid in
   ONE postMovement-based transaction (movements.ts exports postTransfer — use it).
3. **Counts** (OMS): create draft count for a store → lines: every batch with movements in
   that store, system qty snapshot + counted qty input (mobile-friendly big inputs); save
   draft; POST action posts non-zero differences as 'adjustment' movements (one tx) and
   locks the count (status posted). List + detail pages.
4. **Returns** (OMS): return-to-store form (greenhouse → store, item/batch, qty) → movement
   type 'return' positive, reason required.
5. **Scan page** (`/scan`, all roles): camera view — `BarcodeDetector` when available, else
   `@zxing/browser` BrowserQRCodeReader fallback (dynamic import, stop camera on unmount);
   torch toggle if supported. On decode of our URL payload (`parseQrPayload`): t=batch →
   bottom sheet with batch summary (item, on-hand, expiry) + buttons "Issue this batch"
   (→ /store/issue?batchId=...&itemId=...) / "View item"; t=lot and t=equip → "coming in a
   later phase" toast. Manual entry fallback input. Degrade gracefully with a clear message
   when no camera permission.

Conventions: every action through defineAction + postMovement (NEVER insert movements
directly); loading/error/empty on every page; worker sees none of these pages (roles gates);
no money fields anywhere except receive/stock-value (not yours).

Gates for your report: `pnpm exec tsc --noEmit` + `pnpm exec eslint <your files>`, real exit codes.
