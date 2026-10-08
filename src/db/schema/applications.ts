import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { applicationTypeEnum } from "./enums";
import { greenhouses } from "./farm";
import { cropCycles } from "./nursery";
import { items, itemBatches } from "./inventory";

export const recipes = pgTable(
  "recipes",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    name: text().notNull(),
    type: applicationTypeEnum().notNull(),
    description: text(),
    isActive: boolean().default(true).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("recipes_org_name_uidx").on(t.organisationId, t.name)],
);

export const recipeLines = pgTable(
  "recipe_lines",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    recipeId: uuid()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    quantityPer1000L: numeric("quantity_per_1000l", {
      precision: 14,
      scale: 3,
    }).notNull(),
  },
  (t) => [
    uniqueIndex("recipe_lines_recipe_item_uidx").on(t.recipeId, t.itemId),
    check("recipe_lines_qty_positive", sql`quantity_per_1000l > 0`),
  ],
);

/**
 * Posting scales recipe lines by water_volume_litres/1000, FEFO-selects
 * batches, inserts `issue` movements (negative) linked by application_id —
 * one transaction with batch row locks.
 */
export const applications = pgTable(
  "applications",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    greenhouseId: uuid()
      .notNull()
      .references(() => greenhouses.id, { onDelete: "restrict" }),
    cropCycleId: uuid()
      .notNull()
      .references(() => cropCycles.id, { onDelete: "restrict" }),
    type: applicationTypeEnum().notNull(),
    recipeId: uuid().references(() => recipes.id, { onDelete: "set null" }),
    waterVolumeLitres: numeric({ precision: 10, scale: 1 }).notNull(),
    appliedAt: timestamp({ withTimezone: true }).notNull(),
    operatorId: text()
      .notNull()
      .references(() => user.id),
    // Spray: applied_at + MAX(rei_hours) among items; fertigation: null.
    entrySafeAt: timestamp({ withTimezone: true }),
    // Spray: Lagos date of applied_at + MAX(phi_days); fertigation: null.
    harvestSafeDate: date(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("applications_org_gh_applied_idx").on(
      t.organisationId,
      t.greenhouseId,
      t.appliedAt,
    ),
    index("applications_org_cycle_idx").on(t.organisationId, t.cropCycleId),
    check("applications_volume_positive", sql`water_volume_litres > 0`),
  ],
);

/**
 * phi/rei snapshots are the label values AT application time — the spray
 * record must not drift when the item master is edited.
 */
export const applicationItems = pgTable(
  "application_items",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    itemBatchId: uuid()
      .notNull()
      .references(() => itemBatches.id, { onDelete: "restrict" }),
    quantity: numeric({ precision: 14, scale: 3 }).notNull(),
    phiDaysSnapshot: integer(),
    reiHoursSnapshot: integer(),
  },
  (t) => [
    index("application_items_app_idx").on(t.applicationId),
    index("application_items_org_item_idx").on(t.organisationId, t.itemId),
    check("application_items_qty_positive", sql`quantity > 0`),
  ],
);
