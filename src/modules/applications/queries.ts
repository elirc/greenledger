import { and, asc, desc, eq, gt, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  applicationItems,
  applications,
  cropCycles,
  greenhouses,
  inventoryMovements,
  itemBatches,
  items,
  recipeLines,
  recipes,
  stores,
  user,
} from "@/db/schema";
import { todayLagos } from "@/lib/dates";
import type { Ctx } from "@/lib/guard";
import { rateTimesQty } from "@/lib/money";
import type { BaseUnit } from "@/lib/units";
import type { ItemCategory } from "@/modules/items/schema";
import { ACTIVE_CYCLE_STATUSES } from "@/modules/cycles/status";
import { roundQty } from "@/modules/stock/logic";
import type { ApplicationType } from "./schema";

/**
 * Every query takes ctx and filters by ctx.orgId — no exceptions. Workers
 * only see greenhouses they are assigned to. Money (input cost of issued
 * lines) is selected ONLY when ctx.canSeeMoney; workers get null.
 */

const isUuid = (id: string) => z.uuid().safeParse(id).success;

/** Worker scoping on a greenhouse-id column; null = no rows visible. */
function greenhouseScope(
  ctx: Ctx,
  column: typeof applications.greenhouseId | typeof greenhouses.id | typeof cropCycles.greenhouseId,
): SQL | null | undefined {
  if (!ctx.assignedGreenhouseIds) return undefined;
  if (ctx.assignedGreenhouseIds.length === 0) return null;
  return inArray(column, ctx.assignedGreenhouseIds);
}

// -------------------------------------------------------------- recipes

export interface RecipeOption {
  id: string;
  name: string;
  type: ApplicationType;
  lines: { itemId: string; quantityPer1000l: number }[];
}

/** Active recipes (optionally of one type) with their lines, for the picker. */
export async function listRecipeOptions(
  ctx: Ctx,
  type?: ApplicationType,
): Promise<RecipeOption[]> {
  const filters: SQL[] = [
    eq(recipes.organisationId, ctx.orgId),
    eq(recipes.isActive, true),
  ];
  if (type) filters.push(eq(recipes.type, type));
  const rows = await db
    .select({ id: recipes.id, name: recipes.name, type: recipes.type })
    .from(recipes)
    .where(and(...filters))
    .orderBy(asc(recipes.name));
  if (rows.length === 0) return [];

  const lines = await db
    .select({
      recipeId: recipeLines.recipeId,
      itemId: recipeLines.itemId,
      quantityPer1000l: recipeLines.quantityPer1000L,
    })
    .from(recipeLines)
    .where(
      and(
        eq(recipeLines.organisationId, ctx.orgId),
        inArray(
          recipeLines.recipeId,
          rows.map((r) => r.id),
        ),
      ),
    );
  const byRecipe = new Map<string, RecipeOption["lines"]>();
  for (const l of lines) {
    const list = byRecipe.get(l.recipeId) ?? [];
    list.push({ itemId: l.itemId, quantityPer1000l: Number(l.quantityPer1000l) });
    byRecipe.set(l.recipeId, list);
  }
  return rows.map((r) => ({ ...r, lines: byRecipe.get(r.id) ?? [] }));
}

// ------------------------------------------------------------ form refs

export interface ApplicationRefItem {
  id: string;
  name: string;
  category: ItemCategory;
  baseUnit: BaseUnit;
  phiDays: number | null;
  reiHours: number | null;
  /** storeId → usable (non-expired) on-hand in base units. */
  usable: Record<string, number>;
}

export interface ApplicationFormRefs {
  greenhouses: { id: string; name: string }[];
  cycles: { id: string; code: string; greenhouseId: string; status: string }[];
  recipes: RecipeOption[];
  stores: { id: string; name: string; isDefault: boolean }[];
  items: ApplicationRefItem[];
}

/**
 * Everything the log-application form needs in one round trip: greenhouses
 * the user may use, their active cycles, active recipes, input stores, and
 * active items with PHI/REI + usable stock for the live preview. No money.
 */
export async function getApplicationFormRefs(
  ctx: Ctx,
): Promise<ApplicationFormRefs> {
  const ghScope = greenhouseScope(ctx, greenhouses.id);
  const cycleScope = greenhouseScope(ctx, cropCycles.greenhouseId);
  const today = todayLagos();

  const [ghRows, cycleRows, recipeRows, storeRows, itemRows, usableRows] =
    await Promise.all([
      ghScope === null
        ? Promise.resolve([])
        : db
            .select({ id: greenhouses.id, name: greenhouses.name })
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
            })
            .from(cropCycles)
            .where(
              and(
                eq(cropCycles.organisationId, ctx.orgId),
                inArray(cropCycles.status, ACTIVE_CYCLE_STATUSES),
                ...(cycleScope ? [cycleScope] : []),
              ),
            )
            .orderBy(asc(cropCycles.code)),
      listRecipeOptions(ctx),
      db
        .select({
          id: stores.id,
          name: stores.name,
          isDefault: stores.isDefault,
        })
        .from(stores)
        .where(
          and(
            eq(stores.organisationId, ctx.orgId),
            eq(stores.type, "input_store"),
          ),
        )
        .orderBy(desc(stores.isDefault), asc(stores.name)),
      db
        .select({
          id: items.id,
          name: items.name,
          category: items.category,
          baseUnit: items.baseUnit,
          phiDays: items.phiDays,
          reiHours: items.reiHours,
        })
        .from(items)
        .where(and(eq(items.organisationId, ctx.orgId), eq(items.isActive, true)))
        .orderBy(asc(items.name)),
      db
        .select({
          itemId: inventoryMovements.itemId,
          storeId: inventoryMovements.storeId,
          onHand: sql<string>`sum(${inventoryMovements.quantity})`,
        })
        .from(inventoryMovements)
        .innerJoin(
          itemBatches,
          and(
            eq(itemBatches.id, inventoryMovements.itemBatchId),
            eq(itemBatches.organisationId, ctx.orgId),
          ),
        )
        .where(
          and(
            eq(inventoryMovements.organisationId, ctx.orgId),
            or(isNull(itemBatches.expiryDate), gt(itemBatches.expiryDate, today)),
          ),
        )
        .groupBy(inventoryMovements.itemId, inventoryMovements.storeId)
        .having(sql`sum(${inventoryMovements.quantity}) > 0`),
    ]);

  // Only cycles in greenhouses the form offers.
  const ghIds = new Set(ghRows.map((g) => g.id));
  const usableByItem = new Map<string, Record<string, number>>();
  for (const u of usableRows) {
    const rec = usableByItem.get(u.itemId) ?? {};
    rec[u.storeId] = roundQty(Number(u.onHand));
    usableByItem.set(u.itemId, rec);
  }

  return {
    greenhouses: ghRows,
    cycles: cycleRows.filter((c) => ghIds.has(c.greenhouseId)),
    recipes: recipeRows,
    stores: storeRows,
    items: itemRows.map((i) => ({ ...i, usable: usableByItem.get(i.id) ?? {} })),
  };
}

// ----------------------------------------------------------------- list

export interface ApplicationLine {
  id: string;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  batchNumber: string;
  quantity: number;
  phiDays: number | null;
  reiHours: number | null;
  /** Input cost in kobo — null for workers (never selected). */
  costKobo: number | null;
}

/** Issued lines for a set of applications (org-scoped; money-gated). */
async function loadApplicationLines(
  ctx: Ctx,
  applicationIds: string[],
): Promise<Map<string, ApplicationLine[]>> {
  const out = new Map<string, ApplicationLine[]>();
  if (applicationIds.length === 0) return out;

  // Two explicit selections: the cost rate is only ever read for money roles.
  const unitCostKobo = ctx.canSeeMoney
    ? sql<string | null>`${itemBatches.unitCostKobo}`
    : sql<string | null>`null`;
  const rows = await db
    .select({
      id: applicationItems.id,
      applicationId: applicationItems.applicationId,
      itemId: applicationItems.itemId,
      itemName: items.name,
      baseUnit: items.baseUnit,
      batchNumber: itemBatches.batchNumber,
      quantity: applicationItems.quantity,
      phiDays: applicationItems.phiDaysSnapshot,
      reiHours: applicationItems.reiHoursSnapshot,
      unitCostKobo,
    })
    .from(applicationItems)
    .innerJoin(
      items,
      and(eq(items.id, applicationItems.itemId), eq(items.organisationId, ctx.orgId)),
    )
    .innerJoin(
      itemBatches,
      and(
        eq(itemBatches.id, applicationItems.itemBatchId),
        eq(itemBatches.organisationId, ctx.orgId),
      ),
    )
    .where(
      and(
        eq(applicationItems.organisationId, ctx.orgId),
        inArray(applicationItems.applicationId, applicationIds),
      ),
    )
    .orderBy(asc(items.name), asc(itemBatches.batchNumber));

  for (const r of rows) {
    const quantity = roundQty(Number(r.quantity));
    const line: ApplicationLine = {
      id: r.id,
      itemId: r.itemId,
      itemName: r.itemName,
      baseUnit: r.baseUnit,
      batchNumber: r.batchNumber,
      quantity,
      phiDays: r.phiDays,
      reiHours: r.reiHours,
      costKobo:
        ctx.canSeeMoney && r.unitCostKobo !== null
          ? rateTimesQty(r.unitCostKobo, quantity)
          : null,
    };
    const list = out.get(r.applicationId) ?? [];
    list.push(line);
    out.set(r.applicationId, list);
  }
  return out;
}

const headerColumns = {
  id: applications.id,
  appliedAt: applications.appliedAt,
  type: applications.type,
  greenhouseId: applications.greenhouseId,
  greenhouseName: greenhouses.name,
  cropCycleId: applications.cropCycleId,
  cycleCode: cropCycles.code,
  recipeId: applications.recipeId,
  recipeName: recipes.name,
  waterVolumeLitres: applications.waterVolumeLitres,
  operatorName: user.name,
  entrySafeAt: applications.entrySafeAt,
  harvestSafeDate: applications.harvestSafeDate,
  notes: applications.notes,
};

function headerQuery(ctx: Ctx, where: SQL[]) {
  return db
    .select(headerColumns)
    .from(applications)
    .innerJoin(
      greenhouses,
      and(
        eq(greenhouses.id, applications.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      cropCycles,
      and(
        eq(cropCycles.id, applications.cropCycleId),
        eq(cropCycles.organisationId, ctx.orgId),
      ),
    )
    .leftJoin(
      recipes,
      and(eq(recipes.id, applications.recipeId), eq(recipes.organisationId, ctx.orgId)),
    )
    .leftJoin(user, eq(user.id, applications.operatorId))
    .where(and(eq(applications.organisationId, ctx.orgId), ...where));
}

type HeaderRow = Awaited<ReturnType<typeof headerQuery>>[number];

function toDetail(h: HeaderRow, lines: ApplicationLine[], canSeeMoney: boolean) {
  return {
    id: h.id,
    appliedAt: h.appliedAt.toISOString(),
    type: h.type,
    greenhouseId: h.greenhouseId,
    greenhouseName: h.greenhouseName,
    cropCycleId: h.cropCycleId,
    cycleCode: h.cycleCode,
    recipeName: h.recipeName,
    waterVolumeLitres: Number(h.waterVolumeLitres),
    operatorName: h.operatorName,
    entrySafeAt: h.entrySafeAt ? h.entrySafeAt.toISOString() : null,
    harvestSafeDate: h.harvestSafeDate,
    notes: h.notes,
    lines,
    /** Sum of line costs in kobo — null for workers. */
    totalCostKobo: canSeeMoney
      ? lines.reduce((a, l) => a + (l.costKobo ?? 0), 0)
      : null,
  };
}

export type ApplicationDetail = ReturnType<typeof toDetail>;

export async function listApplications(
  ctx: Ctx,
  filters?: { greenhouseId?: string; type?: ApplicationType },
): Promise<ApplicationDetail[]> {
  const where: SQL[] = [];
  const scope = greenhouseScope(ctx, applications.greenhouseId);
  if (scope === null) return [];
  if (scope) where.push(scope);
  if (filters?.greenhouseId) {
    if (!isUuid(filters.greenhouseId)) return [];
    where.push(eq(applications.greenhouseId, filters.greenhouseId));
  }
  if (filters?.type) where.push(eq(applications.type, filters.type));

  const headers = await headerQuery(ctx, where)
    .orderBy(desc(applications.appliedAt), desc(applications.createdAt))
    .limit(200);
  const lines = await loadApplicationLines(
    ctx,
    headers.map((h) => h.id),
  );
  return headers.map((h) => toDetail(h, lines.get(h.id) ?? [], ctx.canSeeMoney));
}

export async function getApplication(
  ctx: Ctx,
  id: string,
): Promise<ApplicationDetail | null> {
  if (!isUuid(id)) return null;
  const where: SQL[] = [eq(applications.id, id)];
  const scope = greenhouseScope(ctx, applications.greenhouseId);
  if (scope === null) return null;
  if (scope) where.push(scope);
  const [h] = await headerQuery(ctx, where);
  if (!h) return null;
  const lines = await loadApplicationLines(ctx, [h.id]);
  return toDetail(h, lines.get(h.id) ?? [], ctx.canSeeMoney);
}

/** Greenhouses for the list filter (worker: assigned only). */
export async function listApplicationGreenhouseOptions(ctx: Ctx) {
  const scope = greenhouseScope(ctx, greenhouses.id);
  if (scope === null) return [];
  return db
    .select({ id: greenhouses.id, name: greenhouses.name })
    .from(greenhouses)
    .where(and(eq(greenhouses.organisationId, ctx.orgId), ...(scope ? [scope] : [])))
    .orderBy(asc(greenhouses.name));
}
