import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { produceGradeEnum, produceMovementTypeEnum } from "./enums";
import { greenhouses, stores } from "./farm";
import { crops, varieties } from "./crops";
import { cropCycles } from "./nursery";
import { saleLines } from "./sales";

export const harvests = pgTable(
  "harvests",
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
    harvestedAt: timestamp({ withTimezone: true }).notNull(),
    harvestedBy: text()
      .notNull()
      .references(() => user.id),
    phiOverride: boolean().default(false).notNull(),
    phiOverrideReason: text(),
    phiOverrideBy: text().references(() => user.id),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("harvests_org_cycle_at_idx").on(
      t.organisationId,
      t.cropCycleId,
      t.harvestedAt,
    ),
    index("harvests_org_gh_idx").on(t.organisationId, t.greenhouseId),
    check(
      "harvests_override_pairing",
      sql`phi_override = false OR (phi_override_reason IS NOT NULL AND phi_override_by IS NOT NULL)`,
    ),
  ],
);

export const harvestLines = pgTable(
  "harvest_lines",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    harvestId: uuid()
      .notNull()
      .references(() => harvests.id, { onDelete: "cascade" }),
    grade: produceGradeEnum().notNull(),
    crates: numeric({ precision: 8, scale: 2 }).default("0").notNull(),
    kg: numeric({ precision: 14, scale: 3 }).notNull(),
  },
  (t) => [
    uniqueIndex("harvest_lines_harvest_grade_uidx").on(t.harvestId, t.grade),
    check("harvest_lines_kg_positive", sql`kg > 0`),
  ],
);

/**
 * One lot per harvest line; initial stock enters via a `harvest_in`
 * produce_movement into the chosen store (default packhouse). On-hand kg per
 * (lot, store) = SUM(produce_movements.kg). FIFO: oldest harvested_at first.
 */
export const produceLots = pgTable(
  "produce_lots",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    cropId: uuid()
      .notNull()
      .references(() => crops.id, { onDelete: "restrict" }),
    varietyId: uuid()
      .notNull()
      .references(() => varieties.id, { onDelete: "restrict" }),
    grade: produceGradeEnum().notNull(),
    harvestId: uuid().references(() => harvests.id, { onDelete: "set null" }),
    harvestedAt: timestamp({ withTimezone: true }).notNull(),
    // Harvest Lagos date + crops.shelf_life_days; editable.
    bestBeforeDate: date().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("produce_lots_org_grade_bb_idx").on(
      t.organisationId,
      t.grade,
      t.bestBeforeDate,
    ),
    index("produce_lots_org_harvested_idx").on(
      t.organisationId,
      t.harvestedAt,
    ),
  ],
);

/** APPEND-ONLY, mirrors inventory_movements. kg is SIGNED. */
export const produceMovements = pgTable(
  "produce_movements",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    produceLotId: uuid()
      .notNull()
      .references(() => produceLots.id, { onDelete: "restrict" }),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    type: produceMovementTypeEnum().notNull(),
    kg: numeric({ precision: 14, scale: 3 }).notNull(),
    saleLineId: uuid().references(() => saleLines.id, {
      onDelete: "set null",
    }),
    // Required in app code when type = 'waste'.
    wasteReason: text(),
    transferId: uuid(),
    performedBy: text()
      .notNull()
      .references(() => user.id),
    performedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("prod_mov_org_lot_store_idx").on(
      t.organisationId,
      t.produceLotId,
      t.storeId,
    ),
    index("prod_mov_org_store_idx").on(t.organisationId, t.storeId),
    index("prod_mov_org_performed_idx").on(t.organisationId, t.performedAt),
    index("prod_mov_sale_line_idx").on(t.saleLineId),
    check(
      "prod_mov_sign_per_type",
      sql`(type IN ('harvest_in','transfer_in') AND kg > 0) OR (type IN ('transfer_out','sale','waste') AND kg < 0) OR (type = 'adjustment' AND kg <> 0)`,
    ),
  ],
);
