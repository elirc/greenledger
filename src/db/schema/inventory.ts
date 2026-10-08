import { sql } from "drizzle-orm";
import {
  bigint,
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
import {
  baseUnitEnum,
  inventoryMovementTypeEnum,
  itemCategoryEnum,
  stockCountStatusEnum,
} from "./enums";
import { greenhouses, stores } from "./farm";
import { cropCycles } from "./nursery";
import { applications } from "./applications";

export const items = pgTable(
  "items",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    name: text().notNull(),
    category: itemCategoryEnum().notNull(),
    baseUnit: baseUnitEnum().notNull(),
    reorderLevel: numeric({ precision: 14, scale: 3 }).default("0").notNull(),
    // Agrochemicals only (label values entered by the farm).
    activeIngredient: text(),
    phiDays: integer(),
    reiHours: integer(),
    // Fertilisers only.
    nPct: numeric({ precision: 5, scale: 2 }),
    pPct: numeric({ precision: 5, scale: 2 }),
    kPct: numeric({ precision: 5, scale: 2 }),
    isActive: boolean().default(true).notNull(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("items_org_name_uidx").on(t.organisationId, t.name),
    index("items_org_category_idx").on(t.organisationId, t.category),
    check(
      "items_phi_rei_chemicals_only",
      sql`category = 'agrochemical' OR (phi_days IS NULL AND rei_hours IS NULL)`,
    ),
  ],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    name: text().notNull(),
    phone: text(),
    email: text(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("suppliers_org_name_uidx").on(t.organisationId, t.name)],
);

/**
 * No store column: location is derived from movements (a batch can sit in
 * several stores after transfers). unit_cost_kobo is a RATE (kobo per base
 * unit) and may be fractional — DATA-MODEL §1.
 */
export const itemBatches = pgTable(
  "item_batches",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    supplierId: uuid().references(() => suppliers.id, { onDelete: "set null" }),
    batchNumber: text().notNull(),
    expiryDate: date(),
    unitCostKobo: numeric({ precision: 16, scale: 6 }).default("0").notNull(),
    receivedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("item_batches_org_item_batchno_uidx").on(
      t.organisationId,
      t.itemId,
      t.batchNumber,
    ),
    index("item_batches_org_item_idx").on(t.organisationId, t.itemId),
    index("item_batches_org_expiry_idx").on(t.organisationId, t.expiryDate),
  ],
);

export const receipts = pgTable(
  "receipts",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    reference: text(),
    receivedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    receivedBy: text()
      .notNull()
      .references(() => user.id),
    totalCostKobo: bigint({ mode: "number" }).default(0).notNull(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("receipts_org_received_idx").on(t.organisationId, t.receivedAt),
    index("receipts_org_supplier_idx").on(t.organisationId, t.supplierId),
  ],
);

export const receiptLines = pgTable(
  "receipt_lines",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    receiptId: uuid()
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    itemBatchId: uuid()
      .notNull()
      .references(() => itemBatches.id, { onDelete: "restrict" }),
    quantity: numeric({ precision: 14, scale: 3 }).notNull(),
    unitCostKobo: numeric({ precision: 16, scale: 6 }).notNull(),
    lineCostKobo: bigint({ mode: "number" }).notNull(),
  },
  (t) => [
    index("receipt_lines_receipt_idx").on(t.receiptId),
    index("receipt_lines_org_item_idx").on(t.organisationId, t.itemId),
    check("receipt_lines_quantity_positive", sql`quantity > 0`),
  ],
);

/**
 * APPEND-ONLY. Never UPDATE or DELETE; corrections are new `adjustment`
 * rows. Stock on hand (batch, store) = SUM(quantity). Quantities are SIGNED.
 */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    // Denormalized copy of the batch's item for fast per-item sums.
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    itemBatchId: uuid()
      .notNull()
      .references(() => itemBatches.id, { onDelete: "restrict" }),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    type: inventoryMovementTypeEnum().notNull(),
    quantity: numeric({ precision: 14, scale: 3 }).notNull(),
    greenhouseId: uuid().references(() => greenhouses.id, {
      onDelete: "set null",
    }),
    cropCycleId: uuid().references(() => cropCycles.id, {
      onDelete: "set null",
    }),
    applicationId: uuid().references(() => applications.id, {
      onDelete: "set null",
    }),
    receiptLineId: uuid().references(() => receiptLines.id, {
      onDelete: "set null",
    }),
    stockCountId: uuid().references(() => stockCounts.id, {
      onDelete: "set null",
    }),
    // Same value on the paired transfer_out/transfer_in rows.
    transferId: uuid(),
    // Required in app code for adjustment/return/override issues.
    reason: text(),
    performedBy: text()
      .notNull()
      .references(() => user.id),
    performedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("inv_mov_org_batch_store_idx").on(
      t.organisationId,
      t.itemBatchId,
      t.storeId,
    ),
    index("inv_mov_org_item_idx").on(t.organisationId, t.itemId),
    index("inv_mov_org_store_idx").on(t.organisationId, t.storeId),
    index("inv_mov_org_cycle_idx").on(t.organisationId, t.cropCycleId),
    index("inv_mov_org_performed_idx").on(t.organisationId, t.performedAt),
    index("inv_mov_transfer_idx").on(t.transferId),
    check(
      "inv_mov_sign_per_type",
      sql`(type IN ('receive','transfer_in','return') AND quantity > 0) OR (type IN ('issue','transfer_out') AND quantity < 0) OR (type = 'adjustment' AND quantity <> 0)`,
    ),
  ],
);

export const stockCounts = pgTable(
  "stock_counts",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    status: stockCountStatusEnum().default("draft").notNull(),
    countedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    countedBy: text()
      .notNull()
      .references(() => user.id),
    postedAt: timestamp({ withTimezone: true }),
    postedBy: text().references(() => user.id),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("stock_counts_org_store_status_idx").on(
      t.organisationId,
      t.storeId,
      t.status,
    ),
  ],
);

export const stockCountLines = pgTable(
  "stock_count_lines",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    stockCountId: uuid()
      .notNull()
      .references(() => stockCounts.id, { onDelete: "cascade" }),
    itemBatchId: uuid()
      .notNull()
      .references(() => itemBatches.id, { onDelete: "restrict" }),
    countedQuantity: numeric({ precision: 14, scale: 3 }).notNull(),
    // Snapshot at posting time.
    systemQuantity: numeric({ precision: 14, scale: 3 }).notNull(),
    difference: numeric({ precision: 14, scale: 3 }).notNull(),
  },
  (t) => [
    uniqueIndex("stock_count_lines_count_batch_uidx").on(
      t.stockCountId,
      t.itemBatchId,
    ),
    check("stock_count_lines_counted_nonneg", sql`counted_quantity >= 0`),
  ],
);
