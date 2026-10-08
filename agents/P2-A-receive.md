# Brief P2-A — Items, receipts, batch intake, labels

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§4, §5, §9), `docs/DATA-MODEL.md`
(§4.4), `docs/DECISIONS.md`. Imitate `src/modules/suppliers/**` + its pages.
Foundation you build on (read, never edit): `src/modules/stock/movements.ts` (postMovement,
batchOnHand, lockBatch — ALL stock changes go through it), `src/lib/qr.ts`, `src/modules/suppliers/**`.

## You own
- `src/modules/items/` (schema.ts, queries.ts, actions.ts, components/)
- `src/modules/receipts/` (schema.ts, queries.ts, actions.ts, components/)
- `src/app/(app)/store/items/**` (list is NOT here — P2-C owns /store stock list; you own
  `/store/items/new`, `/store/items/[id]` detail incl. batches + movements tabs, `/store/items/[id]/edit`)
- `src/app/(app)/store/receive/**` (receive flow + per-receipt label print CTA)
- `src/app/(app)/store/suppliers` stays as-is (do not touch)

## Tasks
1. **Items CRUD** (roles OM for create/edit): name, category (7-value enum), base unit,
   reorder level; agrochemical-only fields PHI days + REI hours + active ingredient (zod:
   required when category=agrochemical, forbidden otherwise); fertiliser-only N/P/K percents.
   Item detail page: info card, batches table (batch no, expiry, on-hand via query, unit cost
   — cost columns only when `ctx.canSeeMoney`), movements list (paginated, latest 50).
2. **Receive stock** (roles OMS): one form = supplier select (+ inline "new supplier" via the
   suppliers action), store select, reference, then repeatable lines: item combobox, batch
   number, expiry date, quantity (+ unit label from item), unit cost. Action `receiveStock`:
   one transaction — upsert item_batch per line (unique org+item+batch_number: on conflict
   reuse the batch and update expiry/cost ONLY if the batch has zero movements, else
   DomainError BATCH_EXISTS), insert receipt + receipt_lines, then `postMovement` type
   'receive' per line (positive qty, receiptLineId linked), writeAudit once per receipt,
   compute and store receipt.total_cost_kobo via `rateTimesQty`. Success screen → "Print labels"
   button linking `/api/pdf/label?receiptId=...` (route exists; orchestrator owns it) + "Receive more".
3. Zod schemas in each module's schema.ts, shared with forms. Money input in naira text →
   `nairaToKobo`; quantities positive; expiry optional but warn in UI when empty for
   agrochemicals/fertilisers.

Gates for your report: `pnpm exec tsc --noEmit` + `pnpm exec eslint <your files>`, real exit codes.
