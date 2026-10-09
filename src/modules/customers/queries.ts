import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, sales } from "@/db/schema";
import type { Ctx } from "@/lib/guard";

/**
 * Every query takes ctx and filters by ctx.orgId. Money (open balance) only
 * when ctx.canSeeMoney (ARCHITECTURE §3 worker price redaction).
 */

const isUuid = (id: unknown): id is string =>
  typeof id === "string" && z.uuid().safeParse(id).success;

export interface CustomerListRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  openSales: number;
  /** Σ (total − paid) over sales with status != 'paid'. */
  openBalanceKobo: number | null;
}

/** Customers with their open (unpaid + part-paid) balance. */
export async function listCustomers(ctx: Ctx): Promise<CustomerListRow[]> {
  const open = db
    .select({
      customerId: sales.customerId,
      openSales: sql<number>`count(*)::int`.as("open_sales"),
      balance: sql<string>`sum(${sales.totalKobo} - ${sales.amountPaidKobo})`.as(
        "balance",
      ),
    })
    .from(sales)
    .where(and(eq(sales.organisationId, ctx.orgId), ne(sales.status, "paid")))
    .groupBy(sales.customerId)
    .as("open");

  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      openSales: open.openSales,
      balance: open.balance,
    })
    .from(customers)
    .leftJoin(open, eq(open.customerId, customers.id))
    .where(eq(customers.organisationId, ctx.orgId))
    .orderBy(asc(customers.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    openSales: r.openSales ?? 0,
    openBalanceKobo: ctx.canSeeMoney ? Number(r.balance ?? 0) : null,
  }));
}

/** One customer (detail + edit), with open balance. */
export async function getCustomer(ctx: Ctx, id: string) {
  if (!isUuid(id)) return null;
  const row = await db.query.customers.findFirst({
    columns: {
      id: true,
      name: true,
      phone: true,
      email: true,
      notes: true,
      createdAt: true,
    },
    where: and(eq(customers.id, id), eq(customers.organisationId, ctx.orgId)),
  });
  if (!row) return null;
  if (!ctx.canSeeMoney) return { ...row, openBalanceKobo: null };
  const [agg] = await db
    .select({
      balance: sql<string>`coalesce(sum(${sales.totalKobo} - ${sales.amountPaidKobo}), 0)`,
    })
    .from(sales)
    .where(
      and(
        eq(sales.organisationId, ctx.orgId),
        eq(sales.customerId, id),
        ne(sales.status, "paid"),
      ),
    );
  return { ...row, openBalanceKobo: Number(agg?.balance ?? 0) };
}

export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomer>>>;
