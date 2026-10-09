import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { cropCycles, plantLosses, user } from "@/db/schema";
import type { Ctx } from "@/lib/guard";

/**
 * Every query takes ctx and filters by ctx.orgId — no exceptions. Workers
 * see losses only for cycles in their assigned greenhouses. No money here.
 */
export async function listPlantLosses(ctx: Ctx, cropCycleId: string) {
  const filters: SQL[] = [
    eq(plantLosses.organisationId, ctx.orgId),
    eq(plantLosses.cropCycleId, cropCycleId),
  ];
  if (ctx.assignedGreenhouseIds) {
    if (ctx.assignedGreenhouseIds.length === 0) return [];
    filters.push(inArray(cropCycles.greenhouseId, ctx.assignedGreenhouseIds));
  }
  return db
    .select({
      id: plantLosses.id,
      date: plantLosses.date,
      count: plantLosses.count,
      cause: plantLosses.cause,
      notes: plantLosses.notes,
      createdAt: plantLosses.createdAt,
      createdByName: user.name,
    })
    .from(plantLosses)
    .innerJoin(
      cropCycles,
      and(
        eq(cropCycles.id, plantLosses.cropCycleId),
        eq(cropCycles.organisationId, ctx.orgId),
      ),
    )
    .leftJoin(user, eq(user.id, plantLosses.createdBy))
    .where(and(...filters))
    .orderBy(desc(plantLosses.date), desc(plantLosses.createdAt));
}

export type PlantLossRow = Awaited<ReturnType<typeof listPlantLosses>>[number];
