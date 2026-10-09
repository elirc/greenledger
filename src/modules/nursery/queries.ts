import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cropCycles,
  crops,
  greenhouses,
  itemBatches,
  items,
  nurseryBatches,
  user,
  varieties,
} from "@/db/schema";
import type { Ctx } from "@/lib/guard";

/**
 * Every query takes ctx and filters by ctx.orgId — no exceptions.
 * No money columns are selected anywhere in this file (workers read it).
 */

/** Whole days since sowing, on the Lagos calendar. */
const ageDays = sql<number>`((now() at time zone 'Africa/Lagos')::date - ${nurseryBatches.sowDate})`;

export async function listNurseryBatches(ctx: Ctx) {
  const rows = await db
    .select({
      id: nurseryBatches.id,
      varietyName: varieties.name,
      cropName: crops.name,
      sowDate: nurseryBatches.sowDate,
      trays: nurseryBatches.trays,
      seedsSown: nurseryBatches.seedsSown,
      germinated: nurseryBatches.germinated,
      ready: nurseryBatches.ready,
      transplanted: nurseryBatches.transplanted,
      discarded: nurseryBatches.discarded,
      status: nurseryBatches.status,
      ageDays,
    })
    .from(nurseryBatches)
    .innerJoin(
      varieties,
      and(
        eq(varieties.id, nurseryBatches.varietyId),
        eq(varieties.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      crops,
      and(eq(crops.id, varieties.cropId), eq(crops.organisationId, ctx.orgId)),
    )
    .where(eq(nurseryBatches.organisationId, ctx.orgId))
    .orderBy(
      sql`case when ${nurseryBatches.status} = 'open' then 0 else 1 end`,
      desc(nurseryBatches.sowDate),
      desc(nurseryBatches.createdAt),
    );
  return rows.map((r) => ({ ...r, ageDays: Number(r.ageDays) }));
}

export type NurseryBatchListRow = Awaited<
  ReturnType<typeof listNurseryBatches>
>[number];

export async function getNurseryBatch(ctx: Ctx, id: string) {
  const [row] = await db
    .select({
      id: nurseryBatches.id,
      varietyId: nurseryBatches.varietyId,
      varietyName: varieties.name,
      cropName: crops.name,
      sowDate: nurseryBatches.sowDate,
      trays: nurseryBatches.trays,
      cellsPerTray: nurseryBatches.cellsPerTray,
      seedsSown: nurseryBatches.seedsSown,
      germinated: nurseryBatches.germinated,
      ready: nurseryBatches.ready,
      transplanted: nurseryBatches.transplanted,
      discarded: nurseryBatches.discarded,
      status: nurseryBatches.status,
      notes: nurseryBatches.notes,
      seedItemBatchId: nurseryBatches.seedItemBatchId,
      createdByName: user.name,
      createdAt: nurseryBatches.createdAt,
      ageDays,
    })
    .from(nurseryBatches)
    .innerJoin(
      varieties,
      and(
        eq(varieties.id, nurseryBatches.varietyId),
        eq(varieties.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      crops,
      and(eq(crops.id, varieties.cropId), eq(crops.organisationId, ctx.orgId)),
    )
    .leftJoin(user, eq(user.id, nurseryBatches.createdBy))
    .where(
      and(
        eq(nurseryBatches.id, id),
        eq(nurseryBatches.organisationId, ctx.orgId),
      ),
    )
    .limit(1);
  if (!row) return null;

  let seed: { itemName: string; batchNumber: string } | null = null;
  if (row.seedItemBatchId) {
    const [s] = await db
      .select({ itemName: items.name, batchNumber: itemBatches.batchNumber })
      .from(itemBatches)
      .innerJoin(
        items,
        and(eq(items.id, itemBatches.itemId), eq(items.organisationId, ctx.orgId)),
      )
      .where(
        and(
          eq(itemBatches.id, row.seedItemBatchId),
          eq(itemBatches.organisationId, ctx.orgId),
        ),
      )
      .limit(1);
    seed = s ?? null;
  }

  // Cycles started from this batch (workers: only their greenhouses).
  const cycleFilters = [
    eq(cropCycles.organisationId, ctx.orgId),
    eq(cropCycles.nurseryBatchId, id),
  ];
  if (ctx.assignedGreenhouseIds) {
    cycleFilters.push(
      ctx.assignedGreenhouseIds.length > 0
        ? inArray(cropCycles.greenhouseId, ctx.assignedGreenhouseIds)
        : sql`false`,
    );
  }
  const cycles = await db
    .select({
      id: cropCycles.id,
      code: cropCycles.code,
      greenhouseName: greenhouses.name,
      transplantDate: cropCycles.transplantDate,
      plantsTransplanted: cropCycles.plantsTransplanted,
      status: cropCycles.status,
    })
    .from(cropCycles)
    .innerJoin(
      greenhouses,
      and(
        eq(greenhouses.id, cropCycles.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    )
    .where(and(...cycleFilters))
    .orderBy(asc(cropCycles.transplantDate), asc(cropCycles.code));

  return { ...row, ageDays: Number(row.ageDays), seed, cycles };
}

export type NurseryBatchDetail = NonNullable<
  Awaited<ReturnType<typeof getNurseryBatch>>
>;

/**
 * Seed item batches for the "seed used" combobox — read-only over the
 * inventory schema, category seed only, no cost columns.
 */
export async function listSeedBatchOptions(ctx: Ctx) {
  return db
    .select({
      id: itemBatches.id,
      itemName: items.name,
      batchNumber: itemBatches.batchNumber,
      expiryDate: itemBatches.expiryDate,
    })
    .from(itemBatches)
    .innerJoin(
      items,
      and(eq(items.id, itemBatches.itemId), eq(items.organisationId, ctx.orgId)),
    )
    .where(
      and(
        eq(itemBatches.organisationId, ctx.orgId),
        eq(items.category, "seed"),
      ),
    )
    .orderBy(asc(items.name), desc(itemBatches.receivedAt));
}

export type SeedBatchOption = Awaited<
  ReturnType<typeof listSeedBatchOptions>
>[number];
