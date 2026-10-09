/**
 * Pure sales math — no DB, no Next. Shared by handlers, queries and forms.
 */

import { rateTimesQty } from "@/lib/money";
import type { PriceBasis, SaleStatus } from "./schema";

/** Line total in kobo: unit price × kg (per_kg) or × crates (per_crate). */
export function lineTotalKobo(args: {
  priceBasis: PriceBasis;
  unitPriceKobo: number;
  kg: number;
  crates?: number | null;
}): number {
  const qty = args.priceBasis === "per_crate" ? (args.crates ?? 0) : args.kg;
  return rateTimesQty(args.unitPriceKobo, qty);
}

/** DATA-MODEL §4.8: paid when paid >= total, part_paid when 0 < paid < total. */
export function saleStatusFor(totalKobo: number, paidKobo: number): SaleStatus {
  if (paidKobo >= totalKobo) return "paid";
  if (paidKobo > 0) return "part_paid";
  return "unpaid";
}

export const INVOICE_PREFIX = "INV-";
export const DELIVERY_NOTE_PREFIX = "DN-";

/** Counter value 123 → "INV-000123". */
export function formatInvoiceNumber(value: number): string {
  return `${INVOICE_PREFIX}${String(value).padStart(6, "0")}`;
}

/** "INV-000123" → "DN-000123" (delivery note shares the invoice sequence). */
export function deliveryNoteNumber(invoiceNumber: string): string {
  return invoiceNumber.startsWith(INVOICE_PREFIX)
    ? `${DELIVERY_NOTE_PREFIX}${invoiceNumber.slice(INVOICE_PREFIX.length)}`
    : `${DELIVERY_NOTE_PREFIX}${invoiceNumber}`;
}

function parseDateOnly(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Not a yyyy-MM-dd date: ${s}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

/** Whole calendar days from `from` to `to` (both yyyy-MM-dd). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDateOnly(to) - parseDateOnly(from)) / 86_400_000);
}

export const AGEING_BUCKETS = ["d0to7", "d8to14", "d15to30", "over30"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export const AGEING_BUCKET_LABELS: Record<AgeingBucket, string> = {
  d0to7: "0–7 days",
  d8to14: "8–14 days",
  d15to30: "15–30 days",
  over30: "Over 30 days",
};

/** DATA-MODEL §5: 0-7 / 8-14 / 15-30 / >30 days since sale_date. */
export function ageingBucket(ageDays: number): AgeingBucket {
  if (ageDays <= 7) return "d0to7";
  if (ageDays <= 14) return "d8to14";
  if (ageDays <= 30) return "d15to30";
  return "over30";
}
