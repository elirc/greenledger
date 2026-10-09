import { describe, expect, it } from "vitest";
import { formatLagos } from "@/lib/dates";
import {
  computeSafety,
  laterDate,
  laterInstant,
} from "@/modules/applications/logic";
import {
  isEntrySafe,
  isHarvestSafe,
  safetyStatus,
} from "@/modules/greenhouse-status/logic";

const HOUR = 3600_000;
const at = (iso: string) => new Date(iso);

describe("computeSafety — fertigation", () => {
  it("never sets safety windows, even with labelled chemicals", () => {
    expect(
      computeSafety("fertigation", at("2026-10-08T09:00:00Z"), [
        { phiDays: 14, reiHours: 24 },
        { phiDays: 7, reiHours: 12 },
      ]),
    ).toEqual({ entrySafeAt: null, harvestSafeDate: null });
  });

  it("is null with no items", () => {
    expect(
      computeSafety("fertigation", at("2026-10-08T09:00:00Z"), []),
    ).toEqual({ entrySafeAt: null, harvestSafeDate: null });
  });
});

describe("computeSafety — spray takes the LONGEST interval per axis", () => {
  it("max REI and max PHI may come from different chemicals", () => {
    const applied = at("2026-03-10T09:00:00Z"); // 10:00 Lagos
    const out = computeSafety("spray", applied, [
      { phiDays: 7, reiHours: 24 },
      { phiDays: 14, reiHours: 12 },
    ]);
    expect(out.entrySafeAt).toEqual(at("2026-03-11T09:00:00Z"));
    expect(out.harvestSafeDate).toBe("2026-03-24");
  });

  it("order of items does not matter", () => {
    const applied = at("2026-03-10T09:00:00Z");
    const a = computeSafety("spray", applied, [
      { phiDays: 14, reiHours: 12 },
      { phiDays: 7, reiHours: 24 },
      { phiDays: 1, reiHours: 4 },
    ]);
    expect(a.entrySafeAt?.getTime()).toBe(applied.getTime() + 24 * HOUR);
    expect(a.harvestSafeDate).toBe("2026-03-24");
  });

  it("a single chemical sets both windows", () => {
    const out = computeSafety("spray", at("2026-05-01T08:00:00Z"), [
      { phiDays: 3, reiHours: 12 },
    ]);
    expect(out.entrySafeAt).toEqual(at("2026-05-01T20:00:00Z"));
    expect(out.harvestSafeDate).toBe("2026-05-04");
  });
});

describe("computeSafety — Lagos (UTC+1) date boundaries", () => {
  it("23:30 Lagos spray: PHI counts from that Lagos day", () => {
    // 2026-10-08 23:30 Lagos = 22:30Z, same calendar day in both zones.
    const applied = at("2026-10-08T22:30:00Z");
    const out = computeSafety("spray", applied, [{ phiDays: 7, reiHours: 24 }]);
    expect(out.harvestSafeDate).toBe("2026-10-15");
    expect(out.entrySafeAt).toEqual(at("2026-10-09T22:30:00Z"));
    expect(formatLagos(out.entrySafeAt!, "yyyy-MM-dd HH:mm")).toBe(
      "2026-10-09 23:30",
    );
  });

  it("00:30 Lagos spray is the NEXT Lagos day although UTC is still the previous day", () => {
    // 2026-10-09 00:30 Lagos = 2026-10-08 23:30Z.
    const applied = at("2026-10-08T23:30:00Z");
    const out = computeSafety("spray", applied, [{ phiDays: 7, reiHours: 2 }]);
    expect(out.harvestSafeDate).toBe("2026-10-16"); // not 10-15 (UTC date)
    expect(out.entrySafeAt).toEqual(at("2026-10-09T01:30:00Z"));
  });

  it("REI hours cross Lagos midnight correctly", () => {
    // 22:00 Lagos (21:00Z) + 4 h = 02:00 Lagos next day (01:00Z).
    const out = computeSafety("spray", at("2026-10-08T21:00:00Z"), [
      { phiDays: null, reiHours: 4 },
    ]);
    expect(out.entrySafeAt).toEqual(at("2026-10-09T01:00:00Z"));
    expect(formatLagos(out.entrySafeAt!, "dd MMM HH:mm")).toBe("09 Oct 02:00");
    expect(out.harvestSafeDate).toBeNull();
  });

  it("REI hours cross UTC midnight while staying on the same Lagos evening", () => {
    // 23:00Z = 00:00 Lagos next day. 22:30Z (23:30 Lagos) + 1 h = 23:30Z.
    const out = computeSafety("spray", at("2026-10-08T22:30:00Z"), [
      { phiDays: null, reiHours: 1 },
    ]);
    expect(out.entrySafeAt).toEqual(at("2026-10-08T23:30:00Z"));
    expect(formatLagos(out.entrySafeAt!, "yyyy-MM-dd HH:mm")).toBe(
      "2026-10-09 00:30",
    );
  });

  it("PHI rolls over month and year ends on the Lagos calendar", () => {
    // 2027-01-01 00:30 Lagos = 2026-12-31 23:30Z.
    const out = computeSafety("spray", at("2026-12-31T23:30:00Z"), [
      { phiDays: 1, reiHours: null },
    ]);
    expect(out.harvestSafeDate).toBe("2027-01-02");
    const feb = computeSafety("spray", at("2028-02-20T09:00:00Z"), [
      { phiDays: 14, reiHours: null },
    ]);
    expect(feb.harvestSafeDate).toBe("2028-03-05"); // 2028 is a leap year
  });
});

describe("computeSafety — null label values are ignored", () => {
  it("uses the non-null value on each axis", () => {
    const applied = at("2026-06-01T09:00:00Z");
    const out = computeSafety("spray", applied, [
      { phiDays: null, reiHours: 12 },
      { phiDays: 3, reiHours: null },
    ]);
    expect(out.entrySafeAt?.getTime()).toBe(applied.getTime() + 12 * HOUR);
    expect(out.harvestSafeDate).toBe("2026-06-04");
  });

  it("all-null labels (e.g. an adjuvant) set no windows", () => {
    expect(
      computeSafety("spray", at("2026-06-01T09:00:00Z"), [
        { phiDays: null, reiHours: null },
      ]),
    ).toEqual({ entrySafeAt: null, harvestSafeDate: null });
  });

  it("a spray with no items sets no windows", () => {
    expect(computeSafety("spray", at("2026-06-01T09:00:00Z"), [])).toEqual({
      entrySafeAt: null,
      harvestSafeDate: null,
    });
  });

  it("only REI → harvest date null; only PHI → entry instant null", () => {
    const applied = at("2026-06-01T09:00:00Z");
    expect(
      computeSafety("spray", applied, [{ phiDays: null, reiHours: 24 }])
        .harvestSafeDate,
    ).toBeNull();
    expect(
      computeSafety("spray", applied, [{ phiDays: 7, reiHours: null }])
        .entrySafeAt,
    ).toBeNull();
  });
});

describe("laterInstant — GREATEST(existing, incoming)", () => {
  const early = at("2026-10-08T09:00:00Z");
  const late = at("2026-10-09T09:00:00Z");

  it("null + null = null", () => {
    expect(laterInstant(null, null)).toBeNull();
  });

  it("null on either side yields the other", () => {
    expect(laterInstant(null, late)).toBe(late);
    expect(laterInstant(early, null)).toBe(early);
  });

  it("keeps the later instant regardless of argument order", () => {
    expect(laterInstant(early, late)).toBe(late);
    expect(laterInstant(late, early)).toBe(late);
  });

  it("a weaker incoming spray never shortens the window", () => {
    const existing = at("2026-10-10T12:00:00Z");
    const weaker = at("2026-10-10T11:59:59Z");
    expect(laterInstant(existing, weaker)).toBe(existing);
  });

  it("equal instants keep the existing value", () => {
    const a = at("2026-10-08T09:00:00Z");
    const b = at("2026-10-08T09:00:00Z");
    expect(laterInstant(a, b)).toBe(a);
  });
});

describe("laterDate — GREATEST on yyyy-MM-dd", () => {
  it("null + null = null", () => {
    expect(laterDate(null, null)).toBeNull();
  });

  it("null on either side yields the other", () => {
    expect(laterDate(null, "2026-10-15")).toBe("2026-10-15");
    expect(laterDate("2026-10-15", null)).toBe("2026-10-15");
  });

  it("keeps the later date regardless of argument order", () => {
    expect(laterDate("2026-10-15", "2026-10-22")).toBe("2026-10-22");
    expect(laterDate("2026-10-22", "2026-10-15")).toBe("2026-10-22");
  });

  it("compares across month and year boundaries", () => {
    expect(laterDate("2026-09-30", "2026-10-01")).toBe("2026-10-01");
    expect(laterDate("2027-01-02", "2026-12-31")).toBe("2027-01-02");
  });

  it("equal dates stay the same", () => {
    expect(laterDate("2026-10-15", "2026-10-15")).toBe("2026-10-15");
  });
});

describe("greenhouse safe-to-enter / safe-to-harvest predicates", () => {
  it("entry: null is safe; future is blocked; the exact instant is safe", () => {
    const now = at("2026-10-08T12:00:00Z");
    expect(isEntrySafe(null, now)).toBe(true);
    expect(isEntrySafe(at("2026-10-08T12:00:01Z"), now)).toBe(false);
    expect(isEntrySafe(at("2026-10-08T12:00:00Z"), now)).toBe(true);
    expect(isEntrySafe("2026-10-08T11:00:00Z", now.toISOString())).toBe(true);
  });

  it("harvest: allowed ON the harvest-safe date, blocked before it", () => {
    expect(isHarvestSafe(null, "2026-10-08")).toBe(true);
    expect(isHarvestSafe("2026-10-09", "2026-10-08")).toBe(false);
    expect(isHarvestSafe("2026-10-08", "2026-10-08")).toBe(true);
    expect(isHarvestSafe("2026-10-01", "2026-10-08")).toBe(true);
  });

  it("safetyStatus judges harvest on the LAGOS date of now", () => {
    // 23:30Z on 10-08 is already 10-09 00:30 in Lagos → harvest allowed.
    const s = safetyStatus(
      { entrySafeAt: null, harvestSafeDate: "2026-10-09" },
      at("2026-10-08T23:30:00Z"),
    );
    expect(s.harvestSafe).toBe(true);
    // 22:30Z on 10-08 is still 10-08 23:30 in Lagos → blocked.
    expect(
      safetyStatus(
        { entrySafeAt: null, harvestSafeDate: "2026-10-09" },
        at("2026-10-08T22:30:00Z"),
      ).harvestSafe,
    ).toBe(false);
  });
});
