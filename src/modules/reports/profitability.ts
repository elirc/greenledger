/**
 * Pure crop-cycle profitability (ARCHITECTURE §15.7, DATA-MODEL §5):
 *
 *   profit = revenue − input cost − cycle-attributed expenses
 *
 * - revenue: Σ sale_lines.line_total allocated to the cycle via
 *   produce_movements (type 'sale') → produce_lots → harvests → cycle. A sale
 *   line can draw kg from lots of several cycles (FIFO), so each line's total
 *   is split pro rata by kg: round(line_total × cycleKg / line_kg), half up.
 * - input cost: Σ |issue movement qty| × batch unit_cost rate, each movement
 *   rounded to integer kobo via rateTimesQty (DATA-MODEL §1).
 * - expenses: Σ expenses.amount_kobo WITH crop_cycle_id = cycle.
 *   Unallocated site/org-level expenses (crop_cycle_id NULL) are EXCLUDED —
 *   v1 does not spread them across cycles (spec); the report shows them as a
 *   separate total.
 *
 * No DB, no I/O — fed by src/modules/reports/queries.ts and unit-tested in
 * tests/unit/profitability.test.ts.
 */
import { rateTimesQty } from "@/lib/money";

/** One `sale` produce_movement drawn from one of the cycle's lots. */
export interface SaleAllocation {
  saleLineId: string;
  /** Movement kg (signed negative in the DB; sign is ignored here). */
  kg: number;
  /** The sale line's total kg (positive). */
  lineKg: number;
  /** The sale line's total in integer kobo. */
  lineTotalKobo: number;
}

/** One `issue` inventory_movement tagged with the cycle. */
export interface IssueCost {
  /** Movement quantity in base units (negative in the DB; sign ignored). */
  quantity: number;
  /** item_batches.unit_cost_kobo — kobo per base unit, numeric string. */
  unitCostKobo: string | number;
}

export interface ProfitabilityInput {
  sales: SaleAllocation[];
  issues: IssueCost[];
  /** Expenses with crop_cycle_id = this cycle (integer kobo each). */
  expenses: { amountKobo: number }[];
}

export interface Profitability {
  revenueKobo: number;
  inputCostKobo: number;
  expensesKobo: number;
  profitKobo: number;
  /** Σ kg sold from this cycle's lots (3 dp). */
  kgSold: number;
  /** (input cost + expenses) ÷ kg sold, integer kobo; null when nothing sold. */
  costPerKgKobo: number | null;
}

/** Thousandths, so kg ratios are exact integers (kg columns are numeric(14,3)). */
function milli(n: number): number {
  return Math.round(Math.abs(n) * 1000);
}

/** a × b ÷ c rounded half up, on non-negative integers. */
function mulDivRound(a: number, b: number, c: number): number {
  if (c === 0) return 0;
  const q = BigInt(a) * BigInt(b);
  const d = BigInt(c);
  let r = q / d;
  if ((q % d) * BigInt(2) >= d) r += BigInt(1);
  return Number(r);
}

/** Revenue for one cycle: each sale line's total split by kg share. */
export function allocatedRevenueKobo(sales: SaleAllocation[]): number {
  const byLine = new Map<
    string,
    { kgMilli: number; lineKgMilli: number; lineTotalKobo: number }
  >();
  for (const s of sales) {
    const row = byLine.get(s.saleLineId) ?? {
      kgMilli: 0,
      lineKgMilli: milli(s.lineKg),
      lineTotalKobo: s.lineTotalKobo,
    };
    row.kgMilli += milli(s.kg);
    byLine.set(s.saleLineId, row);
  }
  let total = 0;
  for (const l of byLine.values()) {
    if (l.lineKgMilli === 0) continue;
    // Never allocate more than the whole line (defensive vs bad data).
    const kg = Math.min(l.kgMilli, l.lineKgMilli);
    const sign = l.lineTotalKobo < 0 ? -1 : 1;
    total += sign * mulDivRound(Math.abs(l.lineTotalKobo), kg, l.lineKgMilli);
  }
  return total;
}

export function inputCostKobo(issues: IssueCost[]): number {
  return issues.reduce(
    (sum, i) => sum + rateTimesQty(i.unitCostKobo, Math.abs(i.quantity)),
    0,
  );
}

export function computeProfitability(input: ProfitabilityInput): Profitability {
  const revenueKobo = allocatedRevenueKobo(input.sales);
  const inputCost = inputCostKobo(input.issues);
  const expensesKobo = input.expenses.reduce((s, e) => s + e.amountKobo, 0);
  const kgSoldMilli = input.sales.reduce((s, a) => s + milli(a.kg), 0);
  const costKobo = inputCost + expensesKobo;
  return {
    revenueKobo,
    inputCostKobo: inputCost,
    expensesKobo,
    profitKobo: revenueKobo - inputCost - expensesKobo,
    kgSold: kgSoldMilli / 1000,
    costPerKgKobo:
      kgSoldMilli === 0
        ? null
        : mulDivRound(Math.max(costKobo, 0), 1000, kgSoldMilli),
  };
}

/** Column totals for a set of cycles (costPerKg recomputed from the sums). */
export function sumProfitability(rows: Profitability[]): Profitability {
  const t = rows.reduce(
    (acc, r) => ({
      revenueKobo: acc.revenueKobo + r.revenueKobo,
      inputCostKobo: acc.inputCostKobo + r.inputCostKobo,
      expensesKobo: acc.expensesKobo + r.expensesKobo,
      kgSoldMilli: acc.kgSoldMilli + milli(r.kgSold),
    }),
    { revenueKobo: 0, inputCostKobo: 0, expensesKobo: 0, kgSoldMilli: 0 },
  );
  const cost = t.inputCostKobo + t.expensesKobo;
  return {
    revenueKobo: t.revenueKobo,
    inputCostKobo: t.inputCostKobo,
    expensesKobo: t.expensesKobo,
    profitKobo: t.revenueKobo - cost,
    kgSold: t.kgSoldMilli / 1000,
    costPerKgKobo:
      t.kgSoldMilli === 0 ? null : mulDivRound(Math.max(cost, 0), 1000, t.kgSoldMilli),
  };
}
