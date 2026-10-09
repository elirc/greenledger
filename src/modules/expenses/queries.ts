import { and, asc, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cropCycles, expenses, greenhouses, sites } from "@/db/schema";
import type { Ctx } from "@/lib/guard";
import { listGreenhouses, listSites } from "@/modules/farm/queries";
import { shiftMonth } from "@/modules/tasks/logic";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "./schema";

/**
 * Every query takes ctx and filters by ctx.orgId — no exceptions. Expenses
 * are money: the pages are owner/manager only (requireMember roles), and
 * amounts are additionally redacted here if a non-money ctx ever calls in.
 */

const isUuid = (id: string) => z.uuid().safeParse(id).success;
const money = (ctx: Ctx, kobo: number) => (ctx.canSeeMoney ? kobo : null);

function monthRange(month: string): SQL[] {
  return [
    gte(expenses.incurredDate, `${month}-01`),
    lt(expenses.incurredDate, `${shiftMonth(month, 1)}-01`),
  ];
}

export async function listExpenses(
  ctx: Ctx,
  opts: { month: string; category?: ExpenseCategory },
) {
  const filters: SQL[] = [
    eq(expenses.organisationId, ctx.orgId),
    ...monthRange(opts.month),
  ];
  if (opts.category) filters.push(eq(expenses.category, opts.category));

  const rows = await db
    .select({
      id: expenses.id,
      category: expenses.category,
      amountKobo: expenses.amountKobo,
      incurredDate: expenses.incurredDate,
      description: expenses.description,
      siteName: sites.name,
      greenhouseName: greenhouses.name,
      cycleCode: cropCycles.code,
    })
    .from(expenses)
    .leftJoin(
      sites,
      and(eq(sites.id, expenses.siteId), eq(sites.organisationId, ctx.orgId)),
    )
    .leftJoin(
      greenhouses,
      and(
        eq(greenhouses.id, expenses.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    )
    .leftJoin(
      cropCycles,
      and(
        eq(cropCycles.id, expenses.cropCycleId),
        eq(cropCycles.organisationId, ctx.orgId),
      ),
    )
    .where(and(...filters))
    .orderBy(desc(expenses.incurredDate), desc(expenses.createdAt));

  return rows.map((r) => ({ ...r, amountKobo: money(ctx, r.amountKobo) }));
}
export type ExpenseRow = Awaited<ReturnType<typeof listExpenses>>[number];

/** Per-category totals for the month (all categories, zero-filled) + grand total. */
export async function expenseTotals(ctx: Ctx, month: string) {
  const rows = await db
    .select({
      category: expenses.category,
      totalKobo: sql<string>`coalesce(sum(${expenses.amountKobo}), 0)::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(and(eq(expenses.organisationId, ctx.orgId), ...monthRange(month)))
    .groupBy(expenses.category);

  const byCategory = EXPENSE_CATEGORIES.map((category) => {
    const r = rows.find((x) => x.category === category);
    return {
      category,
      totalKobo: money(ctx, r ? Number(r.totalKobo) : 0),
      count: r?.count ?? 0,
    };
  });
  const grand = rows.reduce((a, r) => a + Number(r.totalKobo), 0);
  return { byCategory, totalKobo: money(ctx, grand) };
}
export type ExpenseTotals = Awaited<ReturnType<typeof expenseTotals>>;

export async function getExpense(ctx: Ctx, id: string) {
  if (!isUuid(id)) return null;
  const row = await db.query.expenses.findFirst({
    where: and(eq(expenses.id, id), eq(expenses.organisationId, ctx.orgId)),
  });
  if (!row) return null;
  return { ...row, amountKobo: money(ctx, row.amountKobo) };
}

/** Site / greenhouse / crop-cycle options for attribution. */
export async function getExpenseFormRefs(ctx: Ctx) {
  const [siteRows, ghRows, cycleRows] = await Promise.all([
    listSites(ctx),
    listGreenhouses(ctx),
    db
      .select({
        id: cropCycles.id,
        code: cropCycles.code,
        greenhouseId: cropCycles.greenhouseId,
        status: cropCycles.status,
      })
      .from(cropCycles)
      .where(eq(cropCycles.organisationId, ctx.orgId))
      .orderBy(
        // open cycles first, then most recent
        asc(sql`case when ${cropCycles.status} = 'closed' then 1 else 0 end`),
        desc(cropCycles.createdAt),
      )
      .limit(200),
  ]);
  return {
    sites: siteRows.map((s) => ({ id: s.id, name: s.name })),
    greenhouses: ghRows.map((g) => ({ id: g.id, name: g.name, siteId: g.siteId })),
    cycles: cycleRows.map((c) => ({
      id: c.id,
      code: c.code,
      greenhouseId: c.greenhouseId,
      closed: c.status === "closed",
    })),
  };
}
export type ExpenseFormRefs = Awaited<ReturnType<typeof getExpenseFormRefs>>;
