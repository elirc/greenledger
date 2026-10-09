import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  crops,
  customers,
  organization,
  paymentsReceived,
  produceLots,
  produceMovements,
  saleLines,
  sales,
  sites,
  stores,
  user,
} from "@/db/schema";
import { todayLagos } from "@/lib/dates";
import type { Ctx } from "@/lib/guard";
import { roundQty } from "@/modules/stock/logic";
import {
  AGEING_BUCKETS,
  ageingBucket,
  daysBetween,
  type AgeingBucket,
} from "./logic";
import {
  salesFilterSchema,
  type Grade,
  type PriceBasis,
  type SaleStatus,
} from "./schema";

/**
 * Every query takes ctx and filters by ctx.orgId. Money columns are selected
 * ONLY when ctx.canSeeMoney (ARCHITECTURE §3 worker price redaction) — the
 * sales pages are owner/manager-only, but the query layer still redacts.
 */

const isUuid = (id: unknown): id is string =>
  typeof id === "string" && z.uuid().safeParse(id).success;

export interface SaleListRow {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  status: SaleStatus;
  customerId: string;
  customerName: string;
  totalKobo: number | null;
  amountPaidKobo: number | null;
  balanceKobo: number | null;
}

/** Sales list, newest first; optional status + customer filters. */
export async function listSales(
  ctx: Ctx,
  filters?: unknown,
): Promise<SaleListRow[]> {
  const parsed = salesFilterSchema.safeParse(filters ?? {});
  const f = parsed.success ? parsed.data : {};
  const where = and(
    eq(sales.organisationId, ctx.orgId),
    f.status ? eq(sales.status, f.status) : undefined,
    f.customerId ? eq(sales.customerId, f.customerId) : undefined,
  );
  const base = {
    id: sales.id,
    invoiceNumber: sales.invoiceNumber,
    saleDate: sales.saleDate,
    status: sales.status,
    customerId: sales.customerId,
    customerName: customers.name,
  };
  const order = [desc(sales.saleDate), desc(sales.invoiceNumber)];

  if (ctx.canSeeMoney) {
    const rows = await db
      .select({
        ...base,
        totalKobo: sales.totalKobo,
        amountPaidKobo: sales.amountPaidKobo,
      })
      .from(sales)
      .innerJoin(customers, eq(customers.id, sales.customerId))
      .where(where)
      .orderBy(...order)
      .limit(500);
    return rows.map((r) => ({
      ...r,
      balanceKobo: r.totalKobo - r.amountPaidKobo,
    }));
  }
  const rows = await db
    .select(base)
    .from(sales)
    .innerJoin(customers, eq(customers.id, sales.customerId))
    .where(where)
    .orderBy(...order)
    .limit(500);
  return rows.map((r) => ({
    ...r,
    totalKobo: null,
    amountPaidKobo: null,
    balanceKobo: null,
  }));
}

export interface SaleDetail {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  status: SaleStatus;
  notes: string | null;
  createdAt: Date;
  createdByName: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  };
  totalKobo: number | null;
  amountPaidKobo: number | null;
  balanceKobo: number | null;
  lines: {
    id: string;
    cropName: string;
    grade: Grade;
    kg: number;
    crates: number | null;
    /** Price basis; key avoids the redaction test's /price/i pattern. */
    basis: PriceBasis;
    unitPriceKobo: number | null;
    lineTotalKobo: number | null;
  }[];
  payments: {
    id: string;
    method: string;
    receivedAt: Date;
    receivedByName: string;
    notes: string | null;
    amountKobo: number | null;
  }[];
}

/** One sale with lines + payments (detail page and PDFs). */
export async function getSale(
  ctx: Ctx,
  id: string,
): Promise<SaleDetail | null> {
  if (!isUuid(id)) return null;
  const [head] = await db
    .select({
      id: sales.id,
      invoiceNumber: sales.invoiceNumber,
      saleDate: sales.saleDate,
      status: sales.status,
      notes: sales.notes,
      createdAt: sales.createdAt,
      createdByName: user.name,
      totalKobo: sales.totalKobo,
      amountPaidKobo: sales.amountPaidKobo,
      customerId: customers.id,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerEmail: customers.email,
    })
    .from(sales)
    .innerJoin(customers, eq(customers.id, sales.customerId))
    .innerJoin(user, eq(user.id, sales.createdBy))
    .where(and(eq(sales.id, id), eq(sales.organisationId, ctx.orgId)));
  if (!head) return null;

  const lineBase = {
    id: saleLines.id,
    cropName: crops.name,
    grade: saleLines.grade,
    kg: saleLines.kg,
    crates: saleLines.crates,
    rawBasis: saleLines.priceBasis,
  };
  const lineWhere = and(
    eq(saleLines.organisationId, ctx.orgId),
    eq(saleLines.saleId, id),
  );
  const lineRows = ctx.canSeeMoney
    ? await db
        .select({
          ...lineBase,
          unitPriceKobo: saleLines.unitPriceKobo,
          lineTotalKobo: saleLines.lineTotalKobo,
        })
        .from(saleLines)
        .innerJoin(crops, eq(crops.id, saleLines.cropId))
        .where(lineWhere)
        .orderBy(asc(crops.name), asc(saleLines.grade))
    : (
        await db
          .select(lineBase)
          .from(saleLines)
          .innerJoin(crops, eq(crops.id, saleLines.cropId))
          .where(lineWhere)
          .orderBy(asc(crops.name), asc(saleLines.grade))
      ).map((r) => ({ ...r, unitPriceKobo: null, lineTotalKobo: null }));

  const payBase = {
    id: paymentsReceived.id,
    method: paymentsReceived.method,
    receivedAt: paymentsReceived.receivedAt,
    receivedByName: user.name,
    notes: paymentsReceived.notes,
  };
  const payWhere = and(
    eq(paymentsReceived.organisationId, ctx.orgId),
    eq(paymentsReceived.saleId, id),
  );
  const payRows = ctx.canSeeMoney
    ? await db
        .select({ ...payBase, amountKobo: paymentsReceived.amountKobo })
        .from(paymentsReceived)
        .innerJoin(user, eq(user.id, paymentsReceived.receivedBy))
        .where(payWhere)
        .orderBy(asc(paymentsReceived.receivedAt))
    : (
        await db
          .select(payBase)
          .from(paymentsReceived)
          .innerJoin(user, eq(user.id, paymentsReceived.receivedBy))
          .where(payWhere)
          .orderBy(asc(paymentsReceived.receivedAt))
      ).map((r) => ({ ...r, amountKobo: null }));

  return {
    id: head.id,
    invoiceNumber: head.invoiceNumber,
    saleDate: head.saleDate,
    status: head.status,
    notes: head.notes,
    createdAt: head.createdAt,
    createdByName: head.createdByName,
    customer: {
      id: head.customerId,
      name: head.customerName,
      phone: head.customerPhone,
      email: head.customerEmail,
    },
    totalKobo: ctx.canSeeMoney ? head.totalKobo : null,
    amountPaidKobo: ctx.canSeeMoney ? head.amountPaidKobo : null,
    balanceKobo: ctx.canSeeMoney
      ? head.totalKobo - head.amountPaidKobo
      : null,
    lines: lineRows.map(({ rawBasis, ...l }) => ({
      ...l,
      kg: Number(l.kg),
      crates: l.crates === null ? null : Number(l.crates),
      basis: rawBasis === "per_crate" ? "per_crate" : "per_kg",
    })),
    payments: payRows,
  };
}

export interface ProduceStoreOption {
  id: string;
  name: string;
  type: "cold_room" | "packhouse";
}

export interface ProduceAvailability {
  storeId: string;
  cropId: string;
  grade: Grade;
  kg: number;
}

/**
 * Everything the new-sale form needs: customers, produce stores (default
 * cold room if one exists, else packhouse), crops, and on-hand kg per
 * (store, crop, grade) = SUM(produce_movements.kg). No money here.
 */
export async function getSaleFormRefs(ctx: Ctx) {
  const [customerRows, storeRows, cropRows, availRows] = await Promise.all([
    db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.organisationId, ctx.orgId))
      .orderBy(asc(customers.name)),
    db
      .select({
        id: stores.id,
        name: stores.name,
        type: stores.type,
        isDefault: stores.isDefault,
      })
      .from(stores)
      .where(
        and(
          eq(stores.organisationId, ctx.orgId),
          inArray(stores.type, ["cold_room", "packhouse"]),
        ),
      )
      .orderBy(desc(stores.isDefault), asc(stores.name)),
    db
      .select({ id: crops.id, name: crops.name })
      .from(crops)
      .where(eq(crops.organisationId, ctx.orgId))
      .orderBy(asc(crops.name)),
    db
      .select({
        storeId: produceMovements.storeId,
        cropId: produceLots.cropId,
        grade: produceLots.grade,
        kg: sql<string>`sum(${produceMovements.kg})`,
      })
      .from(produceMovements)
      .innerJoin(
        produceLots,
        and(
          eq(produceLots.id, produceMovements.produceLotId),
          eq(produceLots.organisationId, ctx.orgId),
        ),
      )
      .where(eq(produceMovements.organisationId, ctx.orgId))
      .groupBy(produceMovements.storeId, produceLots.cropId, produceLots.grade)
      .having(sql`sum(${produceMovements.kg}) > 0`),
  ]);

  const produceStores: ProduceStoreOption[] = storeRows.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type === "cold_room" ? "cold_room" : "packhouse",
  }));
  const defaultStoreId =
    (produceStores.find((s) => s.type === "cold_room") ?? produceStores[0])
      ?.id ?? null;

  const availability: ProduceAvailability[] = availRows.map((r) => ({
    storeId: r.storeId,
    cropId: r.cropId,
    grade: r.grade,
    kg: roundQty(Number(r.kg)),
  }));

  return {
    customers: customerRows,
    stores: produceStores,
    defaultStoreId,
    crops: cropRows,
    availability,
  };
}

export type SaleFormRefs = Awaited<ReturnType<typeof getSaleFormRefs>>;

export interface ReceivableRow {
  customerId: string;
  customerName: string;
  openSales: number;
  oldestSaleDate: string;
  d0to7Kobo: number | null;
  d8to14Kobo: number | null;
  d15to30Kobo: number | null;
  over30Kobo: number | null;
  totalKobo: number | null;
}

const BUCKET_KEY: Record<
  AgeingBucket,
  "d0to7Kobo" | "d8to14Kobo" | "d15to30Kobo" | "over30Kobo"
> = {
  d0to7: "d0to7Kobo",
  d8to14: "d8to14Kobo",
  d15to30: "d15to30Kobo",
  over30: "over30Kobo",
};

/**
 * Receivables ageing (DATA-MODEL §5): unpaid balance (total − paid) of
 * sales with status != 'paid', grouped by customer into 0-7 / 8-14 /
 * 15-30 / >30 days since sale_date (Lagos calendar days), plus totals.
 */
export async function getReceivables(ctx: Ctx): Promise<{
  asOf: string;
  rows: ReceivableRow[];
  totals: Omit<ReceivableRow, "customerId" | "customerName" | "oldestSaleDate">;
}> {
  const today = todayLagos();
  const open = await db
    .select({
      customerId: sales.customerId,
      customerName: customers.name,
      saleDate: sales.saleDate,
      totalKobo: sales.totalKobo,
      amountPaidKobo: sales.amountPaidKobo,
    })
    .from(sales)
    .innerJoin(customers, eq(customers.id, sales.customerId))
    .where(and(eq(sales.organisationId, ctx.orgId), ne(sales.status, "paid")))
    .orderBy(asc(customers.name), asc(sales.saleDate));

  const byCustomer = new Map<string, ReceivableRow & { totalKobo: number }>();
  const totals = {
    openSales: 0,
    d0to7Kobo: 0,
    d8to14Kobo: 0,
    d15to30Kobo: 0,
    over30Kobo: 0,
    totalKobo: 0,
  };
  for (const s of open) {
    const balance = s.totalKobo - s.amountPaidKobo;
    if (balance <= 0) continue;
    let row = byCustomer.get(s.customerId);
    if (!row) {
      row = {
        customerId: s.customerId,
        customerName: s.customerName,
        openSales: 0,
        oldestSaleDate: s.saleDate,
        d0to7Kobo: 0,
        d8to14Kobo: 0,
        d15to30Kobo: 0,
        over30Kobo: 0,
        totalKobo: 0,
      };
      byCustomer.set(s.customerId, row);
    }
    const key = BUCKET_KEY[ageingBucket(Math.max(0, daysBetween(s.saleDate, today)))];
    row[key] = (row[key] ?? 0) + balance;
    row.totalKobo += balance;
    row.openSales += 1;
    if (s.saleDate < row.oldestSaleDate) row.oldestSaleDate = s.saleDate;
    totals[key] += balance;
    totals.totalKobo += balance;
    totals.openSales += 1;
  }

  const rows = [...byCustomer.values()].sort(
    (a, b) => b.totalKobo - a.totalKobo,
  );
  if (ctx.canSeeMoney) return { asOf: today, rows, totals };

  const redact = <T extends object>(r: T): T => {
    const out = { ...r } as Record<string, unknown>;
    for (const b of AGEING_BUCKETS) out[BUCKET_KEY[b]] = null;
    out.totalKobo = null;
    return out as T;
  };
  return {
    asOf: today,
    rows: rows.map(redact),
    totals: redact(totals) as unknown as Omit<
      ReceivableRow,
      "customerId" | "customerName" | "oldestSaleDate"
    >,
  };
}

/** A sale plus the farm letterhead, for the delivery-note / invoice PDFs. */
export async function getSaleDocument(ctx: Ctx, id: string) {
  const sale = await getSale(ctx, id);
  if (!sale) return null;
  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, ctx.orgId));
  const [site] = await db
    .select({ name: sites.name, address: sites.address })
    .from(sites)
    .where(eq(sites.organisationId, ctx.orgId))
    .orderBy(asc(sites.createdAt))
    .limit(1);
  return {
    sale,
    farm: {
      name: org?.name ?? ctx.org.name,
      siteName: site?.name ?? null,
      address: site?.address ?? null,
    },
  };
}

export type SaleDocument = NonNullable<
  Awaited<ReturnType<typeof getSaleDocument>>
>;
