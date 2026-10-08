import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import {
  formatNaira,
  nairaToKobo,
  rateTimesQty,
  sumKobo,
} from "@/lib/money";

describe("formatNaira", () => {
  it("formats kobo as naira with two decimals", () => {
    const s = formatNaira(123456);
    expect(s).toContain("1,234.56");
    expect(s).toContain("₦");
  });

  it("formats zero", () => {
    expect(formatNaira(0)).toContain("0.00");
  });

  it("renders null and undefined as an em dash (worker redaction)", () => {
    expect(formatNaira(null)).toBe("—");
    expect(formatNaira(undefined)).toBe("—");
  });

  it("handles large farm-scale amounts beyond int4 kobo", () => {
    // ₦50,000,000 = 5,000,000,000 kobo (overflows int4 — why money is bigint)
    expect(formatNaira(5_000_000_000)).toContain("50,000,000.00");
  });
});

describe("nairaToKobo", () => {
  it("parses plain naira", () => {
    expect(nairaToKobo("1234")).toBe(123400);
  });

  it("parses currency-formatted input", () => {
    expect(nairaToKobo("₦1,234.56")).toBe(123456);
    expect(nairaToKobo("NGN 500")).toBe(50000);
  });

  it("parses decimals to exact kobo", () => {
    expect(nairaToKobo("0.01")).toBe(1);
    expect(nairaToKobo("19.99")).toBe(1999);
  });

  it("throws DomainError on junk", () => {
    expect(() => nairaToKobo("abc")).toThrowError(DomainError);
    expect(() => nairaToKobo("")).toThrowError(DomainError);
  });

  it("throws DomainError on negatives", () => {
    expect(() => nairaToKobo("-5")).toThrowError(DomainError);
  });
});

describe("rateTimesQty (numeric(16,6) rate × numeric(14,3) qty → integer kobo)", () => {
  it("multiplies exactly", () => {
    expect(rateTimesQty("100", 5)).toBe(500);
    expect(rateTimesQty("2500.50", 2)).toBe(5001);
  });

  it("rounds half up at the .5 boundary", () => {
    expect(rateTimesQty("2.5", 1)).toBe(3);
    expect(rateTimesQty("0.5", 3)).toBe(2); // 1.5 → 2
    expect(rateTimesQty("0.5", 1)).toBe(1); // 0.5 → 1
  });

  it("is exact where floats are not", () => {
    // 1.2345 × 1000 = 1234.5 exactly; naive float math gives 1234.4999…
    expect(rateTimesQty("1.2345", 1000)).toBe(1235);
    // 1.005 × 100 = 100.5 exactly; float gives 100.4999…
    expect(rateTimesQty("1.005", 100)).toBe(101);
  });

  it("rounds below half down", () => {
    expect(rateTimesQty("0.333333", 1)).toBe(0);
    expect(rateTimesQty("0.333333", 2)).toBe(1); // 0.666666 → 1
  });

  it("accepts number rates", () => {
    expect(rateTimesQty(2.5, 2)).toBe(5);
  });

  it("handles fractional quantities (3 dp)", () => {
    expect(rateTimesQty("1000", 0.125)).toBe(125);
  });

  it("rejects invalid rates", () => {
    expect(() => rateTimesQty("1,000", 1)).toThrowError(DomainError);
    expect(() => rateTimesQty("abc", 1)).toThrowError(DomainError);
  });
});

describe("sumKobo", () => {
  it("sums", () => {
    expect(sumKobo(1, 2, 3)).toBe(6);
    expect(sumKobo()).toBe(0);
  });
});
