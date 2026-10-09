import { z } from "zod";
import { lagosLocalToDate } from "@/modules/applications/schema";

/** Shared between the client form (zodResolver), the action and /api/sync. */

export const METRICS = ["temperatureC", "humidityPct", "ecMsCm", "ph"] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_META: Record<
  Metric,
  { label: string; unit: string; axis: string; decimals: number }
> = {
  temperatureC: { label: "Temperature", unit: "°C", axis: "°C", decimals: 1 },
  humidityPct: { label: "Humidity", unit: "%", axis: "% RH", decimals: 0 },
  ecMsCm: { label: "EC", unit: "mS/cm", axis: "mS/cm", decimals: 2 },
  ph: { label: "pH", unit: "", axis: "pH", decimals: 2 },
};

/** Sensible physical bounds — typos (e.g. 330 °C) are caught at entry. */
const temperature = z
  .number({ error: "Enter a number" })
  .min(-10, "Too low for a greenhouse")
  .max(60, "Too high — check the reading")
  .optional();
const humidity = z
  .number({ error: "Enter a number" })
  .min(0, "0–100 %")
  .max(100, "0–100 %")
  .optional();
const ec = z
  .number({ error: "Enter a number" })
  .min(0, "Cannot be negative")
  .max(20, "Too high — check the units (mS/cm)")
  .optional();
const ph = z
  .number({ error: "Enter a number" })
  .min(0, "0–14")
  .max(14, "0–14")
  .optional();

export const readingCreateSchema = z
  .object({
    /** Client UUID (offline sync hook) — becomes the climate_readings PK. */
    clientId: z.uuid(),
    greenhouseId: z.uuid({ error: "Pick a greenhouse" }),
    /** Lagos wall time from `<input type="datetime-local">`. */
    recordedAt: z
      .string()
      .min(1, "Enter the date and time")
      .refine((v) => lagosLocalToDate(v) !== null, "Enter a valid date and time"),
    temperatureC: temperature,
    humidityPct: humidity,
    ecMsCm: ec,
    ph,
  })
  .refine(
    (v) => METRICS.some((m) => v[m] !== undefined),
    { path: ["temperatureC"], error: "Enter at least one reading" },
  );
export type ReadingCreateInput = z.infer<typeof readingCreateSchema>;

/** Chart window (days) on /readings. */
export const READINGS_WINDOW_DAYS = 14;
