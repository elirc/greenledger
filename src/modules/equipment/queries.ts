import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  equipment,
  greenhouses,
  maintenanceLogs,
  maintenanceSchedules,
  sites,
  user,
} from "@/db/schema";
import type { Ctx } from "@/lib/guard";
import { listGreenhouses, listSites } from "@/modules/farm/queries";
import type { EquipmentStatus } from "./schema";

/**
 * Every query takes ctx and filters by ctx.orgId — no exceptions.
 * Equipment cost is money: `costKobo` is null unless ctx.canSeeMoney
 * (redaction happens HERE, never in components).
 */

const money = (ctx: Ctx, kobo: number) => (ctx.canSeeMoney ? kobo : null);

/** Route params are untrusted — a non-uuid would make pg throw. */
const isUuid = (id: string) => z.uuid().safeParse(id).success;

export async function listEquipment(ctx: Ctx) {
  // Earliest due date over each item's active schedules.
  const nextDue = db
    .select({
      equipmentId: maintenanceSchedules.equipmentId,
      nextDueDate: sql<string | null>`min(${maintenanceSchedules.nextDueDate})::text`.as(
        "next_due_date",
      ),
    })
    .from(maintenanceSchedules)
    .where(
      and(
        eq(maintenanceSchedules.organisationId, ctx.orgId),
        eq(maintenanceSchedules.isActive, true),
      ),
    )
    .groupBy(maintenanceSchedules.equipmentId)
    .as("next_due");

  const rows = await db
    .select({
      id: equipment.id,
      name: equipment.name,
      category: equipment.category,
      status: equipment.status,
      serialNumber: equipment.serialNumber,
      costKobo: equipment.costKobo,
      siteName: sites.name,
      greenhouseName: greenhouses.name,
      locationNote: equipment.locationNote,
      nextDueDate: nextDue.nextDueDate,
    })
    .from(equipment)
    .leftJoin(
      sites,
      and(eq(sites.id, equipment.siteId), eq(sites.organisationId, ctx.orgId)),
    )
    .leftJoin(
      greenhouses,
      and(
        eq(greenhouses.id, equipment.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    )
    .leftJoin(nextDue, eq(nextDue.equipmentId, equipment.id))
    .where(eq(equipment.organisationId, ctx.orgId))
    .orderBy(asc(equipment.name));

  return rows.map((r) => ({ ...r, costKobo: money(ctx, r.costKobo) }));
}
export type EquipmentListRow = Awaited<ReturnType<typeof listEquipment>>[number];

/** Raw row for the edit form (money redacted for non-money roles). */
export async function getEquipment(ctx: Ctx, id: string) {
  if (!isUuid(id)) return null;
  const row = await db.query.equipment.findFirst({
    where: and(eq(equipment.id, id), eq(equipment.organisationId, ctx.orgId)),
  });
  if (!row) return null;
  return { ...row, costKobo: money(ctx, row.costKobo) };
}

/** Detail page: equipment + location names + schedules + work history. */
export async function getEquipmentDetail(ctx: Ctx, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({
      id: equipment.id,
      name: equipment.name,
      category: equipment.category,
      status: equipment.status,
      serialNumber: equipment.serialNumber,
      purchaseDate: equipment.purchaseDate,
      costKobo: equipment.costKobo,
      locationNote: equipment.locationNote,
      notes: equipment.notes,
      siteName: sites.name,
      greenhouseName: greenhouses.name,
    })
    .from(equipment)
    .leftJoin(
      sites,
      and(eq(sites.id, equipment.siteId), eq(sites.organisationId, ctx.orgId)),
    )
    .leftJoin(
      greenhouses,
      and(
        eq(greenhouses.id, equipment.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    )
    .where(and(eq(equipment.id, id), eq(equipment.organisationId, ctx.orgId)));
  if (!row) return null;

  const [schedules, logs] = await Promise.all([
    listSchedules(ctx, id),
    db
      .select({
        id: maintenanceLogs.id,
        doneDate: maintenanceLogs.doneDate,
        description: maintenanceLogs.description,
        costKobo: maintenanceLogs.costKobo,
        notes: maintenanceLogs.notes,
        scheduleName: maintenanceSchedules.name,
        doneByName: user.name,
      })
      .from(maintenanceLogs)
      .leftJoin(
        maintenanceSchedules,
        and(
          eq(maintenanceSchedules.id, maintenanceLogs.scheduleId),
          eq(maintenanceSchedules.organisationId, ctx.orgId),
        ),
      )
      .leftJoin(user, eq(user.id, maintenanceLogs.doneBy))
      .where(
        and(
          eq(maintenanceLogs.organisationId, ctx.orgId),
          eq(maintenanceLogs.equipmentId, id),
        ),
      )
      .orderBy(desc(maintenanceLogs.doneDate), desc(maintenanceLogs.createdAt))
      .limit(100),
  ]);

  return {
    ...row,
    status: row.status as EquipmentStatus,
    costKobo: money(ctx, row.costKobo),
    schedules,
    logs: logs.map((l) => ({ ...l, costKobo: money(ctx, l.costKobo) })),
  };
}
export type EquipmentDetail = NonNullable<
  Awaited<ReturnType<typeof getEquipmentDetail>>
>;

export async function listSchedules(ctx: Ctx, equipmentId: string) {
  return db
    .select({
      id: maintenanceSchedules.id,
      name: maintenanceSchedules.name,
      intervalDays: maintenanceSchedules.intervalDays,
      lastDoneDate: maintenanceSchedules.lastDoneDate,
      nextDueDate: maintenanceSchedules.nextDueDate,
      isActive: maintenanceSchedules.isActive,
    })
    .from(maintenanceSchedules)
    .where(
      and(
        eq(maintenanceSchedules.organisationId, ctx.orgId),
        eq(maintenanceSchedules.equipmentId, equipmentId),
      ),
    )
    .orderBy(desc(maintenanceSchedules.isActive), asc(maintenanceSchedules.nextDueDate));
}
export type ScheduleRow = Awaited<ReturnType<typeof listSchedules>>[number];

export async function getSchedule(ctx: Ctx, equipmentId: string, id: string) {
  if (!isUuid(id) || !isUuid(equipmentId)) return null;
  const row = await db.query.maintenanceSchedules.findFirst({
    where: and(
      eq(maintenanceSchedules.id, id),
      eq(maintenanceSchedules.equipmentId, equipmentId),
      eq(maintenanceSchedules.organisationId, ctx.orgId),
    ),
  });
  return row ?? null;
}

/** Site + greenhouse options for the equipment form. */
export async function getEquipmentFormRefs(ctx: Ctx) {
  const [siteRows, ghRows] = await Promise.all([
    listSites(ctx),
    listGreenhouses(ctx),
  ]);
  return {
    sites: siteRows.map((s) => ({ id: s.id, name: s.name })),
    greenhouses: ghRows.map((g) => ({ id: g.id, name: g.name, siteId: g.siteId })),
  };
}
export type EquipmentFormRefs = Awaited<ReturnType<typeof getEquipmentFormRefs>>;
