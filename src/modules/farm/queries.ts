import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { greenhouses, sites, stores, zones } from "@/db/schema";
import type { Ctx } from "@/lib/guard";

/** Every query takes ctx and filters by ctx.orgId — no exceptions. */

export async function listSites(ctx: Ctx) {
  return db
    .select({
      id: sites.id,
      name: sites.name,
      address: sites.address,
      createdAt: sites.createdAt,
    })
    .from(sites)
    .where(eq(sites.organisationId, ctx.orgId))
    .orderBy(asc(sites.createdAt));
}

export type SiteRow = Awaited<ReturnType<typeof listSites>>[number];

export async function listGreenhouses(
  ctx: Ctx,
  opts?: { activeOnly?: boolean },
) {
  const filters = [eq(greenhouses.organisationId, ctx.orgId)];
  if (opts?.activeOnly) filters.push(eq(greenhouses.isActive, true));
  // Workers only ever see their assigned greenhouses.
  if (ctx.assignedGreenhouseIds) {
    if (ctx.assignedGreenhouseIds.length === 0) return [];
    filters.push(inArray(greenhouses.id, ctx.assignedGreenhouseIds));
  }
  const rows = await db
    .select({
      id: greenhouses.id,
      siteId: greenhouses.siteId,
      name: greenhouses.name,
      type: greenhouses.type,
      areaM2: greenhouses.areaM2,
      plantCapacity: greenhouses.plantCapacity,
      notes: greenhouses.notes,
      isActive: greenhouses.isActive,
    })
    .from(greenhouses)
    .where(and(...filters))
    .orderBy(asc(greenhouses.name));

  const ids = rows.map((r) => r.id);
  const zoneRows = ids.length
    ? await db
        .select({
          id: zones.id,
          greenhouseId: zones.greenhouseId,
          name: zones.name,
          position: zones.position,
        })
        .from(zones)
        .where(
          and(
            eq(zones.organisationId, ctx.orgId),
            inArray(zones.greenhouseId, ids),
          ),
        )
        .orderBy(asc(zones.position), asc(zones.name))
    : [];

  return rows.map((r) => ({
    ...r,
    // numeric(10,2) comes back as a string — expose a number to components.
    areaM2: Number(r.areaM2),
    zones: zoneRows
      .filter((z) => z.greenhouseId === r.id)
      .map(({ id, name, position }) => ({ id, name, position })),
  }));
}

export type GreenhouseRow = Awaited<ReturnType<typeof listGreenhouses>>[number];

export async function listStores(ctx: Ctx) {
  return db
    .select({
      id: stores.id,
      siteId: stores.siteId,
      name: stores.name,
      type: stores.type,
      isDefault: stores.isDefault,
    })
    .from(stores)
    .where(eq(stores.organisationId, ctx.orgId))
    .orderBy(asc(stores.name));
}

export type StoreRow = Awaited<ReturnType<typeof listStores>>[number];
