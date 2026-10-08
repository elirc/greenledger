import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const crops = pgTable(
  "crops",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    name: text().notNull(),
    // Editable placeholder per Assumptions: tomato 7, pepper 10.
    shelfLifeDays: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("crops_org_name_uidx").on(t.organisationId, t.name)],
);

export const varieties = pgTable(
  "varieties",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    cropId: uuid()
      .notNull()
      .references(() => crops.id, { onDelete: "restrict" }),
    name: text().notNull(),
    daysToFirstHarvest: integer().notNull(),
    harvestDurationWeeks: integer().notNull(),
    expectedYieldKgPerPlant: numeric({ precision: 6, scale: 2 }).notNull(),
    notes: text(),
    isActive: boolean().default(true).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("varieties_org_crop_name_uidx").on(
      t.organisationId,
      t.cropId,
      t.name,
    ),
    index("varieties_org_crop_idx").on(t.organisationId, t.cropId),
  ],
);
