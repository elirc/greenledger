import {
  boolean,
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
import { greenhouseTypeEnum, storeTypeEnum } from "./enums";

export const sites = pgTable(
  "sites",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    name: text().notNull(),
    address: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("sites_org_name_uidx").on(t.organisationId, t.name),
    index("sites_org_idx").on(t.organisationId),
  ],
);

export const greenhouses = pgTable(
  "greenhouses",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    name: text().notNull(),
    type: greenhouseTypeEnum().default("greenhouse").notNull(),
    areaM2: numeric({ precision: 10, scale: 2 }).notNull(),
    plantCapacity: integer().default(0).notNull(),
    notes: text(),
    isActive: boolean().default(true).notNull(),
    // Denormalized safety state, updated GREATEST(existing, new) when an
    // application posts (DECISIONS §7).
    entrySafeAt: timestamp({ withTimezone: true }),
    harvestSafeDate: date(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("greenhouses_org_name_uidx").on(t.organisationId, t.name),
    index("greenhouses_org_site_idx").on(t.organisationId, t.siteId),
  ],
);

export const zones = pgTable(
  "zones",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    greenhouseId: uuid()
      .notNull()
      .references(() => greenhouses.id, { onDelete: "cascade" }),
    name: text().notNull(),
    position: integer().default(0).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("zones_greenhouse_name_uidx").on(t.greenhouseId, t.name),
    index("zones_org_greenhouse_idx").on(t.organisationId, t.greenhouseId),
  ],
);

export const stores = pgTable(
  "stores",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    name: text().notNull(),
    type: storeTypeEnum().default("input_store").notNull(),
    isDefault: boolean().default(false).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("stores_org_name_uidx").on(t.organisationId, t.name),
    index("stores_org_site_idx").on(t.organisationId, t.siteId),
  ],
);

/**
 * Workers see/log only assigned greenhouses; owner/manager/storekeeper
 * ignore this table.
 */
export const greenhouseAssignments = pgTable(
  "greenhouse_assignments",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    greenhouseId: uuid()
      .notNull()
      .references(() => greenhouses.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("gh_assign_org_user_gh_uidx").on(
      t.organisationId,
      t.userId,
      t.greenhouseId,
    ),
    index("gh_assign_org_user_idx").on(t.organisationId, t.userId),
  ],
);
