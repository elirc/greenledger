import { describe, expect, it } from "vitest";
import {
  addWeeks,
  cycleForecast,
  farmForecast,
  forecastVsActual,
  isoWeekStart,
  type ForecastCycle,
} from "@/modules/produce/forecast";
import { weekLabel } from "@/modules/forecast/logic";

/** 2026-10-08 is a Thursday; its ISO week starts Monday 2026-10-05. */
const THU = "2026-10-08";

function cycle(over: Partial<ForecastCycle> = {}): ForecastCycle {
  return {
    cycleId: "c1",
    plantsAlive: 1000,
    expectedYieldKgPerPlant: 4.5,
    harvestDurationWeeks: 10,
    expectedFirstHarvest: THU,
    ...over,
  };
}

describe("isoWeekStart", () => {
  it("maps a Monday to itself", () => {
    expect(isoWeekStart("2026-10-05")).toBe("2026-10-05");
  });

  it("maps mid-week days back to Monday", () => {
    expect(isoWeekStart("2026-10-06")).toBe("2026-10-05");
    expect(isoWeekStart(THU)).toBe("2026-10-05");
    expect(isoWeekStart("2026-10-10")).toBe("2026-10-05"); // Saturday
  });

  it("treats Sunday as the LAST day of the ISO week (not the first)", () => {
    expect(isoWeekStart("2026-10-11")).toBe("2026-10-05");
    // the next day (Monday) starts a new week
    expect(isoWeekStart("2026-10-12")).toBe("2026-10-12");
  });

  it("crosses month and year boundaries", () => {
    expect(isoWeekStart("2026-11-01")).toBe("2026-10-26"); // Sunday
    expect(isoWeekStart("2027-01-01")).toBe("2026-12-28"); // Friday
    expect(isoWeekStart("2027-01-03")).toBe("2026-12-28"); // Sunday
    expect(isoWeekStart("2027-01-04")).toBe("2027-01-04"); // Monday
  });

  it("handles the leap day", () => {
    expect(isoWeekStart("2028-02-29")).toBe("2028-02-28"); // Tuesday
  });
});

describe("addWeeks", () => {
  it("steps by whole weeks across a year end", () => {
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
    expect(addWeeks("2026-10-05", 0)).toBe("2026-10-05");
    expect(addWeeks("2026-10-05", -1)).toBe("2026-09-28");
  });
});

describe("cycleForecast", () => {
  it("1000 plants × 4.5 kg ÷ 10 weeks = 450 kg/week for 10 weeks", () => {
    const weeks = cycleForecast(cycle());
    expect(weeks).toHaveLength(10);
    for (const w of weeks) expect(w.kg).toBe(450);
    expect(weeks.reduce((s, w) => s + w.kg, 0)).toBe(4500);
  });

  it("starts on the Monday of expected_first_harvest's ISO week, one week apart", () => {
    const weeks = cycleForecast(cycle());
    expect(weeks[0].weekStart).toBe("2026-10-05");
    expect(weeks[1].weekStart).toBe("2026-10-12");
    expect(weeks[9].weekStart).toBe("2026-12-07");
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i].weekStart).toBe(addWeeks(weeks[i - 1].weekStart, 1));
    }
  });

  it("a Sunday first-harvest date still starts in that Sunday's ISO week", () => {
    const weeks = cycleForecast(cycle({ expectedFirstHarvest: "2026-10-11" }));
    expect(weeks[0].weekStart).toBe("2026-10-05");
  });

  it("rounds the weekly figure to the 3-decimal quantity grid", () => {
    // 950 × 2.0 ÷ 12 = 158.3333…
    const weeks = cycleForecast(
      cycle({ plantsAlive: 950, expectedYieldKgPerPlant: 2, harvestDurationWeeks: 12 }),
    );
    expect(weeks).toHaveLength(12);
    expect(weeks[0].kg).toBe(158.333);
  });

  it("returns no weeks without an expected first-harvest date", () => {
    expect(cycleForecast(cycle({ expectedFirstHarvest: null }))).toEqual([]);
  });

  it("returns no weeks for 0 plants alive (or a negative count)", () => {
    expect(cycleForecast(cycle({ plantsAlive: 0 }))).toEqual([]);
    expect(cycleForecast(cycle({ plantsAlive: -5 }))).toEqual([]);
  });

  it("returns no weeks for a 0-week harvest duration (no divide by zero)", () => {
    expect(cycleForecast(cycle({ harvestDurationWeeks: 0 }))).toEqual([]);
  });

  it("returns no weeks for a 0 kg/plant yield", () => {
    expect(cycleForecast(cycle({ expectedYieldKgPerPlant: 0 }))).toEqual([]);
  });

  it("a single-week harvest puts the whole crop in one week", () => {
    expect(cycleForecast(cycle({ harvestDurationWeeks: 1 }))).toEqual([
      { weekStart: "2026-10-05", kg: 4500 },
    ]);
  });
});

describe("farmForecast", () => {
  it("sums overlapping weeks across cycles and keeps non-overlapping ones", () => {
    const tomato = cycle({ cycleId: "t", harvestDurationWeeks: 3 }); // 1500/wk from 10-05
    const pepper = cycle({
      cycleId: "p",
      plantsAlive: 600,
      expectedYieldKgPerPlant: 2,
      harvestDurationWeeks: 4, // 300/wk
      expectedFirstHarvest: "2026-10-14", // week of 10-12
    });
    expect(farmForecast([tomato, pepper])).toEqual([
      { weekStart: "2026-10-05", kg: 1500 },
      { weekStart: "2026-10-12", kg: 1800 },
      { weekStart: "2026-10-19", kg: 1800 },
      { weekStart: "2026-10-26", kg: 300 },
      { weekStart: "2026-11-02", kg: 300 },
    ]);
  });

  it("is sorted by week regardless of input order", () => {
    const late = cycle({ cycleId: "late", expectedFirstHarvest: "2026-12-01", harvestDurationWeeks: 1 });
    const early = cycle({ cycleId: "early", expectedFirstHarvest: "2026-09-01", harvestDurationWeeks: 1 });
    const weeks = farmForecast([late, early]).map((w) => w.weekStart);
    expect(weeks).toEqual([...weeks].sort());
    expect(weeks[0]).toBe("2026-08-31");
  });

  it("ignores cycles that cannot be forecast and is empty for none", () => {
    expect(farmForecast([])).toEqual([]);
    expect(
      farmForecast([cycle({ expectedFirstHarvest: null }), cycle({ plantsAlive: 0 })]),
    ).toEqual([]);
    expect(
      farmForecast([cycle({ harvestDurationWeeks: 1 }), cycle({ plantsAlive: 0 })]),
    ).toEqual([{ weekStart: "2026-10-05", kg: 4500 }]);
  });

  it("keeps sums on the 3-decimal grid (no float drift)", () => {
    const a = cycle({ cycleId: "a", plantsAlive: 1, expectedYieldKgPerPlant: 0.1, harvestDurationWeeks: 1 });
    const b = cycle({ cycleId: "b", plantsAlive: 1, expectedYieldKgPerPlant: 0.2, harvestDurationWeeks: 1 });
    expect(farmForecast([a, b])).toEqual([{ weekStart: "2026-10-05", kg: 0.3 }]);
  });
});

describe("forecastVsActual", () => {
  it("zero-fills actual for forecast-only weeks and forecast for actual-only weeks", () => {
    const rows = forecastVsActual(
      [
        { weekStart: "2026-10-05", kg: 450 },
        { weekStart: "2026-10-12", kg: 450 },
      ],
      [
        { weekStart: "2026-09-28", kg: 80 }, // early pick before the window
        { weekStart: "2026-10-05", kg: 410.5 },
      ],
    );
    expect(rows).toEqual([
      { weekStart: "2026-09-28", forecastKg: 0, actualKg: 80 },
      { weekStart: "2026-10-05", forecastKg: 450, actualKg: 410.5 },
      { weekStart: "2026-10-12", forecastKg: 450, actualKg: 0 },
    ]);
  });

  it("sums duplicate actual entries for the same week", () => {
    const rows = forecastVsActual(
      [{ weekStart: "2026-10-05", kg: 450 }],
      [
        { weekStart: "2026-10-05", kg: 100.1 },
        { weekStart: "2026-10-05", kg: 200.2 },
      ],
    );
    expect(rows).toEqual([
      { weekStart: "2026-10-05", forecastKg: 450, actualKg: 300.3 },
    ]);
  });

  it("returns forecast weeks with zero actual when nothing was harvested", () => {
    const forecast = cycleForecast(cycle({ harvestDurationWeeks: 2 }));
    expect(forecastVsActual(forecast, [])).toEqual([
      { weekStart: "2026-10-05", forecastKg: 450 * 5, actualKg: 0 },
      { weekStart: "2026-10-12", forecastKg: 450 * 5, actualKg: 0 },
    ]);
  });

  it("is empty when both sides are empty", () => {
    expect(forecastVsActual([], [])).toEqual([]);
  });
});

describe("weekLabel (chart ticks)", () => {
  it("formats a Monday as Lagos 'dd MMM'", () => {
    expect(weekLabel("2026-10-05")).toBe("05 Oct");
    expect(weekLabel("2026-12-28")).toBe("28 Dec");
  });
});
