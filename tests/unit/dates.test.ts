import { describe, expect, it } from "vitest";
import {
  addDays,
  formatLagos,
  formatLagosDate,
  isPastLagos,
  lagosDateOf,
  todayLagos,
} from "@/lib/dates";

describe("lagosDateOf (Africa/Lagos is UTC+1, no DST)", () => {
  it("keeps a late-evening Lagos spray on its Lagos date", () => {
    // 22:30 UTC = 23:30 Lagos, still 10 Jan in Lagos
    expect(lagosDateOf(new Date("2026-01-10T22:30:00Z"))).toBe("2026-01-10");
  });

  it("rolls to the next Lagos date after Lagos midnight", () => {
    // 23:30 UTC = 00:30 Lagos on 11 Jan
    expect(lagosDateOf(new Date("2026-01-10T23:30:00Z"))).toBe("2026-01-11");
  });
});

describe("formatLagos", () => {
  it("renders in Lagos local time (+1)", () => {
    expect(formatLagos(new Date("2026-01-10T22:30:00Z"))).toBe(
      "10 Jan 2026 23:30",
    );
  });

  it("accepts custom format strings", () => {
    expect(formatLagos(new Date("2026-01-10T22:30:00Z"), "HH:mm")).toBe(
      "23:30",
    );
  });
});

describe("formatLagosDate", () => {
  it("renders the Lagos calendar date", () => {
    expect(formatLagosDate(new Date("2026-01-10T23:30:00Z"))).toBe(
      "11 Jan 2026",
    );
  });
});

describe("addDays (pure calendar math)", () => {
  it("adds within a month", () => {
    expect(addDays("2026-01-10", 7)).toBe("2026-01-17");
  });

  it("rolls over month ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("handles leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("supports PHI-style offsets (applied date + PHI days)", () => {
    expect(addDays("2026-10-08", 14)).toBe("2026-10-22");
  });

  it("rejects non-ISO input", () => {
    expect(() => addDays("10/01/2026", 1)).toThrow();
  });
});

describe("todayLagos / isPastLagos", () => {
  it("todayLagos returns yyyy-MM-dd", () => {
    expect(todayLagos()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("yesterday is past, today and tomorrow are not", () => {
    const today = todayLagos();
    expect(isPastLagos(addDays(today, -1))).toBe(true);
    expect(isPastLagos(today)).toBe(false);
    expect(isPastLagos(addDays(today, 1))).toBe(false);
  });
});
