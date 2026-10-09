import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  cropCycles,
  files,
  greenhouses,
  scoutingLogs,
  user,
  varieties,
} from "@/db/schema";
import { storage } from "@/adapters/storage";
import type { Ctx } from "@/lib/guard";

/**
 * Every query takes ctx and filters by ctx.orgId — no exceptions.
 * Workers only see cycles in their assigned greenhouses. No money here.
 */

/** The cycle header for the scouting screens; null when missing or not visible. */
export async function getScoutingCycle(ctx: Ctx, cycleId: string) {
  const [row] = await db
    .select({
      id: cropCycles.id,
      code: cropCycles.code,
      status: cropCycles.status,
      greenhouseId: cropCycles.greenhouseId,
      greenhouseName: greenhouses.name,
      varietyName: varieties.name,
    })
    .from(cropCycles)
    .innerJoin(greenhouses, eq(greenhouses.id, cropCycles.greenhouseId))
    .innerJoin(varieties, eq(varieties.id, cropCycles.varietyId))
    .where(
      and(eq(cropCycles.id, cycleId), eq(cropCycles.organisationId, ctx.orgId)),
    )
    .limit(1);
  if (!row) return null;
  if (
    ctx.assignedGreenhouseIds &&
    !ctx.assignedGreenhouseIds.includes(row.greenhouseId)
  ) {
    return null;
  }
  return row;
}

export type ScoutingCycle = NonNullable<
  Awaited<ReturnType<typeof getScoutingCycle>>
>;

/** Scouting logs of one cycle, newest first, with a photo URL when present. */
export async function listScoutingLogs(ctx: Ctx, cycleId: string) {
  const cycle = await getScoutingCycle(ctx, cycleId);
  if (!cycle) return [];

  const rows = await db
    .select({
      id: scoutingLogs.id,
      date: scoutingLogs.date,
      pestOrDisease: scoutingLogs.pestOrDisease,
      severity: scoutingLogs.severity,
      actionTaken: scoutingLogs.actionTaken,
      createdAt: scoutingLogs.createdAt,
      createdByName: user.name,
      photoKey: files.storageKey,
    })
    .from(scoutingLogs)
    .leftJoin(
      files,
      and(
        eq(files.id, scoutingLogs.photoFileId),
        eq(files.organisationId, ctx.orgId),
      ),
    )
    .leftJoin(user, eq(user.id, scoutingLogs.createdBy))
    .where(
      and(
        eq(scoutingLogs.organisationId, ctx.orgId),
        eq(scoutingLogs.cropCycleId, cycle.id),
      ),
    )
    .orderBy(desc(scoutingLogs.date), desc(scoutingLogs.createdAt));

  return rows.map(({ photoKey, createdAt, ...r }) => ({
    ...r,
    createdAt: createdAt.toISOString(),
    photoUrl: photoKey ? storage.getUrl(photoKey) : null,
  }));
}

export type ScoutingLogRow = Awaited<
  ReturnType<typeof listScoutingLogs>
>[number];
