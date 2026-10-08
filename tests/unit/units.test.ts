import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import { convert, formatQty, UNIT_LABELS } from "@/lib/units";

describe("convert", () => {
  it("is identity for the same unit", () => {
    expect(convert(5, "kg", "kg")).toBe(5);
    expect(convert(7, "pcs", "pcs")).toBe(7);
  });

  it("converts mass both ways", () => {
    expect(convert(1, "kg", "g")).toBe(1000);
    expect(convert(500, "g", "kg")).toBe(0.5);
  });

  it("converts volume both ways", () => {
    expect(convert(2, "l", "ml")).toBe(2000);
    expect(convert(250, "ml", "l")).toBe(0.25);
  });

  it("throws DomainError('UNIT_MISMATCH') across dimensions", () => {
    for (const [from, to] of [
      ["kg", "ml"],
      ["g", "l"],
      ["pcs", "kg"],
      ["l", "pcs"],
    ] as const) {
      try {
        convert(1, from, to);
        expect.unreachable(`expected ${from}→${to} to throw`);
      } catch (e) {
        expect(e).toBeInstanceOf(DomainError);
        expect((e as DomainError).code).toBe("UNIT_MISMATCH");
      }
    }
  });
});

describe("formatQty", () => {
  it("shows sub-kilogram mass in grams", () => {
    expect(formatQty(0.5, "kg")).toBe("500 g");
    expect(formatQty(0.123456, "kg")).toBe("123.456 g");
  });

  it("promotes ≥1000 g to kilograms", () => {
    expect(formatQty(1500, "g")).toBe("1.5 kg");
    expect(formatQty(1000, "g")).toBe("1 kg");
  });

  it("keeps in-range values in their base unit", () => {
    expect(formatQty(2, "kg")).toBe("2 kg");
    expect(formatQty(999, "g")).toBe("999 g");
    expect(formatQty(1, "kg")).toBe("1 kg");
  });

  it("volume mirrors mass", () => {
    expect(formatQty(0.25, "l")).toBe("250 mL");
    expect(formatQty(1234, "ml")).toBe("1.234 L");
    expect(formatQty(2, "l")).toBe("2 L");
  });

  it("pieces never convert", () => {
    expect(formatQty(10, "pcs")).toBe("10 pieces");
    expect(formatQty(2500, "pcs")).toBe("2500 pieces");
  });

  it("zero stays in the base unit", () => {
    expect(formatQty(0, "kg")).toBe("0 kg");
  });

  it("caps at 3 decimals and trims trailing zeros", () => {
    expect(formatQty(1.5, "kg")).toBe("1.5 kg");
    expect(formatQty(0.1001, "g")).toBe("0.1 g");
  });
});

// ── Item-flavoured cases (store module) ────────────────────────────────
describe("item quantities in the store", () => {
  it("labels every base unit for display", () => {
    expect(UNIT_LABELS).toEqual({
      kg: "kg",
      g: "g",
      l: "L",
      ml: "mL",
      pcs: "pieces",
    });
  });

  it("converts a pack size into a gram-based item (25 kg bag of MKP)", () => {
    expect(convert(25, "kg", "g")).toBe(25000);
    expect(formatQty(25000, "g")).toBe("25 kg");
  });

  it("converts a 1 L bottle into a mL-based agrochemical", () => {
    expect(convert(1, "l", "ml")).toBe(1000);
    expect(formatQty(750, "ml")).toBe("750 mL");
  });

  it("shows a nearly empty kg-based fertiliser sack in grams", () => {
    expect(formatQty(0.35, "kg")).toBe("350 g");
    expect(formatQty(12.5, "kg")).toBe("12.5 kg");
  });

  it("shows a partly used litre-based chemical in mL", () => {
    expect(formatQty(0.125, "l")).toBe("125 mL");
    expect(formatQty(4.75, "l")).toBe("4.75 L");
  });

  it("counts seeds, crates and spares as pieces", () => {
    expect(formatQty(1000, "pcs")).toBe("1000 pieces");
  });

  it("keeps the smallest numeric(14,3) step exact", () => {
    expect(convert(0.001, "kg", "g")).toBe(1);
    expect(convert(1, "g", "kg")).toBe(0.001);
    expect(formatQty(0.001, "kg")).toBe("1 g");
  });

  it("refuses to treat a seed count as a mass", () => {
    expect(() => convert(500, "pcs", "g")).toThrow(DomainError);
  });
});
