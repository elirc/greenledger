import { and, asc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { climateReadings, user } from "@/db/schema";
import type { Ctx } from "@/lib/guard";
import { listGreenhouses } from "@/modules/farm/queries";
import { READINGS_WINDOW_DAYS } from "./schema";

/**
 * Every query takes ctx and filters by ctx.orgId — no exceptions. Workers
 * see only their assigned greenhouses. No money in this module.
 */

const isUuid = (id: string) => z.uuid().safeParse(id).success;

/** Active greenhouses this member may log readings for. */
export async function getReadingGreenhouses(ctx: Ctx) {
  const rows = await listGreenhouses(ctx, { activeOnly: true });
  return rows.map((g) => ({ id: g.id, name: g.name }));
}
export type ReadingGreenhouse = Awaited<
  ReturnType<typeof getReadingGreenhouses>
>[number];

export interface ReadingPoint {
  id: string;
  /** epoch ms (UTC instant) — charts format it in Lagos time. */
  t: number;
  temperatureC: number | null;
  humidityPct: number | null;
  ecMsCm: number | null;
  ph: number | null;
  recordedByName: string | null;
}

const toNum = (v: string | null) => (v === null ? null : Number(v));

/** One greenhouse's readings over the last `days` days, oldest first. */
export async function listGreenhouseReadings(
  ctx: Ctx,
  greenhouseId: string,
  days = READINGS_WINDOW_DAYS,
): Promise<ReadingPoint[]> {
  if (!isUuid(greenhouseId)) return [];
  if (ctx.assignedGreenhouseIds && !ctx.assignedGreenhouseIds.includes(greenhouseId)) {
    return [];
  }
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      id: climateReadings.id,
      recordedAt: climateReadings.recordedAt,
      temperatureC: climateReadings.temperatureC,
      humidityPct: climateReadings.humidityPct,
      ecMsCm: climateReadings.ecMsCm,
      ph: climateReadings.ph,
      recordedByName: user.name,
    })
    .from(climateReadings)
    .leftJoin(user, eq(user.id, climateReadings.recordedBy))
    .where(
      and(
        eq(climateReadings.organisationId, ctx.orgId),
        eq(climateReadings.greenhouseId, greenhouseId),
        gte(climateReadings.recordedAt, since),
      ),
    )
    .orderBy(asc(climateReadings.recordedAt));

  return rows.map((r) => ({
    id: r.id,
    t: r.recordedAt.getTime(),
    temperatureC: toNum(r.temperatureC),
    humidityPct: toNum(r.humidityPct),
    ecMsCm: toNum(r.ecMsCm),
    ph: toNum(r.ph),
    recordedByName: r.recordedByName,
  }));
}
