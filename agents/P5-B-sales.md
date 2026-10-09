# Brief P5-B — Customers, sales (FIFO), payments, receivables, delivery note + invoice PDFs

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§4, §5, §10 PDFs),
`docs/DATA-MODEL.md` (§4.8 incl. counters), `docs/DECISIONS.md`. Imitate `src/modules/suppliers/**`.
Foundation (read, never edit): `src/modules/produce/movements.ts` (allocateSale —
THE sale-allocation path), `src/modules/documents/label-sheet.tsx` (react-pdf style),
`src/app/api/pdf/label/route.ts` (route pattern incl. the ReactElement<DocumentProps> cast).

## You own
- `src/modules/customers/` (schema.ts, queries.ts, actions.ts, components/)
- `src/modules/sales/` (schema.ts, queries.ts, actions.ts, components/)
- `src/modules/documents/delivery-note.tsx`, `src/modules/documents/invoice.tsx`,
  `src/modules/documents/doc-shared.tsx` (header/meta/table primitives you factor out)
- `src/app/api/pdf/delivery-note/route.ts`, `src/app/api/pdf/invoice/route.ts`
- `src/app/(app)/sales/**` (list, new, [id] detail, customers/**, receivables/**)

## Tasks — ALL money is kobo bigint; roles owner/manager ONLY throughout
1. **Customers**: CRUD (name, phone, email, notes), list with open-balance column
   (Σ unpaid totals), detail with their sales.
2. **New sale** (`/sales/new`): customer select (+ inline new), sale date (default today),
   source store (default packhouse? no — default store type cold_room if exists else
   packhouse; make it a select), lines: crop → grade (showing available kg from produce
   queries) → kg (or crates + kg) → price basis per_kg|per_crate → unit price (naira input →
   kobo). Live line totals + grand total via MoneyText. Action `createSale`, ONE transaction:
   increment the org's `counters` row key 'invoice' (insert-on-missing, UPDATE ... value+1
   RETURNING) → invoice_number `INV-` + 6-digit padded; insert sale + lines; per line
   `allocateSale` (FIFO, locks, negative sale movements tied to sale_line_id); set
   total_kobo; writeAudit. Map NO_STOCK/INSUFFICIENT_STOCK to messages naming crop+grade.
3. **Sale detail** (`/sales/[id]`): lines, totals, payments list, status badge
   (unpaid/part_paid/paid), buttons: "Delivery note" + "Invoice" (open the PDF routes),
   "Record payment" (amount naira, method cash/transfer/other, date) → inserts
   payments_received, recomputes amount_paid_kobo + status in the same tx, audit. Over-payment
   rejected (OVERPAY).
4. **Sales list**: date, invoice no, customer, total, status; filters status + customer.
   **Receivables** (`/sales/receivables`): per customer: unpaid balance in ageing buckets
   0-7 / 8-14 / 15-30 / >30 days since sale_date (DATA-MODEL §5), bucket totals row.
5. **PDFs**: delivery note (farm name, customer, date, DN number = invoice number with DN-
   prefix, lines crop/grade/crates/kg, signatures block — NO prices) and invoice (same +
   unit prices, line totals, grand total, amount paid, balance due, "Make payment to" notes
   placeholder). Route pattern exactly like label/route.ts: requireMember roles owner/manager,
   org-scoped fetch, renderToBuffer cast, inline filename `greenledger-invoice-INV-000123.pdf`.
6. Queries ctx-first + org-scoped; money columns ONLY when ctx.canSeeMoney (these pages are
   OM-only, but the QUERY layer must still redact for the worker-prices test).

Check commands: `pnpm exec tsc --noEmit` (your files only) + `pnpm exec eslint <your files>`.
Report files, exact commands + real exit codes, assumptions, out-of-ownership needs.
