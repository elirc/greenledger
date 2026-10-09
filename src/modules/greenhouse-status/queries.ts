import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { applicationItems, applications, greenhouses, items } from "@/db/schema";
import type { Ctx } from "@/lib/guard";
import { safetyStatus } from "./logic";

/**
 * Per-greenhouse PHI/REI safety state (read from the denormalized
 * greenhouses.entry_safe_at / harvest_safe_date — DECISIONS §7) plus the
 * latest spray and the products it used (label snapshots, not the live item
 * master). Every query filters by ctx.orgId; workers see assigned greenhouses
 * only. No money columns are selected.
 */

const isUuid = (id: string) => z.uuid().safeParse(id).success;

/** Worker scoping on greenhouses.id; null = no rows visible. */
function greenhouseScope(ctx: Ctx): SQL | null | undefined {
  if (!ctx.assignedGreenhouseIds) return undefined;
  if (ctx.assignedGreenhouseIds.length === 0) return null;
  return inArray(greenhouses.id, ctx.assignedGreenhouseIds);
}

export interface SprayProduct {
  itemId: string;
  name: string;
  /** Label values snapshotted on the application (max over allocations). */
  phiDays: number | null;
  reiHours: number | null;
}

export interface LatestSpray {
  applicationId: string;
  cropCycleId: string;
  appliedAt: Date;
  entrySafeAt: Date | null;
  harvestSafeDate: string | null;
  products: SprayProduct[];
}

export interface GreenhouseSafetyRow {
  id: string;
  name: string;
  isActive: boolean;
  entrySafeAt: Date | null;
  harvestSafeDate: string | null;
  entrySafe: boolean;
  harvestSafe: boolean;
  latestSpray: LatestSpray | null;
}

const maxNullable = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.max(a, b);

/** Latest spray per greenhouse + its products (two queries, org-scoped). */
async function latestSprays(
  ctx: Ctx,
  greenhouseIds: string[],
): Promise<Map<string, LatestSpray>> {
  const out = new Map<string, LatestSpray>();
  if (greenhouseIds.length === 0) return out;

  const sprays = await db
    .selectDistinctOn([applications.greenhouseId], {
      greenhouseId: applications.greenhouseId,
      applicationId: applications.id,
      cropCycleId: applications.cropCycleId,
      appliedAt: applications.appliedAt,
      entrySafeAt: applications.entrySafeAt,
      harvestSafeDate: applications.harvestSafeDate,
    })
    .from(applications)
    .where(
      and(
        eq(applications.organisationId, ctx.orgId),
        eq(applications.type, "spray"),
        inArray(applications.greenhouseId, greenhouseIds),
      ),
    )
    .orderBy(
      applications.greenhouseId,
      desc(applications.appliedAt),
      desc(applications.createdAt),
    );
  if (sprays.length === 0) return out;

  const lines = await db
    .select({
      applicationId: applicationItems.applicationId,
      itemId: applicationItems.itemId,
      name: items.name,
      phiDays: applicationItems.phiDaysSnapshot,
      reiHours: applicationItems.reiHoursSnapshot,
    })
    .from(applicationItems)
    .innerJoin(
      items,
      and(
        eq(items.id, applicationItems.itemId),
        eq(items.organisationId, ctx.orgId),
      ),
    )
    .where(
      and(
        eq(applicationItems.organisationId, ctx.orgId),
        inArray(
          applicationItems.applicationId,
          sprays.map((s) => s.applicationId),
        ),
      ),
    )
    .orderBy(asc(items.name));

  // One product per item (FEFO may split an item over several batches).
  const productsByApp = new Map<string, Map<string, SprayProduct>>();
  for (const l of lines) {
    const byItem = productsByApp.get(l.applicationId) ?? new Map();
    const prev = byItem.get(l.itemId);
    byItem.set(l.itemId, {
      itemId: l.itemId,
      name: l.name,
      phiDays: maxNullable(prev?.phiDays ?? null, l.phiDays),
      reiHours: maxNullable(prev?.reiHours ?? null, l.reiHours),
    });
    productsByApp.set(l.applicationId, byItem);
  }

  for (const s of sprays) {
    out.set(s.greenhouseId, {
      applicationId: s.applicationId,
      cropCycleId: s.cropCycleId,
      appliedAt: s.appliedAt,
      entrySafeAt: s.entrySafeAt,
      harvestSafeDate: s.harvestSafeDate,
      products: [...(productsByApp.get(s.applicationId)?.values() ?? [])],
    });
  }
  return out;
}

const safetyColumns = {
  id: greenhouses.id,
  name: greenhouses.name,
  isActive: greenhouses.isActive,
  entrySafeAt: greenhouses.entrySafeAt,
  harvestSafeDate: greenhouses.harvestSafeDate,
};

/** Every greenhouse the caller may see, with safety booleans + latest spray. */
export async function listGreenhouseSafety(
  ctx: Ctx,
  opts?: { now?: Date },
): Promise<GreenhouseSafetyRow[]> {
  const scope = greenhouseScope(ctx);
  if (scope === null) return [];
  const now = opts?.now ?? new Date();
  const rows = await db
    .select(safetyColumns)
    .from(greenhouses)
    .where(
      and(eq(greenhouses.organisationId, ctx.orgId), ...(scope ? [scope] : [])),
    )
    .orderBy(desc(greenhouses.isActive), asc(greenhouses.name));
  const sprays = await latestSprays(
    ctx,
    rows.map((r) => r.id),
  );
  return rows.map((r) => {
    const s = safetyStatus(r, now);
    return {
      ...r,
      entrySafe: s.entrySafe,
      harvestSafe: s.harvestSafe,
      latestSpray: sprays.get(r.id) ?? null,
    };
  });
}

/** One greenhouse; null when missing, in another org, or unassigned. */
export async function getGreenhouseSafety(
  ctx: Ctx,
  greenhouseId: string,
  opts?: { now?: Date },
): Promise<GreenhouseSafetyRow | null> {
  if (!isUuid(greenhouseId)) return null;
  const scope = greenhouseScope(ctx);
  if (scope === null) return null;
  const now = opts?.now ?? new Date();
  const [row] = await db
    .select(safetyColumns)
    .from(greenhouses)
    .where(
      and(
        eq(greenhouses.id, greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
        ...(scope ? [scope] : []),
      ),
    );
  if (!row) return null;
  const sprays = await latestSprays(ctx, [row.id]);
  const s = safetyStatus(row, now);
  return {
    ...row,
    entrySafe: s.entrySafe,
    harvestSafe: s.harvestSafe,
    latestSpray: sprays.get(row.id) ?? null,
  };
}
