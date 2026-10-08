import { describe, expect, it } from "vitest";
import {
  allocateFefo,
  isExpired,
  orderFefo,
  roundQty,
  type FefoCandidate,
} from "@/modules/stock/logic";

const TODAY = "2026-10-08";

function batch(
  id: string,
  expiryDate: string | null,
  onHand: number,
  receivedAt = "2026-01-01T09:00:00Z",
): FefoCandidate {
  return { id, expiryDate, onHand, receivedAt: new Date(receivedAt) };
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("isExpired", () => {
  it("is false for a null expiry", () => {
    expect(isExpired(null, TODAY)).toBe(false);
  });

  it("is false on the expiry day itself (usable through end of day)", () => {
    expect(isExpired(TODAY, TODAY)).toBe(false);
  });

  it("is true the day after expiry", () => {
    expect(isExpired("2026-10-07", TODAY)).toBe(true);
  });

  it("is false for a future date", () => {
    expect(isExpired("2027-01-01", TODAY)).toBe(false);
  });
});

describe("orderFefo", () => {
  it("puts the earliest expiry first", () => {
    const out = orderFefo(
      [
        batch("late", "2027-06-01", 5),
        batch("early", "2026-11-01", 5),
        batch("mid", "2027-01-15", 5),
      ],
      { today: TODAY },
    );
    expect(ids(out)).toEqual(["early", "mid", "late"]);
  });

  it("sorts NULL expiry last", () => {
    const out = orderFefo(
      [
        batch("none", null, 5),
        batch("dated", "2028-01-01", 5),
      ],
      { today: TODAY },
    );
    expect(ids(out)).toEqual(["dated", "none"]);
  });

  it("breaks equal-expiry ties on oldest received_at", () => {
    const out = orderFefo(
      [
        batch("newer", "2027-01-01", 5, "2026-09-01T08:00:00Z"),
        batch("older", "2027-01-01", 5, "2026-03-01T08:00:00Z"),
      ],
      { today: TODAY },
    );
    expect(ids(out)).toEqual(["older", "newer"]);
  });

  it("breaks NULL-expiry ties on oldest received_at", () => {
    const out = orderFefo(
      [
        batch("n2", null, 5, "2026-08-01T08:00:00Z"),
        batch("n1", null, 5, "2026-02-01T08:00:00Z"),
      ],
      { today: TODAY },
    );
    expect(ids(out)).toEqual(["n1", "n2"]);
  });

  it("skips zero-stock and negative batches", () => {
    const out = orderFefo(
      [
        batch("empty", "2026-10-20", 0),
        batch("full", "2026-12-01", 3),
        batch("weird", "2026-10-10", -1),
      ],
      { today: TODAY },
    );
    expect(ids(out)).toEqual(["full"]);
  });

  it("skips expired batches by default", () => {
    const out = orderFefo(
      [batch("expired", "2026-09-30", 10), batch("ok", "2026-12-01", 10)],
      { today: TODAY },
    );
    expect(ids(out)).toEqual(["ok"]);
  });

  it("includes expired batches (first, by expiry) with includeExpired", () => {
    const out = orderFefo(
      [batch("ok", "2026-12-01", 10), batch("expired", "2026-09-30", 10)],
      { today: TODAY, includeExpired: true },
    );
    expect(ids(out)).toEqual(["expired", "ok"]);
  });

  it("does not mutate its input", () => {
    const input = [batch("b", "2027-01-01", 1), batch("a", "2026-11-01", 1)];
    orderFefo(input, { today: TODAY });
    expect(ids(input)).toEqual(["b", "a"]);
  });
});

describe("allocateFefo", () => {
  const stock = [
    batch("c", null, 100),
    batch("a", "2026-11-01", 2.5),
    batch("b", "2027-02-01", 4),
  ];

  it("takes everything from the first batch when it covers the request", () => {
    expect(allocateFefo(stock, 2, { today: TODAY })).toEqual({
      allocations: [{ batchId: "a", quantity: 2 }],
      shortfall: 0,
    });
  });

  it("splits across batches in FEFO order", () => {
    expect(allocateFefo(stock, 8, { today: TODAY })).toEqual({
      allocations: [
        { batchId: "a", quantity: 2.5 },
        { batchId: "b", quantity: 4 },
        { batchId: "c", quantity: 1.5 },
      ],
      shortfall: 0,
    });
  });

  it("reports a shortfall when stock cannot cover the request", () => {
    const out = allocateFefo(
      [batch("a", "2026-11-01", 1), batch("b", "2027-01-01", 2)],
      5,
      { today: TODAY },
    );
    expect(out.allocations).toEqual([
      { batchId: "a", quantity: 1 },
      { batchId: "b", quantity: 2 },
    ]);
    expect(out.shortfall).toBe(2);
  });

  it("does not draw from expired stock unless allowed", () => {
    const withExpired = [
      batch("old", "2026-09-01", 10),
      batch("new", "2027-01-01", 1),
    ];
    const strict = allocateFefo(withExpired, 3, { today: TODAY });
    expect(strict.allocations).toEqual([{ batchId: "new", quantity: 1 }]);
    expect(strict.shortfall).toBe(2);

    const override = allocateFefo(withExpired, 3, {
      today: TODAY,
      includeExpired: true,
    });
    expect(override.allocations).toEqual([{ batchId: "old", quantity: 3 }]);
    expect(override.shortfall).toBe(0);
  });

  it("returns no allocations when nothing is in stock", () => {
    expect(
      allocateFefo([batch("a", "2027-01-01", 0)], 1, { today: TODAY }),
    ).toEqual({ allocations: [], shortfall: 1 });
  });

  it("stays on the 3-decimal grid (no float drift)", () => {
    const out = allocateFefo(
      [batch("a", "2026-11-01", 0.1), batch("b", "2026-12-01", 0.2)],
      0.3,
      { today: TODAY },
    );
    expect(out).toEqual({
      allocations: [
        { batchId: "a", quantity: 0.1 },
        { batchId: "b", quantity: 0.2 },
      ],
      shortfall: 0,
    });
  });
});

describe("roundQty", () => {
  it("rounds to 3 decimals", () => {
    expect(roundQty(1.23456)).toBe(1.235);
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
    expect(roundQty(2)).toBe(2);
  });
});
