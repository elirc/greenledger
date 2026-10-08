import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import {
  cycleStatusEnum,
  nurseryBatchStatusEnum,
  scoutingSeverityEnum,
} from "./enums";
import { greenhouses, zones } from "./farm";
import { varieties } from "./crops";
import { itemBatches } from "./inventory";
import { files } from "./misc";

export const nurseryBatches = pgTable(
  "nursery_batches",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    varietyId: uuid()
      .notNull()
      .references(() => varieties.id, { onDelete: "restrict" }),
    seedItemBatchId: uuid().references(() => itemBatches.id, {
      onDelete: "set null",
    }),
    sowDate: date().notNull(),
    trays: integer().notNull(),
    cellsPerTray: integer().notNull(),
    seedsSown: integer().notNull(),
    germinated: integer().default(0).notNull(),
    ready: integer().default(0).notNull(),
    transplanted: integer().default(0).notNull(),
    discarded: integer().default(0).notNull(),
    status: nurseryBatchStatusEnum().default("open").notNull(),
    notes: text(),
    createdBy: text()
      .notNull()
      .references(() => user.id),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("nursery_batches_org_status_idx").on(t.organisationId, t.status),
    index("nursery_batches_org_variety_idx").on(t.organisationId, t.varietyId),
    check(
      "nursery_batches_positive_setup",
      sql`trays > 0 AND cells_per_tray > 0 AND seeds_sown > 0`,
    ),
    check(
      "nursery_batches_counts_nonneg",
      sql`germinated >= 0 AND ready >= 0 AND transplanted >= 0 AND discarded >= 0`,
    ),
  ],
);

/**
 * plants_alive is DENORMALIZED: updated in the same transaction as every
 * plant_losses insert and on transplant. Invariant (tested):
 * plants_alive = plants_transplanted − SUM(plant_losses.count).
 */
export const cropCycles = pgTable(
  "crop_cycles",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    greenhouseId: uuid()
      .notNull()
      .references(() => greenhouses.id, { onDelete: "restrict" }),
    zoneId: uuid().references(() => zones.id, { onDelete: "set null" }),
    varietyId: uuid()
      .notNull()
      .references(() => varieties.id, { onDelete: "restrict" }),
    nurseryBatchId: uuid().references(() => nurseryBatches.id, {
      onDelete: "set null",
    }),
    code: text().notNull(),
    sowDate: date(),
    transplantDate: date(),
    plantsTransplanted: integer().default(0).notNull(),
    plantsAlive: integer().default(0).notNull(),
    expectedFirstHarvest: date(),
    expectedEnd: date(),
    status: cycleStatusEnum().default("planned").notNull(),
    closedAt: timestamp({ withTimezone: true }),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("crop_cycles_org_code_uidx").on(t.organisationId, t.code),
    index("crop_cycles_org_gh_status_idx").on(
      t.organisationId,
      t.greenhouseId,
      t.status,
    ),
    index("crop_cycles_org_status_idx").on(t.organisationId, t.status),
  ],
);

export const plantLosses = pgTable(
  "plant_losses",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    cropCycleId: uuid()
      .notNull()
      .references(() => cropCycles.id, { onDelete: "cascade" }),
    date: date().notNull(),
    count: integer().notNull(),
    // Free text; UI offers pest/disease/physical/heat/other.
    cause: text().notNull(),
    notes: text(),
    createdBy: text()
      .notNull()
      .references(() => user.id),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("plant_losses_org_cycle_date_idx").on(
      t.organisationId,
      t.cropCycleId,
      t.date,
    ),
    check("plant_losses_count_positive", sql`count > 0`),
  ],
);

export const scoutingLogs = pgTable(
  "scouting_logs",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    cropCycleId: uuid()
      .notNull()
      .references(() => cropCycles.id, { onDelete: "cascade" }),
    date: date().notNull(),
    pestOrDisease: text().notNull(),
    severity: scoutingSeverityEnum().notNull(),
    photoFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    actionTaken: text(),
    createdBy: text()
      .notNull()
      .references(() => user.id),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("scouting_logs_org_cycle_date_idx").on(
      t.organisationId,
      t.cropCycleId,
      t.date,
    ),
  ],
);
