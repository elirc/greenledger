import { sql } from "drizzle-orm";
import {
  bigint,
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
import { produceGradeEnum, saleStatusEnum } from "./enums";
import { crops } from "./crops";

export const customers = pgTable(
  "customers",
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
  (t) => [uniqueIndex("customers_org_name_uidx").on(t.organisationId, t.name)],
);

/**
 * status is maintained: paid when amount_paid >= total, part_paid when
 * 0 < paid < total. Invoice numbers come from the per-org `counters` row,
 * incremented inside the posting transaction.
 */
export const sales = pgTable(
  "sales",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    invoiceNumber: text().notNull(),
    saleDate: date().notNull(),
    status: saleStatusEnum().default("unpaid").notNull(),
    totalKobo: bigint({ mode: "number" }).default(0).notNull(),
    amountPaidKobo: bigint({ mode: "number" }).default(0).notNull(),
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
    uniqueIndex("sales_org_invoice_uidx").on(
      t.organisationId,
      t.invoiceNumber,
    ),
    index("sales_org_date_idx").on(t.organisationId, t.saleDate),
    index("sales_org_status_idx").on(t.organisationId, t.status),
    index("sales_org_customer_idx").on(t.organisationId, t.customerId),
  ],
);

export const saleLines = pgTable(
  "sale_lines",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    saleId: uuid()
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    cropId: uuid()
      .notNull()
      .references(() => crops.id, { onDelete: "restrict" }),
    grade: produceGradeEnum().notNull(),
    kg: numeric({ precision: 14, scale: 3 }).notNull(),
    crates: numeric({ precision: 8, scale: 2 }),
    // 'per_kg' | 'per_crate'
    priceBasis: text().default("per_kg").notNull(),
    unitPriceKobo: bigint({ mode: "number" }).notNull(),
    lineTotalKobo: bigint({ mode: "number" }).notNull(),
  },
  (t) => [
    index("sale_lines_sale_idx").on(t.saleId),
    check("sale_lines_kg_positive", sql`kg > 0`),
  ],
);

export const paymentsReceived = pgTable(
  "payments_received",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    saleId: uuid()
      .notNull()
      .references(() => sales.id, { onDelete: "restrict" }),
    amountKobo: bigint({ mode: "number" }).notNull(),
    // cash | transfer | other
    method: text().default("cash").notNull(),
    receivedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    receivedBy: text()
      .notNull()
      .references(() => user.id),
    notes: text(),
  },
  (t) => [
    index("payments_org_sale_idx").on(t.organisationId, t.saleId),
    index("payments_org_received_idx").on(t.organisationId, t.receivedAt),
    check("payments_amount_positive", sql`amount_kobo > 0`),
  ],
);

/**
 * key: 'invoice' | 'delivery_note'. Increment with
 * UPDATE ... SET value = value + 1 RETURNING value inside the posting tx.
 */
export const counters = pgTable(
  "counters",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    key: text().notNull(),
    value: bigint({ mode: "number" }).default(0).notNull(),
  },
  (t) => [uniqueIndex("counters_org_key_uidx").on(t.organisationId, t.key)],
);
