import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { expenseCategoryEnum, taskStatusEnum } from "./enums";
import { greenhouses, sites } from "./farm";
import { cropCycles } from "./nursery";

/**
 * Profitability: an expense is attributed to a cycle when crop_cycle_id is
 * set; site/org-level expenses are NOT allocated across cycles in v1.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    category: expenseCategoryEnum().notNull(),
    amountKobo: bigint({ mode: "number" }).notNull(),
    incurredDate: date().notNull(),
    siteId: uuid().references(() => sites.id, { onDelete: "set null" }),
    cropCycleId: uuid().references(() => cropCycles.id, {
      onDelete: "set null",
    }),
    greenhouseId: uuid().references(() => greenhouses.id, {
      onDelete: "set null",
    }),
    description: text(),
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
    index("expenses_org_date_idx").on(t.organisationId, t.incurredDate),
    index("expenses_org_cycle_idx").on(t.organisationId, t.cropCycleId),
    check("expenses_amount_positive", sql`amount_kobo > 0`),
  ],
);

export const climateReadings = pgTable(
  "climate_readings",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    greenhouseId: uuid()
      .notNull()
      .references(() => greenhouses.id, { onDelete: "cascade" }),
    recordedAt: timestamp({ withTimezone: true }).notNull(),
    temperatureC: numeric({ precision: 5, scale: 2 }),
    humidityPct: numeric({ precision: 5, scale: 2 }),
    ecMsCm: numeric({ precision: 6, scale: 3 }),
    ph: numeric({ precision: 4, scale: 2 }),
    recordedBy: text()
      .notNull()
      .references(() => user.id),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("climate_org_gh_at_idx").on(
      t.organisationId,
      t.greenhouseId,
      t.recordedAt,
    ),
    check(
      "climate_at_least_one_reading",
      sql`temperature_c IS NOT NULL OR humidity_pct IS NOT NULL OR ec_ms_cm IS NOT NULL OR ph IS NOT NULL`,
    ),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    title: text().notNull(),
    description: text(),
    greenhouseId: uuid().references(() => greenhouses.id, {
      onDelete: "set null",
    }),
    cropCycleId: uuid().references(() => cropCycles.id, {
      onDelete: "set null",
    }),
    assignedTo: text().references(() => user.id),
    dueDate: date(),
    status: taskStatusEnum().default("open").notNull(),
    completedAt: timestamp({ withTimezone: true }),
    completedBy: text().references(() => user.id),
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
    index("tasks_org_status_due_idx").on(
      t.organisationId,
      t.status,
      t.dueDate,
    ),
    index("tasks_org_assigned_status_idx").on(
      t.organisationId,
      t.assignedTo,
      t.status,
    ),
  ],
);

/**
 * Per-user rows (DECISIONS §8). Scan jobs insert ON CONFLICT DO NOTHING on
 * the partial dedup unique index so daily jobs don't spam.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text().notNull(),
    title: text().notNull(),
    body: text(),
    entityType: text(),
    entityId: uuid(),
    dedupKey: text(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("notifications_org_user_read_idx").on(
      t.organisationId,
      t.userId,
      t.readAt,
    ),
    index("notifications_org_created_idx").on(t.organisationId, t.createdAt),
    uniqueIndex("notifications_dedup_uidx")
      .on(t.organisationId, t.userId, t.dedupKey)
      .where(sql`dedup_key IS NOT NULL`),
  ],
);

/** APPEND-ONLY. org nullable — platform-admin actions have no org. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text().references(() => organization.id, {
      onDelete: "restrict",
    }),
    userId: text().references(() => user.id),
    // e.g. "item.create", "harvest.phi_override"
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid(),
    before: jsonb(),
    after: jsonb(),
    // Overrides / approvals.
    reason: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_org_created_idx").on(t.organisationId, t.createdAt.desc()),
    index("audit_org_entity_idx").on(
      t.organisationId,
      t.entityType,
      t.entityId,
    ),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    // Storage adapter key.
    storageKey: text().notNull(),
    filename: text().notNull(),
    contentType: text().notNull(),
    sizeBytes: integer().notNull(),
    uploadedBy: text()
      .notNull()
      .references(() => user.id),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("files_org_idx").on(t.organisationId)],
);
