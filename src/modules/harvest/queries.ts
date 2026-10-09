import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/db";
import {
  cropCycles,
  crops,
  greenhouses,
  harvestLines,
  harvests,
  produceLots,
  produceMovements,
  stores,
  user,
  varieties,
} from "@/db/schema";
import { todayLagos } from "@/lib/dates";
import type { Ctx } from "@/lib/guard";
import { isHarvestBlocked } from "@/modules/produce/harvest-post";
import { roundQty } from "@/modules/stock/logic";
import type { Grade } from "./schema";

/**
 * Every query takes ctx and filters by ctx.orgId. Workers only see
 * greenhouses they are assigned to. No money anywhere in this module.
 */

const isUuid = (id: string) => z.uuid().safeParse(id).success;

/** Cycles a harvest may be posted on (postHarvest's own rule). */
const HARVESTABLE: ("growing" | "harvesting")[] = ["growing", "harvesting"];

/** Stores harvested produce can land in. */
export const PRODUCE_STORE_TYPES: ("packhouse" | "cold_room")[] = [
  "packhouse",
  "cold_room",
];

/** Worker scoping on a greenhouse-id column; null = no rows visible. */
function greenhouseScope(
  ctx: Ctx,
  column: typeof harvests.greenhouseId | typeof greenhouses.id | typeof cropCycles.greenhouseId,
): SQL | null | undefined {
  if (!ctx.assignedGreenhouseIds) return undefined;
  if (ctx.assignedGreenhouseIds.length === 0) return null;
  return inArray(column, ctx.assignedGreenhouseIds);
}

// ------------------------------------------------------------ form refs

export interface HarvestFormRefs {
  /** Lagos date the refs were computed on (server clock). */
  today: string;
  greenhouses: {
    id: string;
    name: string;
    /** yyyy-MM-dd; harvest allowed ON this date. */
    harvestSafeDate: string | null;
    entrySafeAt: string | null;
    blockedToday: boolean;
  }[];
  cycles: {
    id: string;
    code: string;
    greenhouseId: string;
    status: string;
    cropName: string;
    varietyName: string;
  }[];
  stores: { id: string; name: string; type: "packhouse" | "cold_room" }[];
}

/**
 * Worker-visible greenhouses + their harvestable cycles + produce stores
 * (packhouse first — the default destination) + each greenhouse's PHI date.
 */
export async function getHarvestFormRefs(ctx: Ctx): Promise<HarvestFormRefs> {
  const ghScope = greenhouseScope(ctx, greenhouses.id);
  const cycleScope = greenhouseScope(ctx, cropCycles.greenhouseId);
  const today = todayLagos();

  const [ghRows, cycleRows, storeRows] = await Promise.all([
    ghScope === null
      ? Promise.resolve([])
      : db
          .select({
            id: greenhouses.id,
            name: greenhouses.name,
            harvestSafeDate: greenhouses.harvestSafeDate,
            entrySafeAt: greenhouses.entrySafeAt,
          })
          .from(greenhouses)
          .where(
            and(
              eq(greenhouses.organisationId, ctx.orgId),
              eq(greenhouses.isActive, true),
              ...(ghScope ? [ghScope] : []),
            ),
          )
          .orderBy(asc(greenhouses.name)),
    cycleScope === null
      ? Promise.resolve([])
      : db
          .select({
            id: cropCycles.id,
            code: cropCycles.code,
            greenhouseId: cropCycles.greenhouseId,
            status: cropCycles.status,
            cropName: crops.name,
            varietyName: varieties.name,
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
              inArray(cropCycles.status, HARVESTABLE),
              ...(cycleScope ? [cycleScope] : []),
            ),
          )
          .orderBy(asc(cropCycles.code)),
    db
      .select({ id: stores.id, name: stores.name, type: stores.type })
      .from(stores)
      .where(
        and(
          eq(stores.organisationId, ctx.orgId),
          inArray(stores.type, PRODUCE_STORE_TYPES),
        ),
      )
      .orderBy(
        sql`case when ${stores.type} = 'packhouse' then 0 else 1 end`,
        desc(stores.isDefault),
        asc(stores.name),
      ),
  ]);

  const ghIds = new Set(ghRows.map((g) => g.id));
  return {
    today,
    greenhouses: ghRows.map((g) => ({
      id: g.id,
      name: g.name,
      harvestSafeDate: g.harvestSafeDate,
      entrySafeAt: g.entrySafeAt ? g.entrySafeAt.toISOString() : null,
      blockedToday: isHarvestBlocked(g.harvestSafeDate, today),
    })),
    cycles: cycleRows.filter((c) => ghIds.has(c.greenhouseId)),
    stores: storeRows.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type as "packhouse" | "cold_room",
    })),
  };
}

// ----------------------------------------------------------------- list

export interface HarvestLineView {
  grade: Grade;
  crates: number;
  kg: number;
}

export interface HarvestSummary {
  id: string;
  harvestedAt: string;
  greenhouseId: string;
  greenhouseName: string;
  cropCycleId: string;
  cycleCode: string;
  cropName: string;
  varietyName: string;
  harvestedByName: string | null;
  phiOverride: boolean;
  phiOverrideReason: string | null;
  phiOverrideByName: string | null;
  notes: string | null;
  lines: HarvestLineView[];
  totalKg: number;
  totalCrates: number;
}

const GRADE_ORDER: Record<Grade, number> = { a: 0, b: 1, c: 2, reject: 3 };

const overrideUser = alias(user, "override_user");

function headerQuery(ctx: Ctx, where: SQL[]) {
  return db
    .select({
      id: harvests.id,
      harvestedAt: harvests.harvestedAt,
      greenhouseId: harvests.greenhouseId,
      greenhouseName: greenhouses.name,
      cropCycleId: harvests.cropCycleId,
      cycleCode: cropCycles.code,
      cropName: crops.name,
      varietyName: varieties.name,
      harvestedByName: user.name,
      phiOverride: harvests.phiOverride,
      phiOverrideReason: harvests.phiOverrideReason,
      phiOverrideByName: overrideUser.name,
      notes: harvests.notes,
    })
    .from(harvests)
    .innerJoin(
      greenhouses,
      and(
        eq(greenhouses.id, harvests.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      cropCycles,
      and(
        eq(cropCycles.id, harvests.cropCycleId),
        eq(cropCycles.organisationId, ctx.orgId),
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
    .leftJoin(user, eq(user.id, harvests.harvestedBy))
    .leftJoin(overrideUser, eq(overrideUser.id, harvests.phiOverrideBy))
    .where(and(eq(harvests.organisationId, ctx.orgId), ...where));
}

type HeaderRow = Awaited<ReturnType<typeof headerQuery>>[number];

async function loadLines(
  ctx: Ctx,
  harvestIds: string[],
): Promise<Map<string, HarvestLineView[]>> {
  const out = new Map<string, HarvestLineView[]>();
  if (harvestIds.length === 0) return out;
  const rows = await db
    .select({
      harvestId: harvestLines.harvestId,
      grade: harvestLines.grade,
      crates: harvestLines.crates,
      kg: harvestLines.kg,
    })
    .from(harvestLines)
    .where(
      and(
        eq(harvestLines.organisationId, ctx.orgId),
        inArray(harvestLines.harvestId, harvestIds),
      ),
    );
  for (const r of rows) {
    const list = out.get(r.harvestId) ?? [];
    list.push({
      grade: r.grade,
      crates: Number(r.crates),
      kg: roundQty(Number(r.kg)),
    });
    out.set(r.harvestId, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade]);
  }
  return out;
}

function toSummary(h: HeaderRow, lines: HarvestLineView[]): HarvestSummary {
  return {
    id: h.id,
    harvestedAt: h.harvestedAt.toISOString(),
    greenhouseId: h.greenhouseId,
    greenhouseName: h.greenhouseName,
    cropCycleId: h.cropCycleId,
    cycleCode: h.cycleCode,
    cropName: h.cropName,
    varietyName: h.varietyName,
    harvestedByName: h.harvestedByName,
    phiOverride: h.phiOverride,
    phiOverrideReason: h.phiOverrideReason,
    phiOverrideByName: h.phiOverrideByName,
    notes: h.notes,
    lines,
    totalKg: roundQty(lines.reduce((a, l) => a + l.kg, 0)),
    totalCrates: lines.reduce((a, l) => a + l.crates, 0),
  };
}

export async function listHarvests(
  ctx: Ctx,
  filters?: { greenhouseId?: string; cycleId?: string; limit?: number },
): Promise<HarvestSummary[]> {
  const where: SQL[] = [];
  const scope = greenhouseScope(ctx, harvests.greenhouseId);
  if (scope === null) return [];
  if (scope) where.push(scope);
  if (filters?.greenhouseId) {
    if (!isUuid(filters.greenhouseId)) return [];
    where.push(eq(harvests.greenhouseId, filters.greenhouseId));
  }
  if (filters?.cycleId) {
    if (!isUuid(filters.cycleId)) return [];
    where.push(eq(harvests.cropCycleId, filters.cycleId));
  }
  const headers = await headerQuery(ctx, where)
    .orderBy(desc(harvests.harvestedAt), desc(harvests.createdAt))
    .limit(Math.min(Math.max(filters?.limit ?? 100, 1), 200));
  const lines = await loadLines(
    ctx,
    headers.map((h) => h.id),
  );
  return headers.map((h) => toSummary(h, lines.get(h.id) ?? []));
}

export interface HarvestLotView {
  id: string;
  grade: Grade;
  bestBeforeDate: string;
  /** Current on-hand per store (only stores with stock). */
  stock: { storeId: string; storeName: string; kg: number }[];
}

export type HarvestDetail = HarvestSummary & { lots: HarvestLotView[] };

export async function getHarvest(
  ctx: Ctx,
  id: string,
): Promise<HarvestDetail | null> {
  if (!isUuid(id)) return null;
  const where: SQL[] = [eq(harvests.id, id)];
  const scope = greenhouseScope(ctx, harvests.greenhouseId);
  if (scope === null) return null;
  if (scope) where.push(scope);
  const [h] = await headerQuery(ctx, where);
  if (!h) return null;

  const [lines, lotRows] = await Promise.all([
    loadLines(ctx, [h.id]),
    db
      .select({
        id: produceLots.id,
        grade: produceLots.grade,
        bestBeforeDate: produceLots.bestBeforeDate,
      })
      .from(produceLots)
      .where(
        and(eq(produceLots.organisationId, ctx.orgId), eq(produceLots.harvestId, h.id)),
      ),
  ]);

  const stockRows =
    lotRows.length === 0
      ? []
      : await db
          .select({
            lotId: produceMovements.produceLotId,
            storeId: produceMovements.storeId,
            storeName: stores.name,
            kg: sql<string>`sum(${produceMovements.kg})`,
          })
          .from(produceMovements)
          .innerJoin(
            stores,
            and(
              eq(stores.id, produceMovements.storeId),
              eq(stores.organisationId, ctx.orgId),
            ),
          )
          .where(
            and(
              eq(produceMovements.organisationId, ctx.orgId),
              inArray(
                produceMovements.produceLotId,
                lotRows.map((l) => l.id),
              ),
            ),
          )
          .groupBy(produceMovements.produceLotId, produceMovements.storeId, stores.name)
          .having(sql`sum(${produceMovements.kg}) > 0`);

  const lots: HarvestLotView[] = lotRows
    .map((l) => ({
      id: l.id,
      grade: l.grade,
      bestBeforeDate: l.bestBeforeDate,
      stock: stockRows
        .filter((s) => s.lotId === l.id)
        .map((s) => ({
          storeId: s.storeId,
          storeName: s.storeName,
          kg: roundQty(Number(s.kg)),
        })),
    }))
    .sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade]);

  return { ...toSummary(h, lines.get(h.id) ?? []), lots };
}
