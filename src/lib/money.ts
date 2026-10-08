import { DomainError } from "./errors";

/**
 * All monetary amounts are integer kobo (bigint columns, drizzle mode number).
 * Per-base-unit cost rates are numeric(16,6) kobo and arrive as strings from pg.
 */

const nairaFormat = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
});

/** null/undefined renders as an em dash — workers receive null for money fields. */
export function formatNaira(kobo: number | null | undefined): string {
  if (kobo === null || kobo === undefined) return "—";
  return nairaFormat.format(kobo / 100);
}

/** Parse user naira input ("₦1,234.56", "1234") into integer kobo. */
export function nairaToKobo(s: string): number {
  const cleaned = s
    .replace(/NGN/i, "")
    .replace(/[₦,\s]/g, "")
    .trim();
  const value = cleaned === "" ? NaN : Number(cleaned);
  if (!Number.isFinite(value) || value < 0) {
    throw new DomainError("INVALID_MONEY", `Not a valid amount: ${s}`);
  }
  return Math.round(value * 100);
}

/**
 * rate (kobo per base unit, up to 6 decimals) × qty (base units, up to 3 decimals)
 * → integer kobo, rounded half up. Exact decimal math via BigInt so values like
 * '1.2345' × 1000 land on 1235, not a float artifact.
 */
export function rateTimesQty(
  rateKoboPerBase: string | number,
  qty: number,
): number {
  const rateStr =
    typeof rateKoboPerBase === "number"
      ? rateKoboPerBase.toFixed(6)
      : rateKoboPerBase.trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(rateStr);
  if (!m) {
    throw new DomainError("INVALID_MONEY", `Invalid rate: ${rateKoboPerBase}`);
  }
  const rateNegative = m[1] === "-";
  const frac = (m[3] ?? "").padEnd(6, "0").slice(0, 6);
  const rateMicro = BigInt(m[2] + frac); // kobo × 1e6
  if (!Number.isFinite(qty)) {
    throw new DomainError("INVALID_MONEY", `Invalid quantity: ${qty}`);
  }
  const qtyMilliSigned = Math.round(qty * 1000); // base units × 1e3
  const qtyNegative = qtyMilliSigned < 0;
  const qtyMilli = BigInt(Math.abs(qtyMilliSigned));
  const total = rateMicro * qtyMilli; // kobo × 1e9
  const ONE = BigInt(1_000_000_000); // no BigInt literals: tsconfig targets < ES2020
  let kobo = total / ONE;
  if ((total % ONE) * BigInt(2) >= ONE) kobo += BigInt(1); // round half up on the magnitude
  const sign = rateNegative !== qtyNegative ? -1 : 1;
  return sign * Number(kobo);
}

export function sumKobo(...ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}
