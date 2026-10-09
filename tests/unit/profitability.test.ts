import { describe, expect, it } from "vitest";
import {
  allocatedRevenueKobo,
  computeProfitability,
  inputCostKobo,
  sumProfitability,
} from "@/modules/reports/profitability";

/**
 * Hand-computed fixtures. Money is integer kobo; rates are kobo per base
 * unit (numeric strings as pg returns them); kg / qty arrive signed from the
 * movement tables and the calc ignores the sign.
 */

describe("allocatedRevenueKobo", () => {
  it("takes the whole line when every kg came from this cycle", () => {
    // 100 kg @ ₦1,500/kg = ₦150,000 = 15,000,000 kobo, drawn from two lots.
    expect(
      allocatedRevenueKobo([
        { saleLineId: "L1", kg: -60, lineKg: 100, lineTotalKobo: 15_000_000 },
        { saleLineId: "L1", kg: -40, lineKg: 100, lineTotalKobo: 15_000_000 },
      ]),
    ).toBe(15_000_000);
  });

  it("splits a line pro rata by kg when another cycle supplied the rest", () => {
    // 30 of 90 kg from this cycle: 1/3 of 1,000,000 = 333,333.33 → 333,333.
    expect(
      allocatedRevenueKobo([
        { saleLineId: "L1", kg: -30, lineKg: 90, lineTotalKobo: 1_000_000 },
      ]),
    ).toBe(333_333);
    // 60 of 90 kg: 666,666.67 → 666,667 (half up) — the two shares sum back.
    expect(
      allocatedRevenueKobo([
        { saleLineId: "L1", kg: -60, lineKg: 90, lineTotalKobo: 1_000_000 },
      ]),
    ).toBe(666_667);
  });

  it("handles fractional kg exactly (3 dp)", () => {
    // 12.345 of 24.69 kg = exactly half of 500,001 → 250,000.5 → 250,001.
    expect(
      allocatedRevenueKobo([
        { saleLineId: "L1", kg: -12.345, lineKg: 24.69, lineTotalKobo: 500_001 },
      ]),
    ).toBe(250_001);
  });

  it("sums several lines and never allocates more than a whole line", () => {
    expect(
      allocatedRevenueKobo([
        { saleLineId: "L1", kg: -10, lineKg: 10, lineTotalKobo: 200_000 },
        { saleLineId: "L2", kg: -5, lineKg: 20, lineTotalKobo: 400_000 }, // 100,000
        { saleLineId: "L3", kg: -50, lineKg: 25, lineTotalKobo: 300_000 }, // capped
      ]),
    ).toBe(600_000);
  });

  it("is zero with no sales", () => {
    expect(allocatedRevenueKobo([])).toBe(0);
  });
});

describe("inputCostKobo", () => {
  it("values |issue| quantity at the batch rate, rounding each movement half up", () => {
    // 2.5 kg @ 1,234.5 kobo/kg = 3,086.25 → 3,086
    // 0.75 L @ 2,000 kobo/L   = 1,500
    // 3 kg @ 0.1667 kobo/kg   = 0.5001 → 1
    expect(
      inputCostKobo([
        { quantity: -2.5, unitCostKobo: "1234.500000" },
        { quantity: -0.75, unitCostKobo: "2000.000000" },
        { quantity: -3, unitCostKobo: "0.166700" },
      ]),
    ).toBe(3_086 + 1_500 + 1);
  });

  it("is zero with no issues", () => {
    expect(inputCostKobo([])).toBe(0);
  });
});

describe("computeProfitability", () => {
  it("revenue − input cost − cycle expenses, with cost per kg sold", () => {
    const p = computeProfitability({
      sales: [
        // 400 kg A @ ₦1,500 = 60,000,000 kobo (all from this cycle)
        { saleLineId: "A", kg: -400, lineKg: 400, lineTotalKobo: 60_000_000 },
        // 100 of 200 kg B @ ₦900 → half of 18,000,000 = 9,000,000
        { saleLineId: "B", kg: -100, lineKg: 200, lineTotalKobo: 18_000_000 },
      ],
      issues: [
        // 50 kg CalNit @ ₦800/kg = 4,000,000 kobo
        { quantity: -50, unitCostKobo: "80000.000000" },
        // 1.2 L abamectin @ ₦12,000/L = 1,440,000 kobo
        { quantity: -1.2, unitCostKobo: "1200000.000000" },
      ],
      expenses: [{ amountKobo: 2_500_000 }, { amountKobo: 560_000 }],
    });
    expect(p.revenueKobo).toBe(69_000_000);
    expect(p.inputCostKobo).toBe(5_440_000);
    expect(p.expensesKobo).toBe(3_060_000);
    expect(p.profitKobo).toBe(69_000_000 - 5_440_000 - 3_060_000); // 60,500,000
    expect(p.kgSold).toBe(500);
    // (5,440,000 + 3,060,000) / 500 = 17,000 kobo = ₦170/kg
    expect(p.costPerKgKobo).toBe(17_000);
  });

  it("goes negative when costs exceed revenue; cost per kg is null with no sales", () => {
    const p = computeProfitability({
      sales: [],
      issues: [{ quantity: -10, unitCostKobo: "15000" }],
      expenses: [{ amountKobo: 50_000 }],
    });
    expect(p.revenueKobo).toBe(0);
    expect(p.inputCostKobo).toBe(150_000);
    expect(p.profitKobo).toBe(-200_000);
    expect(p.kgSold).toBe(0);
    expect(p.costPerKgKobo).toBeNull();
  });

  it("rounds cost per kg half up", () => {
    // cost 1,000 kobo over 3 kg = 333.33 → 333; over 0.006 kg → 166,666.67 → 166,667
    expect(
      computeProfitability({
        sales: [{ saleLineId: "x", kg: -3, lineKg: 3, lineTotalKobo: 9 }],
        issues: [],
        expenses: [{ amountKobo: 1_000 }],
      }).costPerKgKobo,
    ).toBe(333);
    expect(
      computeProfitability({
        sales: [{ saleLineId: "x", kg: -0.006, lineKg: 1, lineTotalKobo: 9 }],
        issues: [],
        expenses: [{ amountKobo: 1_000 }],
      }).costPerKgKobo,
    ).toBe(166_667);
  });

  it("all-empty cycle is all zeros", () => {
    expect(computeProfitability({ sales: [], issues: [], expenses: [] })).toEqual({
      revenueKobo: 0,
      inputCostKobo: 0,
      expensesKobo: 0,
      profitKobo: 0,
      kgSold: 0,
      costPerKgKobo: null,
    });
  });
});

describe("sumProfitability", () => {
  it("adds columns and recomputes cost per kg from the totals", () => {
    const a = computeProfitability({
      sales: [{ saleLineId: "1", kg: -100, lineKg: 100, lineTotalKobo: 1_000_000 }],
      issues: [{ quantity: -1, unitCostKobo: "100000" }],
      expenses: [],
    });
    const b = computeProfitability({
      sales: [{ saleLineId: "2", kg: -300, lineKg: 300, lineTotalKobo: 2_000_000 }],
      issues: [],
      expenses: [{ amountKobo: 300_000 }],
    });
    const t = sumProfitability([a, b]);
    expect(t.revenueKobo).toBe(3_000_000);
    expect(t.inputCostKobo).toBe(100_000);
    expect(t.expensesKobo).toBe(300_000);
    expect(t.profitKobo).toBe(2_600_000);
    expect(t.kgSold).toBe(400);
    expect(t.costPerKgKobo).toBe(1_000); // 400,000 / 400
  });
});
