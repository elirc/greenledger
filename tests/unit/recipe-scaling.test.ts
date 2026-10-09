import { describe, expect, it } from "vitest";
import { scaleRecipe } from "@/modules/applications/logic";

const line = (itemId: string, quantityPer1000l: number) => ({
  itemId,
  quantityPer1000l,
});

describe("scaleRecipe", () => {
  it("scales a 2.5 kg/1000 L line to 650 L → 1.625", () => {
    expect(scaleRecipe([line("calnit", 2.5)], 650)).toEqual([
      { itemId: "calnit", quantity: 1.625 },
    ]);
  });

  it("scales every line by volume/1000 and keeps line order", () => {
    expect(
      scaleRecipe([line("npk", 4), line("mgs", 1), line("map", 0.5)], 400),
    ).toEqual([
      { itemId: "npk", quantity: 1.6 },
      { itemId: "mgs", quantity: 0.4 },
      { itemId: "map", quantity: 0.2 },
    ]);
  });

  it("is the identity at exactly 1,000 L", () => {
    expect(scaleRecipe([line("a", 3.75)], 1000)).toEqual([
      { itemId: "a", quantity: 3.75 },
    ]);
  });

  it("scales above 1,000 L", () => {
    expect(scaleRecipe([line("a", 2.5)], 2400)).toEqual([
      { itemId: "a", quantity: 6 },
    ]);
  });

  it("returns no lines for a zero volume", () => {
    expect(scaleRecipe([line("a", 2.5), line("b", 1)], 0)).toEqual([]);
  });

  it("returns no lines for a negative volume", () => {
    expect(scaleRecipe([line("a", 2.5)], -650)).toEqual([]);
  });

  it("returns no lines for an empty recipe", () => {
    expect(scaleRecipe([], 650)).toEqual([]);
  });

  it("drops lines whose quantity is zero", () => {
    expect(scaleRecipe([line("zero", 0), line("ok", 1)], 500)).toEqual([
      { itemId: "ok", quantity: 0.5 },
    ]);
  });

  it("drops lines that round to zero on the 3-decimal grid", () => {
    // 0.0004 kg/1000 L × 1000 L = 0.0004 → 0.000 after rounding.
    expect(scaleRecipe([line("trace", 0.0004), line("ok", 1)], 1000)).toEqual([
      { itemId: "ok", quantity: 1 },
    ]);
  });

  it("rounds to 3 decimals", () => {
    // 2 × 333.3 / 1000 = 0.6666 → 0.667
    expect(scaleRecipe([line("a", 2)], 333.3)).toEqual([
      { itemId: "a", quantity: 0.667 },
    ]);
    // 1 × 333 / 1000 = 0.333 exactly
    expect(scaleRecipe([line("b", 1)], 333)).toEqual([
      { itemId: "b", quantity: 0.333 },
    ]);
    // 0.05 × 777 / 1000 = 0.03885 → 0.039
    expect(scaleRecipe([line("c", 0.05)], 777)).toEqual([
      { itemId: "c", quantity: 0.039 },
    ]);
  });

  it("has no float drift (0.1 + 0.2 style)", () => {
    const [out] = scaleRecipe([line("a", 0.3)], 1000);
    expect(out.quantity).toBe(0.3);
    const [out2] = scaleRecipe([line("a", 0.1)], 3000);
    expect(out2.quantity).toBe(0.3);
  });

  it("does not mutate its input", () => {
    const input = [line("a", 2.5)];
    scaleRecipe(input, 650);
    expect(input).toEqual([{ itemId: "a", quantityPer1000l: 2.5 }]);
  });
});
