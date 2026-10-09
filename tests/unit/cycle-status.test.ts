import { describe, expect, it } from "vitest";
import {
  ACTIVE_CYCLE_STATUSES,
  CYCLE_STATUSES,
  CYCLE_STATUS_LABELS,
  assertTransition,
  canTransition,
  type CycleStatus,
} from "@/modules/cycles/status";
import { DomainError } from "@/lib/errors";

/** The full allowed-transition table (spec: forward only, close from any active state). */
const ALLOWED: Record<CycleStatus, CycleStatus[]> = {
  planned: ["nursery", "growing", "closed"],
  nursery: ["growing", "closed"],
  growing: ["harvesting", "closed"],
  harvesting: ["closed"],
  closed: [],
};

const PAIRS = CYCLE_STATUSES.flatMap((from) =>
  CYCLE_STATUSES.map((to) => ({
    from,
    to,
    allowed: ALLOWED[from].includes(to),
  })),
);

describe("cycle status constants", () => {
  it("lists the five statuses in lifecycle order", () => {
    expect(CYCLE_STATUSES).toEqual([
      "planned",
      "nursery",
      "growing",
      "harvesting",
      "closed",
    ]);
  });

  it("has a label for every status", () => {
    for (const s of CYCLE_STATUSES) {
      expect(CYCLE_STATUS_LABELS[s]).toEqual(expect.any(String));
      expect(CYCLE_STATUS_LABELS[s].length).toBeGreaterThan(0);
    }
  });

  it("ACTIVE_CYCLE_STATUSES is exactly nursery, growing, harvesting", () => {
    expect([...ACTIVE_CYCLE_STATUSES].sort()).toEqual(
      ["growing", "harvesting", "nursery"],
    );
    expect(ACTIVE_CYCLE_STATUSES).not.toContain("planned");
    expect(ACTIVE_CYCLE_STATUSES).not.toContain("closed");
  });

  it("covers all 25 from→to pairs in the matrix", () => {
    expect(PAIRS).toHaveLength(25);
    expect(PAIRS.filter((p) => p.allowed)).toHaveLength(8);
  });
});

describe("canTransition — full matrix", () => {
  it.each(PAIRS)("$from → $to is allowed: $allowed", ({ from, to, allowed }) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it("never allows a self-transition", () => {
    for (const s of CYCLE_STATUSES) expect(canTransition(s, s)).toBe(false);
  });

  it("never allows moving backwards", () => {
    CYCLE_STATUSES.forEach((from, i) => {
      CYCLE_STATUSES.slice(0, i).forEach((to) => {
        expect(canTransition(from, to)).toBe(false);
      });
    });
  });

  it("closed is terminal", () => {
    for (const to of CYCLE_STATUSES) expect(canTransition("closed", to)).toBe(false);
  });

  it("every non-closed status can be closed", () => {
    for (const from of CYCLE_STATUSES.filter((s) => s !== "closed")) {
      expect(canTransition(from, "closed")).toBe(true);
    }
  });

  it("returns false for unknown statuses instead of throwing", () => {
    expect(canTransition("bogus" as CycleStatus, "growing")).toBe(false);
    expect(canTransition("planned", "bogus" as CycleStatus)).toBe(false);
  });
});

describe("assertTransition — full matrix", () => {
  it.each(PAIRS.filter((p) => p.allowed))(
    "$from → $to does not throw",
    ({ from, to }) => {
      expect(() => assertTransition(from, to)).not.toThrow();
    },
  );

  it.each(PAIRS.filter((p) => !p.allowed))(
    "$from → $to throws DomainError BAD_TRANSITION",
    ({ from, to }) => {
      let caught: unknown;
      try {
        assertTransition(from, to);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(DomainError);
      const err = caught as DomainError;
      expect(err.code).toBe("BAD_TRANSITION");
      expect(err.name).toBe("DomainError");
      // Human message names both states (lower-cased labels).
      expect(err.message).toContain(CYCLE_STATUS_LABELS[from].toLowerCase());
      expect(err.message).toContain(CYCLE_STATUS_LABELS[to].toLowerCase());
    },
  );

  it("agrees with canTransition for every pair", () => {
    for (const { from, to } of PAIRS) {
      const threw = (() => {
        try {
          assertTransition(from, to);
          return false;
        } catch {
          return true;
        }
      })();
      expect(threw).toBe(!canTransition(from, to));
    }
  });
});
