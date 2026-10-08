import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { crops, varieties } from "@/db/schema";
import type { Ctx } from "@/lib/guard";

/** Every query takes ctx and filters by ctx.orgId — no exceptions. */

export async function listCrops(ctx: Ctx) {
  return db
    .select({
      id: crops.id,
      name: crops.name,
      shelfLifeDays: crops.shelfLifeDays,
    })
    .from(crops)
    .where(eq(crops.organisationId, ctx.orgId))
    .orderBy(asc(crops.name));
}

export type CropRow = Awaited<ReturnType<typeof listCrops>>[number];

export async function listVarieties(
  ctx: Ctx,
  opts?: { cropId?: string; activeOnly?: boolean },
) {
  const filters = [eq(varieties.organisationId, ctx.orgId)];
  if (opts?.cropId) filters.push(eq(varieties.cropId, opts.cropId));
  if (opts?.activeOnly) filters.push(eq(varieties.isActive, true));
  const rows = await db
    .select({
      id: varieties.id,
      cropId: varieties.cropId,
      cropName: crops.name,
      name: varieties.name,
      daysToFirstHarvest: varieties.daysToFirstHarvest,
      harvestDurationWeeks: varieties.harvestDurationWeeks,
      expectedYieldKgPerPlant: varieties.expectedYieldKgPerPlant,
      notes: varieties.notes,
      isActive: varieties.isActive,
    })
    .from(varieties)
    .innerJoin(
      crops,
      and(eq(crops.id, varieties.cropId), eq(crops.organisationId, ctx.orgId)),
    )
    .where(and(...filters))
    .orderBy(asc(crops.name), asc(varieties.name));
  // numeric columns come back as strings — expose numbers to components.
  return rows.map((r) => ({
    ...r,
    expectedYieldKgPerPlant: Number(r.expectedYieldKgPerPlant),
  }));
}

export type VarietyRow = Awaited<ReturnType<typeof listVarieties>>[number];

export async function getVariety(ctx: Ctx, id: string) {
  const row = await db.query.varieties.findFirst({
    where: and(eq(varieties.id, id), eq(varieties.organisationId, ctx.orgId)),
  });
  if (!row) return null;
  return {
    ...row,
    expectedYieldKgPerPlant: Number(row.expectedYieldKgPerPlant),
  };
}
