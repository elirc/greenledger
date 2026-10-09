"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  equipment,
  greenhouses,
  maintenanceLogs,
  maintenanceSchedules,
  sites,
} from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { todayLagos } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import { nairaToKobo } from "@/lib/money";
import type { Role } from "@/lib/permissions";
import { advanceSchedule } from "./logic";
import {
  equipmentCreateSchema,
  equipmentUpdateSchema,
  logWorkSchema,
  scheduleCreateSchema,
  scheduleUpdateSchema,
  type EquipmentCreateInput,
} from "./schema";

/** Equipment register: owner / manager / storekeeper (ARCHITECTURE §5). */
const ROLES: Role[] = ["owner", "manager", "storekeeper"];

const emptyToNull = (s: string | undefined) =>
  s && s.length > 0 ? s : null;

const koboOrZero = (s: string | undefined) =>
  s && s.length > 0 ? nairaToKobo(s) : 0;

/**
 * FKs don't check the organisation — verify the site / greenhouse are ours.
 * A greenhouse without a site picks up the greenhouse's site.
 */
async function resolveLocation(
  tx: Tx,
  ctx: Ctx,
  input: Pick<EquipmentCreateInput, "siteId" | "greenhouseId">,
): Promise<{ siteId: string | null; greenhouseId: string | null }> {
  let siteId = emptyToNull(input.siteId);
  const greenhouseId = emptyToNull(input.greenhouseId);
  if (greenhouseId) {
    const [gh] = await tx
      .select({ id: greenhouses.id, siteId: greenhouses.siteId })
      .from(greenhouses)
      .where(
        and(
          eq(greenhouses.id, greenhouseId),
          eq(greenhouses.organisationId, ctx.orgId),
        ),
      );
    if (!gh) throw new DomainError("NOT_FOUND", "Greenhouse not found.");
    if (siteId && siteId !== gh.siteId) {
      throw new DomainError(
        "BAD_LOCATION",
        "That greenhouse is on a different site.",
      );
    }
    siteId = gh.siteId;
  }
  if (siteId) {
    const [site] = await tx
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.organisationId, ctx.orgId)));
    if (!site) throw new DomainError("NOT_FOUND", "Site not found.");
  }
  return { siteId, greenhouseId };
}

/** Cost in kobo; non-money roles may not set it (kept as-is on update). */
function costFor(ctx: Ctx, cost: string | undefined): number | undefined {
  if (!ctx.canSeeMoney) return undefined;
  return koboOrZero(cost);
}

export const createEquipment = defineAction({
  name: "equipment.create",
  schema: equipmentCreateSchema,
  roles: ROLES,
  handler: (input, ctx) =>
    db.transaction(async (tx) => {
      const loc = await resolveLocation(tx, ctx, input);
      const costKobo = costFor(ctx, input.cost) ?? 0;
      const values = {
        name: input.name,
        category: input.category,
        siteId: loc.siteId,
        greenhouseId: loc.greenhouseId,
        locationNote: emptyToNull(input.locationNote),
        serialNumber: emptyToNull(input.serialNumber),
        purchaseDate: emptyToNull(input.purchaseDate),
        costKobo,
        status: input.status,
        notes: emptyToNull(input.notes),
      };
      const [row] = await tx
        .insert(equipment)
        .values({ organisationId: ctx.orgId, ...values })
        .returning({ id: equipment.id });
      await writeAudit(tx, ctx, {
        action: "equipment.create",
        entityType: "equipment",
        entityId: row.id,
        after: values,
      });
      revalidatePath("/equipment");
      return { id: row.id };
    }),
});

export const updateEquipment = defineAction({
  name: "equipment.update",
  schema: equipmentUpdateSchema,
  roles: ROLES,
  handler: (input, ctx) =>
    db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(equipment)
        .where(
          and(eq(equipment.id, input.id), eq(equipment.organisationId, ctx.orgId)),
        )
        .for("update");
      if (!before) throw new DomainError("NOT_FOUND", "Equipment not found.");
      const loc = await resolveLocation(tx, ctx, input);
      const costKobo = costFor(ctx, input.cost) ?? before.costKobo;
      const values = {
        name: input.name,
        category: input.category,
        siteId: loc.siteId,
        greenhouseId: loc.greenhouseId,
        locationNote: emptyToNull(input.locationNote),
        serialNumber: emptyToNull(input.serialNumber),
        purchaseDate: emptyToNull(input.purchaseDate),
        costKobo,
        status: input.status,
        notes: emptyToNull(input.notes),
      };
      await tx
        .update(equipment)
        .set(values)
        .where(
          and(eq(equipment.id, input.id), eq(equipment.organisationId, ctx.orgId)),
        );
      await writeAudit(tx, ctx, {
        action: "equipment.update",
        entityType: "equipment",
        entityId: input.id,
        before: {
          name: before.name,
          category: before.category,
          siteId: before.siteId,
          greenhouseId: before.greenhouseId,
          locationNote: before.locationNote,
          serialNumber: before.serialNumber,
          purchaseDate: before.purchaseDate,
          costKobo: before.costKobo,
          status: before.status,
          notes: before.notes,
        },
        after: values,
      });
      revalidatePath("/equipment", "layout");
      return { id: input.id };
    }),
});

async function assertEquipment(tx: Tx, ctx: Ctx, equipmentId: string) {
  const [row] = await tx
    .select({ id: equipment.id })
    .from(equipment)
    .where(
      and(eq(equipment.id, equipmentId), eq(equipment.organisationId, ctx.orgId)),
    );
  if (!row) throw new DomainError("NOT_FOUND", "Equipment not found.");
}

export const createSchedule = defineAction({
  name: "equipment.schedule_create",
  schema: scheduleCreateSchema,
  roles: ROLES,
  handler: (input, ctx) =>
    db.transaction(async (tx) => {
      await assertEquipment(tx, ctx, input.equipmentId);
      const values = {
        equipmentId: input.equipmentId,
        name: input.name,
        intervalDays: input.intervalDays,
        nextDueDate: input.nextDueDate,
        isActive: input.isActive,
      };
      const [row] = await tx
        .insert(maintenanceSchedules)
        .values({ organisationId: ctx.orgId, ...values })
        .returning({ id: maintenanceSchedules.id });
      await writeAudit(tx, ctx, {
        action: "equipment.schedule_create",
        entityType: "maintenance_schedule",
        entityId: row.id,
        after: values,
      });
      revalidatePath(`/equipment/${input.equipmentId}`);
      revalidatePath("/equipment");
      return { id: row.id, equipmentId: input.equipmentId };
    }),
});

export const updateSchedule = defineAction({
  name: "equipment.schedule_update",
  schema: scheduleUpdateSchema,
  roles: ROLES,
  handler: (input, ctx) =>
    db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(maintenanceSchedules)
        .where(
          and(
            eq(maintenanceSchedules.id, input.id),
            eq(maintenanceSchedules.equipmentId, input.equipmentId),
            eq(maintenanceSchedules.organisationId, ctx.orgId),
          ),
        )
        .for("update");
      if (!before) throw new DomainError("NOT_FOUND", "Schedule not found.");
      const values = {
        name: input.name,
        intervalDays: input.intervalDays,
        nextDueDate: input.nextDueDate,
        isActive: input.isActive,
      };
      await tx
        .update(maintenanceSchedules)
        .set(values)
        .where(
          and(
            eq(maintenanceSchedules.id, input.id),
            eq(maintenanceSchedules.organisationId, ctx.orgId),
          ),
        );
      await writeAudit(tx, ctx, {
        action: "equipment.schedule_update",
        entityType: "maintenance_schedule",
        entityId: input.id,
        before: {
          name: before.name,
          intervalDays: before.intervalDays,
          nextDueDate: before.nextDueDate,
          isActive: before.isActive,
        },
        after: values,
      });
      revalidatePath(`/equipment/${input.equipmentId}`);
      revalidatePath("/equipment");
      return { id: input.id, equipmentId: input.equipmentId };
    }),
});

/**
 * Log maintenance work. With a schedule, in the SAME transaction the
 * schedule moves on: last_done_date = done date, next_due_date = done +
 * interval_days (DATA-MODEL §4.9) — unless the log is back-dated before the
 * schedule's last_done_date (history only, schedule untouched).
 */
export const logMaintenanceWork = defineAction({
  name: "equipment.log_work",
  schema: logWorkSchema,
  roles: ROLES,
  handler: (input, ctx) =>
    db.transaction(async (tx) => {
      if (input.doneDate > todayLagos()) {
        throw new DomainError("BAD_DATE", "The date cannot be in the future.");
      }
      await assertEquipment(tx, ctx, input.equipmentId);
      const scheduleId = emptyToNull(input.scheduleId);

      let scheduleChange: {
        before: { lastDoneDate: string | null; nextDueDate: string };
        after: { lastDoneDate: string; nextDueDate: string };
      } | null = null;
      if (scheduleId) {
        const [schedule] = await tx
          .select({
            id: maintenanceSchedules.id,
            intervalDays: maintenanceSchedules.intervalDays,
            lastDoneDate: maintenanceSchedules.lastDoneDate,
            nextDueDate: maintenanceSchedules.nextDueDate,
          })
          .from(maintenanceSchedules)
          .where(
            and(
              eq(maintenanceSchedules.id, scheduleId),
              eq(maintenanceSchedules.equipmentId, input.equipmentId),
              eq(maintenanceSchedules.organisationId, ctx.orgId),
            ),
          )
          .for("update");
        if (!schedule) throw new DomainError("NOT_FOUND", "Schedule not found.");
        const next = advanceSchedule(schedule, input.doneDate);
        if (next) {
          await tx
            .update(maintenanceSchedules)
            .set(next)
            .where(
              and(
                eq(maintenanceSchedules.id, schedule.id),
                eq(maintenanceSchedules.organisationId, ctx.orgId),
              ),
            );
          scheduleChange = {
            before: {
              lastDoneDate: schedule.lastDoneDate,
              nextDueDate: schedule.nextDueDate,
            },
            after: next,
          };
        }
      }

      const costKobo = costFor(ctx, input.cost) ?? 0;
      const [row] = await tx
        .insert(maintenanceLogs)
        .values({
          organisationId: ctx.orgId,
          equipmentId: input.equipmentId,
          scheduleId,
          doneDate: input.doneDate,
          description: input.description,
          costKobo,
          doneBy: ctx.userId,
          notes: emptyToNull(input.notes),
        })
        .returning({ id: maintenanceLogs.id });

      await writeAudit(tx, ctx, {
        action: "equipment.log_work",
        entityType: "maintenance_log",
        entityId: row.id,
        before: scheduleChange ? { schedule: scheduleChange.before } : undefined,
        after: {
          equipmentId: input.equipmentId,
          scheduleId,
          doneDate: input.doneDate,
          description: input.description,
          costKobo,
          schedule: scheduleChange?.after ?? null,
        },
      });
      revalidatePath(`/equipment/${input.equipmentId}`);
      revalidatePath("/equipment");
      return {
        id: row.id,
        equipmentId: input.equipmentId,
        nextDueDate: scheduleChange?.after.nextDueDate ?? null,
      };
    }),
});
