import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  cropCycles,
  crops,
  greenhouses,
  plantLosses,
  varieties,
  zones,
} from "@/db/schema";
import type { Ctx } from "@/lib/guard";
import { ACTIVE_CYCLE_STATUSES } from "./status";

/**
 * Every query takes ctx and filters by ctx.orgId — no exceptions. Workers
 * only ever see cycles/greenhouses they are assigned to. No money columns
 * are selected here (greenhouse money KPIs arrive later, canSeeMoney-gated).
 */

/** URL ids are uuids; anything else is simply "not found". */
const isUuid = (id: string) => z.uuid().safeParse(id).success;

/** Worker scoping on a greenhouse-id column; null = no rows visible. */
function greenhouseScope(
  ctx: Ctx,
  column: typeof cropCycles.greenhouseId | typeof greenhouses.id,
): SQL | null | undefined {
  if (!ctx.assignedGreenhouseIds) return undefined;
  if (ctx.assignedGreenhouseIds.length === 0) return null;
  return inArray(column, ctx.assignedGreenhouseIds);
}

const cycleListColumns = {
  id: cropCycles.id,
  code: cropCycles.code,
  status: cropCycles.status,
  greenhouseId: cropCycles.greenhouseId,
  greenhouseName: greenhouses.name,
  varietyId: cropCycles.varietyId,
  varietyName: varieties.name,
  cropName: crops.name,
  sowDate: cropCycles.sowDate,
  transplantDate: cropCycles.transplantDate,
  plantsTransplanted: cropCycles.plantsTransplanted,
  plantsAlive: cropCycles.plantsAlive,
  expectedFirstHarvest: cropCycles.expectedFirstHarvest,
  expectedEnd: cropCycles.expectedEnd,
  closedAt: cropCycles.closedAt,
  createdAt: cropCycles.createdAt,
};

export async function listCycles(
  ctx: Ctx,
  opts?: { greenhouseId?: string },
) {
  const filters: SQL[] = [eq(cropCycles.organisationId, ctx.orgId)];
  const scope = greenhouseScope(ctx, cropCycles.greenhouseId);
  if (scope === null) return [];
  if (scope) filters.push(scope);
  if (opts?.greenhouseId) {
    filters.push(eq(cropCycles.greenhouseId, opts.greenhouseId));
  }
  return db
    .select(cycleListColumns)
    .from(cropCycles)
    .innerJoin(
      greenhouses,
      and(
        eq(greenhouses.id, cropCycles.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      varieties,
      and(
        eq(varieties.id, cropCycles.varietyId),
        eq(varieties.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      crops,
      and(eq(crops.id, varieties.cropId), eq(crops.organisationId, ctx.orgId)),
    )
    .where(and(...filters))
    .orderBy(
      desc(sql`coalesce(${cropCycles.transplantDate}, ${cropCycles.sowDate})`),
      desc(cropCycles.createdAt),
    );
}

export type CycleListRow = Awaited<ReturnType<typeof listCycles>>[number];

/** Cycle detail. Returns null when missing, in another org, or unassigned. */
export async function getCycle(ctx: Ctx, id: string) {
  if (!isUuid(id)) return null;
  const filters: SQL[] = [
    eq(cropCycles.id, id),
    eq(cropCycles.organisationId, ctx.orgId),
  ];
  const scope = greenhouseScope(ctx, cropCycles.greenhouseId);
  if (scope === null) return null;
  if (scope) filters.push(scope);

  const [row] = await db
    .select({
      ...cycleListColumns,
      zoneName: zones.name,
      nurseryBatchId: cropCycles.nurseryBatchId,
      notes: cropCycles.notes,
      daysToFirstHarvest: varieties.daysToFirstHarvest,
      harvestDurationWeeks: varieties.harvestDurationWeeks,
    })
    .from(cropCycles)
    .innerJoin(
      greenhouses,
      and(
        eq(greenhouses.id, cropCycles.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      varieties,
      and(
        eq(varieties.id, cropCycles.varietyId),
        eq(varieties.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      crops,
      and(eq(crops.id, varieties.cropId), eq(crops.organisationId, ctx.orgId)),
    )
    .leftJoin(
      zones,
      and(
        eq(zones.id, cropCycles.zoneId),
        eq(zones.organisationId, ctx.orgId),
      ),
    )
    .where(and(...filters));
  if (!row) return null;

  const [losses] = await db
    .select({ total: sql<string>`coalesce(sum(${plantLosses.count}), 0)` })
    .from(plantLosses)
    .where(
      and(
        eq(plantLosses.organisationId, ctx.orgId),
        eq(plantLosses.cropCycleId, id),
      ),
    );

  return { ...row, lossesTotal: Number(losses?.total ?? 0) };
}

export type CycleDetail = NonNullable<Awaited<ReturnType<typeof getCycle>>>;

/** Reference data for the plan-a-cycle form (active greenhouses + varieties). */
export async function getCyclePlanRefs(ctx: Ctx) {
  const ghFilters: SQL[] = [
    eq(greenhouses.organisationId, ctx.orgId),
    eq(greenhouses.isActive, true),
  ];
  const scope = greenhouseScope(ctx, greenhouses.id);
  const [ghRows, varietyRows] = await Promise.all([
    scope === null
      ? Promise.resolve([] as { id: string; name: string }[])
      : db
          .select({ id: greenhouses.id, name: greenhouses.name })
          .from(greenhouses)
          .where(and(...ghFilters, ...(scope ? [scope] : [])))
          .orderBy(asc(greenhouses.name)),
    db
      .select({
        id: varieties.id,
        name: varieties.name,
        cropName: crops.name,
      })
      .from(varieties)
      .innerJoin(
        crops,
        and(
          eq(crops.id, varieties.cropId),
          eq(crops.organisationId, ctx.orgId),
        ),
      )
      .where(
        and(
          eq(varieties.organisationId, ctx.orgId),
          eq(varieties.isActive, true),
        ),
      )
      .orderBy(asc(crops.name), asc(varieties.name)),
  ]);
  return { greenhouses: ghRows, varieties: varietyRows };
}

export type CyclePlanRefs = Awaited<ReturnType<typeof getCyclePlanRefs>>;

// ------------------------------------------------------------ greenhouses

const greenhouseCardColumns = {
  id: greenhouses.id,
  name: greenhouses.name,
  type: greenhouses.type,
  areaM2: greenhouses.areaM2,
  plantCapacity: greenhouses.plantCapacity,
  isActive: greenhouses.isActive,
  entrySafeAt: greenhouses.entrySafeAt,
  harvestSafeDate: greenhouses.harvestSafeDate,
};

type ActiveCycleSummary = {
  id: string;
  code: string;
  status: CycleListRow["status"];
  varietyName: string;
  cropName: string;
  plantsAlive: number;
};

/** Active cycles (nursery/growing/harvesting) for the given greenhouses. */
async function activeCyclesFor(ctx: Ctx, greenhouseIds: string[]) {
  if (greenhouseIds.length === 0) return new Map<string, ActiveCycleSummary[]>();
  const rows = await db
    .select({
      id: cropCycles.id,
      greenhouseId: cropCycles.greenhouseId,
      code: cropCycles.code,
      status: cropCycles.status,
      varietyName: varieties.name,
      cropName: crops.name,
      plantsAlive: cropCycles.plantsAlive,
    })
    .from(cropCycles)
    .innerJoin(
      varieties,
      and(
        eq(varieties.id, cropCycles.varietyId),
        eq(varieties.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      crops,
      and(eq(crops.id, varieties.cropId), eq(crops.organisationId, ctx.orgId)),
    )
    .where(
      and(
        eq(cropCycles.organisationId, ctx.orgId),
        inArray(cropCycles.greenhouseId, greenhouseIds),
        inArray(cropCycles.status, ACTIVE_CYCLE_STATUSES),
      ),
    )
    .orderBy(desc(cropCycles.transplantDate), desc(cropCycles.createdAt));
  const byGh = new Map<string, ActiveCycleSummary[]>();
  for (const { greenhouseId, ...r } of rows) {
    const list = byGh.get(greenhouseId) ?? [];
    list.push(r);
    byGh.set(greenhouseId, list);
  }
  return byGh;
}

/** One card per greenhouse (workers: assigned only), with its active cycles. */
export async function listGreenhouseCards(ctx: Ctx) {
  const scope = greenhouseScope(ctx, greenhouses.id);
  if (scope === null) return [];
  const rows = await db
    .select(greenhouseCardColumns)
    .from(greenhouses)
    .where(
      and(eq(greenhouses.organisationId, ctx.orgId), ...(scope ? [scope] : [])),
    )
    .orderBy(desc(greenhouses.isActive), asc(greenhouses.name));
  const active = await activeCyclesFor(
    ctx,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    ...r,
    areaM2: Number(r.areaM2),
    activeCycles: active.get(r.id) ?? [],
  }));
}

export type GreenhouseCardRow = Awaited<
  ReturnType<typeof listGreenhouseCards>
>[number];

/** Greenhouse detail. Returns null when missing, in another org, or unassigned. */
export async function getGreenhouseCard(ctx: Ctx, id: string) {
  if (!isUuid(id)) return null;
  const scope = greenhouseScope(ctx, greenhouses.id);
  if (scope === null) return null;
  const [row] = await db
    .select({ ...greenhouseCardColumns, notes: greenhouses.notes })
    .from(greenhouses)
    .where(
      and(
        eq(greenhouses.id, id),
        eq(greenhouses.organisationId, ctx.orgId),
        ...(scope ? [scope] : []),
      ),
    );
  if (!row) return null;
  const active = await activeCyclesFor(ctx, [row.id]);
  return {
    ...row,
    areaM2: Number(row.areaM2),
    activeCycles: active.get(row.id) ?? [],
  };
}

export type GreenhouseCardDetail = NonNullable<
  Awaited<ReturnType<typeof getGreenhouseCard>>
>;
