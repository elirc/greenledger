import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { equipmentStatusEnum } from "./enums";
import { greenhouses, sites } from "./farm";

export const equipment = pgTable(
  "equipment",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    name: text().notNull(),
    // pump|tank|dosing_unit|sprayer|cover|net|irrigation|other (app constant).
    category: text().notNull(),
    siteId: uuid().references(() => sites.id, { onDelete: "set null" }),
    greenhouseId: uuid().references(() => greenhouses.id, {
      onDelete: "set null",
    }),
    locationNote: text(),
    serialNumber: text(),
    purchaseDate: date(),
    costKobo: bigint({ mode: "number" }).default(0).notNull(),
    status: equipmentStatusEnum().default("operational").notNull(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("equipment_org_status_idx").on(t.organisationId, t.status)],
);

/**
 * On logging work against a schedule: last_done_date = done date,
 * next_due_date = done + interval_days (same transaction).
 */
export const maintenanceSchedules = pgTable(
  "maintenance_schedules",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    equipmentId: uuid()
      .notNull()
      .references(() => equipment.id, { onDelete: "cascade" }),
    name: text().notNull(),
    intervalDays: integer().notNull(),
    lastDoneDate: date(),
    nextDueDate: date().notNull(),
    isActive: boolean().default(true).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("maint_sched_org_due_idx")
      .on(t.organisationId, t.nextDueDate)
      .where(sql`is_active`),
    check("maint_sched_interval_positive", sql`interval_days > 0`),
  ],
);

export const maintenanceLogs = pgTable(
  "maintenance_logs",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    equipmentId: uuid()
      .notNull()
      .references(() => equipment.id, { onDelete: "restrict" }),
    scheduleId: uuid().references(() => maintenanceSchedules.id, {
      onDelete: "set null",
    }),
    doneDate: date().notNull(),
    description: text().notNull(),
    costKobo: bigint({ mode: "number" }).default(0).notNull(),
    doneBy: text().references(() => user.id),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("maint_logs_org_equip_date_idx").on(
      t.organisationId,
      t.equipmentId,
      t.doneDate,
    ),
  ],
);
