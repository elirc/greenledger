import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  applicationItems,
  applications,
  cropCycles,
  crops,
  expenses,
  greenhouses,
  harvestLines,
  harvests,
  inventoryMovements,
  itemBatches,
  items,
  organization,
  produceLots,
  produceMovements,
  receipts,
  recipes,
  saleLines,
  sites,
  stores,
  suppliers,
  user,
  varieties,
} from "@/db/schema";
import { addDays, LAGOS_TZ, lagosDateOf, todayLagos } from "@/lib/dates";
import type { Ctx } from "@/lib/guard";
import { rateTimesQty } from "@/lib/money";
import type { BaseUnit } from "@/lib/units";
import { isHarvestSafe } from "@/modules/greenhouse-status/logic";
import type { Grade } from "@/modules/harvest/schema";
import {
  ITEM_CATEGORY_LABELS,
  type ItemCategory,
} from "@/modules/items/schema";
import { WASTE_REASON_LABELS, type WasteReason } from "@/modules/produce/schema";
import { listStockItems } from "@/modules/stock/stock-queries";
import { roundQty } from "@/modules/stock/logic";
import {
  computeProfitability,
  sumProfitability,
  type IssueCost,
  type Profitability,
  type SaleAllocation,
} from "./profitability";

/**
 * Report reads (route map: /reports/* are owner/manager — pages and the
 * export/PDF routes call requireMember({ roles: OM })). Every statement
 * filters organisation_id = ctx.orgId. Money fields are still redacted to
 * null when !ctx.canSeeMoney so a worker ctx can never receive amounts
 * (ARCHITECTURE §3 redaction rule) even if a caller forgets the role gate.
 *
 * Date ranges are Lagos calendar days, inclusive, compared in SQL as
 * (timestamptz AT TIME ZONE 'Africa/Lagos')::date.
 */

// ------------------------------------------------------------ registry

export const REPORT_KEYS = [
  "profitability",
  "input-use",
  "harvest",
  "waste",
  "stock-valuation",
  "purchases",
  "spray-record",
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_META: Record<
  ReportKey,
  { title: string; description: string; ranged: boolean; pdf: boolean }
> = {
  profitability: {
    title: "Crop cycle profitability",
    description:
      "Revenue, input cost, cycle expenses and profit per crop cycle.",
    ranged: false,
    pdf: false,
  },
  "input-use": {
    title: "Input use",
    description: "Inputs issued, by item, greenhouse or crop cycle, with cost.",
    ranged: true,
    pdf: false,
  },
  harvest: {
    title: "Harvest by grade",
    description: "Kilograms harvested per ISO week, split by grade.",
    ranged: true,
    pdf: false,
  },
  waste: {
    title: "Produce waste",
    description: "Produce written off as waste, with reasons.",
    ranged: true,
    pdf: false,
  },
  "stock-valuation": {
    title: "Stock valuation",
    description: "Input stock on hand × batch cost, per item, as of today.",
    ranged: false,
    pdf: false,
  },
  purchases: {
    title: "Purchases",
    description: "Stock receipts by supplier and month.",
    ranged: true,
    pdf: false,
  },
  "spray-record": {
    title: "Spray record",
    description:
      "Every spray: products, rates, PHI/REI, safe times and the harvests that followed.",
    ranged: true,
    pdf: true,
  },
};

export const INPUT_USE_GROUPS = ["item", "greenhouse", "cycle"] as const;
export type InputUseGroup = (typeof INPUT_USE_GROUPS)[number];

// ------------------------------------------------------------ params

const DEFAULT_RANGE_DAYS = 90;
const MAX_RANGE_DAYS = 731;

const optionalDate = z.iso.date().optional().catch(undefined);

/** Search params shared by report pages, the Excel route and the PDF route. */
export const reportParamsSchema = z.object({
  from: optionalDate,
  to: optionalDate,
  by: z.enum(INPUT_USE_GROUPS).catch("item"),
});
export type ReportParams = z.infer<typeof reportParamsSchema>;

export interface ReportRange {
  /** yyyy-MM-dd Lagos, inclusive. */
  from: string;
  to: string;
}

/** Defaults to the last 90 days; swaps reversed bounds; caps at ~2 years. */
export function resolveRange(p: { from?: string; to?: string }): ReportRange {
  const today = todayLagos();
  let to = p.to ?? today;
  let from = p.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  if (from > to) [from, to] = [to, from];
  const floor = addDays(to, -MAX_RANGE_DAYS);
  if (from < floor) from = floor;
  return { from, to };
}

/** Parse raw URLSearchParams / Next searchParams into validated params. */
export function parseReportParams(
  get: (key: string) => string | undefined,
): { params: ReportParams; range: ReportRange } {
  const params = reportParamsSchema.parse({
    from: get("from") || undefined,
    to: get("to") || undefined,
    by: get("by") || undefined,
  });
  return { params, range: resolveRange(params) };
}

/** Same, from a Next page's awaited `searchParams`. */
export function parseReportSearchParams(
  raw: Record<string, string | string[] | undefined>,
): { params: ReportParams; range: ReportRange } {
  return parseReportParams((k) => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  });
}

// ------------------------------------------------------------ sql helpers

const TZ = sql.raw(`'${LAGOS_TZ}'`);

function lagosDayBetween(col: AnyColumn, r: ReportRange): SQL {
  return sql`(${col} at time zone ${TZ})::date between ${r.from}::date and ${r.to}::date`;
}

function money(ctx: Ctx, kobo: number): number | null {
  return ctx.canSeeMoney ? kobo : null;
}

const milli = (n: number) => Math.round(n * 1000);

// ------------------------------------------------------------ letterhead

export interface FarmLetterhead {
  name: string;
  siteName: string | null;
  address: string | null;
}

export async function getFarmLetterhead(ctx: Ctx): Promise<FarmLetterhead> {
  const [[org], [site]] = await Promise.all([
    db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, ctx.orgId)),
    db
      .select({ name: sites.name, address: sites.address })
      .from(sites)
      .where(eq(sites.organisationId, ctx.orgId))
      .orderBy(asc(sites.createdAt))
      .limit(1),
  ]);
  return {
    name: org?.name ?? ctx.org.name,
    siteName: site?.name ?? null,
    address: site?.address ?? null,
  };
}

// ------------------------------------------------------------ profitability

export interface ProfitabilityRow {
  cycleId: string;
  code: string;
  status: (typeof cropCycles.$inferSelect)["status"];
  greenhouseName: string;
  cropName: string;
  varietyName: string;
  kgHarvested: number;
  kgSold: number;
  revenueKobo: number | null;
  inputCostKobo: number | null;
  expensesKobo: number | null;
  profitKobo: number | null;
  costPerKgKobo: number | null;
}

export interface ProfitabilityReport {
  rows: ProfitabilityRow[];
  totals: Omit<
    ProfitabilityRow,
    "cycleId" | "code" | "status" | "greenhouseName" | "cropName" | "varietyName"
  >;
  /** Site/org-level expenses (no crop_cycle_id) — excluded from cycle profit. */
  unallocatedExpensesKobo: number | null;
}

function redactProfit(
  ctx: Ctx,
  p: Profitability,
): Pick<
  ProfitabilityRow,
  | "kgSold"
  | "revenueKobo"
  | "inputCostKobo"
  | "expensesKobo"
  | "profitKobo"
  | "costPerKgKobo"
> {
  return {
    kgSold: p.kgSold,
    revenueKobo: money(ctx, p.revenueKobo),
    inputCostKobo: money(ctx, p.inputCostKobo),
    expensesKobo: money(ctx, p.expensesKobo),
    profitKobo: money(ctx, p.profitKobo),
    costPerKgKobo: ctx.canSeeMoney ? p.costPerKgKobo : null,
  };
}

/** Per-cycle profitability for every cycle past planning (whole-cycle, no range). */
export async function getProfitabilityReport(
  ctx: Ctx,
): Promise<ProfitabilityReport> {
  const cycles = await db
    .select({
      cycleId: cropCycles.id,
      code: cropCycles.code,
      status: cropCycles.status,
      greenhouseName: greenhouses.name,
      cropName: crops.name,
      varietyName: varieties.name,
    })
    .from(cropCycles)
    .innerJoin(
      greenhouses,
      and(
        eq(greenhouses.id, cropCycles.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      varieties,
      and(
        eq(varieties.id, cropCycles.varietyId),
        eq(varieties.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      crops,
      and(eq(crops.id, varieties.cropId), eq(crops.organisationId, ctx.orgId)),
    )
    .where(
      and(
        eq(cropCycles.organisationId, ctx.orgId),
        ne(cropCycles.status, "planned"),
      ),
    )
    .orderBy(asc(greenhouses.name), asc(cropCycles.code));

  const [saleRows, issueRows, expenseRows, unallocated, harvested] =
    await Promise.all([
      db
        .select({
          cycleId: harvests.cropCycleId,
          saleLineId: saleLines.id,
          kg: produceMovements.kg,
          lineKg: saleLines.kg,
          lineTotalKobo: saleLines.lineTotalKobo,
        })
        .from(produceMovements)
        .innerJoin(
          produceLots,
          and(
            eq(produceLots.id, produceMovements.produceLotId),
            eq(produceLots.organisationId, ctx.orgId),
          ),
        )
        .innerJoin(
          harvests,
          and(
            eq(harvests.id, produceLots.harvestId),
            eq(harvests.organisationId, ctx.orgId),
          ),
        )
        .innerJoin(
          saleLines,
          and(
            eq(saleLines.id, produceMovements.saleLineId),
            eq(saleLines.organisationId, ctx.orgId),
          ),
        )
        .where(
          and(
            eq(produceMovements.organisationId, ctx.orgId),
            eq(produceMovements.type, "sale"),
          ),
        ),
      db
        .select({
          cycleId: inventoryMovements.cropCycleId,
          quantity: inventoryMovements.quantity,
          unitCostKobo: itemBatches.unitCostKobo,
        })
        .from(inventoryMovements)
        .innerJoin(
          itemBatches,
          and(
            eq(itemBatches.id, inventoryMovements.itemBatchId),
            eq(itemBatches.organisationId, ctx.orgId),
          ),
        )
        .where(
          and(
            eq(inventoryMovements.organisationId, ctx.orgId),
            eq(inventoryMovements.type, "issue"),
            isNotNull(inventoryMovements.cropCycleId),
          ),
        ),
      db
        .select({
          cycleId: expenses.cropCycleId,
          amountKobo: sql<string>`sum(${expenses.amountKobo})`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.organisationId, ctx.orgId),
            isNotNull(expenses.cropCycleId),
          ),
        )
        .groupBy(expenses.cropCycleId),
      db
        .select({ amountKobo: sql<string | null>`sum(${expenses.amountKobo})` })
        .from(expenses)
        .where(
          and(
            eq(expenses.organisationId, ctx.orgId),
            isNull(expenses.cropCycleId),
          ),
        ),
      db
        .select({
          cycleId: harvests.cropCycleId,
          kg: sql<string>`sum(${harvestLines.kg})`,
        })
        .from(harvestLines)
        .innerJoin(
          harvests,
          and(
            eq(harvests.id, harvestLines.harvestId),
            eq(harvests.organisationId, ctx.orgId),
          ),
        )
        .where(eq(harvestLines.organisationId, ctx.orgId))
        .groupBy(harvests.cropCycleId),
    ]);

  const salesBy = new Map<string, SaleAllocation[]>();
  for (const s of saleRows) {
    const list = salesBy.get(s.cycleId) ?? [];
    list.push({
      saleLineId: s.saleLineId,
      kg: Number(s.kg),
      lineKg: Number(s.lineKg),
      lineTotalKobo: s.lineTotalKobo,
    });
    salesBy.set(s.cycleId, list);
  }
  const issuesBy = new Map<string, IssueCost[]>();
  for (const i of issueRows) {
    if (!i.cycleId) continue;
    const list = issuesBy.get(i.cycleId) ?? [];
    list.push({ quantity: Number(i.quantity), unitCostKobo: i.unitCostKobo });
    issuesBy.set(i.cycleId, list);
  }
  const expensesBy = new Map(
    expenseRows.map((e) => [e.cycleId, Number(e.amountKobo)]),
  );
  const harvestedBy = new Map(
    harvested.map((h) => [h.cycleId, roundQty(Number(h.kg))]),
  );

  const computed: Profitability[] = [];
  const rows: ProfitabilityRow[] = cycles.map((c) => {
    const p = computeProfitability({
      sales: salesBy.get(c.cycleId) ?? [],
      issues: issuesBy.get(c.cycleId) ?? [],
      expenses: [{ amountKobo: expensesBy.get(c.cycleId) ?? 0 }],
    });
    computed.push(p);
    return {
      ...c,
      kgHarvested: harvestedBy.get(c.cycleId) ?? 0,
      ...redactProfit(ctx, p),
    };
  });

  const total = sumProfitability(computed);
  return {
    rows,
    totals: {
      kgHarvested: roundQty(rows.reduce((s, r) => s + r.kgHarvested, 0)),
      ...redactProfit(ctx, total),
    },
    unallocatedExpensesKobo: money(ctx, Number(unallocated[0]?.amountKobo ?? 0)),
  };
}

// ------------------------------------------------------------ input use

export interface InputUseRow {
  key: string;
  label: string;
  sublabel: string | null;
  /** Σ issued quantity — only for the "item" grouping (single unit). */
  quantity: number | null;
  baseUnit: BaseUnit | null;
  issues: number;
  /** Distinct items in the group. */
  itemCount: number;
  costKobo: number | null;
}

export interface InputUseReport {
  range: ReportRange;
  by: InputUseGroup;
  rows: InputUseRow[];
  totalIssues: number;
  totalCostKobo: number | null;
}

/** Issue movements in range, rolled up by item, greenhouse or cycle. */
export async function getInputUseReport(
  ctx: Ctx,
  range: ReportRange,
  by: InputUseGroup,
): Promise<InputUseReport> {
  const raw = await db
    .select({
      itemId: items.id,
      itemName: items.name,
      category: items.category,
      baseUnit: items.baseUnit,
      greenhouseId: inventoryMovements.greenhouseId,
      greenhouseName: greenhouses.name,
      cycleId: inventoryMovements.cropCycleId,
      cycleCode: cropCycles.code,
      quantity: inventoryMovements.quantity,
      unitCostKobo: itemBatches.unitCostKobo,
    })
    .from(inventoryMovements)
    .innerJoin(
      items,
      and(
        eq(items.id, inventoryMovements.itemId),
        eq(items.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      itemBatches,
      and(
        eq(itemBatches.id, inventoryMovements.itemBatchId),
        eq(itemBatches.organisationId, ctx.orgId),
      ),
    )
    .leftJoin(
      greenhouses,
      and(
        eq(greenhouses.id, inventoryMovements.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    )
    .leftJoin(
      cropCycles,
      and(
        eq(cropCycles.id, inventoryMovements.cropCycleId),
        eq(cropCycles.organisationId, ctx.orgId),
      ),
    )
    .where(
      and(
        eq(inventoryMovements.organisationId, ctx.orgId),
        eq(inventoryMovements.type, "issue"),
        lagosDayBetween(inventoryMovements.performedAt, range),
      ),
    );

  type Acc = {
    key: string;
    label: string;
    sublabel: string | null;
    qtyMilli: number;
    baseUnit: BaseUnit | null;
    issues: number;
    items: Set<string>;
    costKobo: number;
  };
  const groups = new Map<string, Acc>();
  let totalCost = 0;
  for (const r of raw) {
    const qty = Math.abs(Number(r.quantity));
    const cost = rateTimesQty(r.unitCostKobo, qty);
    totalCost += cost;
    let key: string;
    let label: string;
    let sublabel: string | null;
    if (by === "item") {
      key = r.itemId;
      label = r.itemName;
      sublabel = ITEM_CATEGORY_LABELS[r.category];
    } else if (by === "greenhouse") {
      key = r.greenhouseId ?? "none";
      label = r.greenhouseName ?? "No greenhouse";
      sublabel = null;
    } else {
      key = r.cycleId ?? "none";
      label = r.cycleCode ?? "No crop cycle";
      sublabel = r.greenhouseName;
    }
    const acc = groups.get(key) ?? {
      key,
      label,
      sublabel,
      qtyMilli: 0,
      baseUnit: by === "item" ? r.baseUnit : null,
      issues: 0,
      items: new Set<string>(),
      costKobo: 0,
    };
    acc.qtyMilli += milli(qty);
    acc.issues += 1;
    acc.items.add(r.itemId);
    acc.costKobo += cost;
    groups.set(key, acc);
  }

  const rows: InputUseRow[] = [...groups.values()]
    .sort((a, b) =>
      ctx.canSeeMoney && b.costKobo !== a.costKobo
        ? b.costKobo - a.costKobo
        : a.label.localeCompare(b.label),
    )
    .map((g) => ({
      key: g.key,
      label: g.label,
      sublabel: g.sublabel,
      quantity: by === "item" ? g.qtyMilli / 1000 : null,
      baseUnit: g.baseUnit,
      issues: g.issues,
      itemCount: g.items.size,
      costKobo: money(ctx, g.costKobo),
    }));

  return {
    range,
    by,
    rows,
    totalIssues: raw.length,
    totalCostKobo: money(ctx, totalCost),
  };
}

// ------------------------------------------------------------ harvest matrix

export interface HarvestWeekRow {
  /** Monday of the ISO week (Lagos), yyyy-MM-dd. */
  weekStart: string;
  kg: Record<Grade, number>;
  totalKg: number;
  /** Grade A share of the week's kg, 0–100 (1 dp); null when no kg. */
  gradeAPct: number | null;
}

export interface HarvestReport {
  range: ReportRange;
  rows: HarvestWeekRow[];
  totals: Omit<HarvestWeekRow, "weekStart">;
}

const emptyGrades = (): Record<Grade, number> => ({ a: 0, b: 0, c: 0, reject: 0 });

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/** Σ harvest_lines.kg per ISO week (Lagos) × grade in range. No money. */
export async function getHarvestReport(
  ctx: Ctx,
  range: ReportRange,
): Promise<HarvestReport> {
  const week = sql<string>`to_char(date_trunc('week', ${harvests.harvestedAt} at time zone ${TZ}), 'YYYY-MM-DD')`;
  const raw = await db
    .select({
      weekStart: week,
      grade: harvestLines.grade,
      kg: sql<string>`sum(${harvestLines.kg})`,
    })
    .from(harvestLines)
    .innerJoin(
      harvests,
      and(
        eq(harvests.id, harvestLines.harvestId),
        eq(harvests.organisationId, ctx.orgId),
      ),
    )
    .where(
      and(
        eq(harvestLines.organisationId, ctx.orgId),
        lagosDayBetween(harvests.harvestedAt, range),
      ),
    )
    .groupBy(week, harvestLines.grade)
    .orderBy(asc(week));

  const byWeek = new Map<string, Record<Grade, number>>();
  const totalsMilli = emptyGrades();
  for (const r of raw) {
    const g = byWeek.get(r.weekStart) ?? emptyGrades();
    const kgMilli = milli(Number(r.kg));
    g[r.grade] += kgMilli;
    totalsMilli[r.grade] += kgMilli;
    byWeek.set(r.weekStart, g);
  }
  const toRow = (m: Record<Grade, number>) => {
    const totalMilli = m.a + m.b + m.c + m.reject;
    return {
      kg: { a: m.a / 1000, b: m.b / 1000, c: m.c / 1000, reject: m.reject / 1000 },
      totalKg: totalMilli / 1000,
      gradeAPct: pct(m.a, totalMilli),
    };
  };
  return {
    range,
    rows: [...byWeek.entries()].map(([weekStart, m]) => ({
      weekStart,
      ...toRow(m),
    })),
    totals: toRow(totalsMilli),
  };
}

// ------------------------------------------------------------ waste

export interface WasteRow {
  id: string;
  performedAt: Date;
  cropName: string;
  varietyName: string;
  grade: Grade;
  storeName: string;
  kg: number;
  reason: string;
  note: string | null;
}

export interface WasteReport {
  range: ReportRange;
  rows: WasteRow[];
  byReason: { reason: string; kg: number; entries: number }[];
  totalKg: number;
}

/** Stored waste_reason is "spoiled" or "other: <note>" (produce/schema). */
function splitWasteReason(raw: string | null): { reason: string; note: string | null } {
  if (!raw) return { reason: "Unspecified", note: null };
  const idx = raw.indexOf(":");
  const key = (idx === -1 ? raw : raw.slice(0, idx)).trim();
  const note = idx === -1 ? null : raw.slice(idx + 1).trim() || null;
  const label = WASTE_REASON_LABELS[key as WasteReason];
  return label ? { reason: label, note } : { reason: raw, note: null };
}

/** produce_movements of type waste in range, newest first. No money. */
export async function getWasteReport(
  ctx: Ctx,
  range: ReportRange,
): Promise<WasteReport> {
  const raw = await db
    .select({
      id: produceMovements.id,
      performedAt: produceMovements.performedAt,
      kg: produceMovements.kg,
      wasteReason: produceMovements.wasteReason,
      grade: produceLots.grade,
      cropName: crops.name,
      varietyName: varieties.name,
      storeName: stores.name,
    })
    .from(produceMovements)
    .innerJoin(
      produceLots,
      and(
        eq(produceLots.id, produceMovements.produceLotId),
        eq(produceLots.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      crops,
      and(eq(crops.id, produceLots.cropId), eq(crops.organisationId, ctx.orgId)),
    )
    .innerJoin(
      varieties,
      and(
        eq(varieties.id, produceLots.varietyId),
        eq(varieties.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      stores,
      and(
        eq(stores.id, produceMovements.storeId),
        eq(stores.organisationId, ctx.orgId),
      ),
    )
    .where(
      and(
        eq(produceMovements.organisationId, ctx.orgId),
        eq(produceMovements.type, "waste"),
        lagosDayBetween(produceMovements.performedAt, range),
      ),
    )
    .orderBy(desc(produceMovements.performedAt));

  const reasons = new Map<string, { kgMilli: number; entries: number }>();
  let totalMilli = 0;
  const rows: WasteRow[] = raw.map((r) => {
    const kg = Math.abs(Number(r.kg));
    const { reason, note } = splitWasteReason(r.wasteReason);
    const acc = reasons.get(reason) ?? { kgMilli: 0, entries: 0 };
    acc.kgMilli += milli(kg);
    acc.entries += 1;
    reasons.set(reason, acc);
    totalMilli += milli(kg);
    return {
      id: r.id,
      performedAt: r.performedAt,
      cropName: r.cropName,
      varietyName: r.varietyName,
      grade: r.grade,
      storeName: r.storeName,
      kg: roundQty(kg),
      reason,
      note,
    };
  });
  return {
    range,
    rows,
    byReason: [...reasons.entries()]
      .map(([reason, v]) => ({ reason, kg: v.kgMilli / 1000, entries: v.entries }))
      .sort((a, b) => b.kg - a.kg),
    totalKg: totalMilli / 1000,
  };
}

// ------------------------------------------------------------ stock valuation

export interface StockValuationRow {
  itemId: string;
  name: string;
  category: ItemCategory;
  baseUnit: BaseUnit;
  onHand: number;
  valueKobo: number | null;
  /** value ÷ on-hand, kobo per base unit (2 dp); null for workers. */
  avgCostKobo: number | null;
}

export interface StockValuationReport {
  asOf: string;
  rows: StockValuationRow[];
  totalValueKobo: number | null;
}

/**
 * On-hand × batch rate per item (DATA-MODEL §5 stock value), reusing the
 * store module's org-scoped, redaction-aware stock list.
 */
export async function getStockValuationReport(
  ctx: Ctx,
): Promise<StockValuationReport> {
  const stock = await listStockItems(ctx);
  const rows: StockValuationRow[] = stock
    .filter((s) => s.onHand > 0)
    .map((s) => ({
      itemId: s.id,
      name: s.name,
      category: s.category,
      baseUnit: s.baseUnit,
      onHand: s.onHand,
      valueKobo: ctx.canSeeMoney ? (s.stockValueKobo ?? 0) : null,
      avgCostKobo:
        ctx.canSeeMoney && s.onHand > 0
          ? Math.round(((s.stockValueKobo ?? 0) / s.onHand) * 100) / 100
          : null,
    }))
    .sort((a, b) =>
      a.valueKobo !== null && b.valueKobo !== null && a.valueKobo !== b.valueKobo
        ? b.valueKobo - a.valueKobo
        : a.name.localeCompare(b.name),
    );
  return {
    asOf: todayLagos(),
    rows,
    totalValueKobo: money(
      ctx,
      rows.reduce((s, r) => s + (r.valueKobo ?? 0), 0),
    ),
  };
}

// ------------------------------------------------------------ purchases

export interface PurchaseRow {
  /** yyyy-MM (Lagos). */
  month: string;
  supplierId: string;
  supplierName: string;
  receipts: number;
  totalKobo: number | null;
}

export interface PurchasesReport {
  range: ReportRange;
  rows: PurchaseRow[];
  bySupplier: {
    supplierId: string;
    supplierName: string;
    receipts: number;
    totalKobo: number | null;
  }[];
  receiptCount: number;
  totalKobo: number | null;
}

/** Receipts in range grouped by (Lagos month, supplier). */
export async function getPurchasesReport(
  ctx: Ctx,
  range: ReportRange,
): Promise<PurchasesReport> {
  const month = sql<string>`to_char(${receipts.receivedAt} at time zone ${TZ}, 'YYYY-MM')`;
  const raw = await db
    .select({
      month,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      receipts: sql<number>`count(*)::int`,
      totalKobo: sql<string>`sum(${receipts.totalCostKobo})`,
    })
    .from(receipts)
    .innerJoin(
      suppliers,
      and(
        eq(suppliers.id, receipts.supplierId),
        eq(suppliers.organisationId, ctx.orgId),
      ),
    )
    .where(
      and(
        eq(receipts.organisationId, ctx.orgId),
        lagosDayBetween(receipts.receivedAt, range),
      ),
    )
    .groupBy(month, suppliers.id, suppliers.name)
    .orderBy(desc(month), asc(suppliers.name));

  const bySupplier = new Map<
    string,
    { supplierId: string; supplierName: string; receipts: number; totalKobo: number }
  >();
  let total = 0;
  let count = 0;
  for (const r of raw) {
    const t = Number(r.totalKobo);
    total += t;
    count += r.receipts;
    const s = bySupplier.get(r.supplierId) ?? {
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      receipts: 0,
      totalKobo: 0,
    };
    s.receipts += r.receipts;
    s.totalKobo += t;
    bySupplier.set(r.supplierId, s);
  }
  return {
    range,
    rows: raw.map((r) => ({
      month: r.month,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      receipts: r.receipts,
      totalKobo: money(ctx, Number(r.totalKobo)),
    })),
    bySupplier: [...bySupplier.values()]
      .sort((a, b) => b.totalKobo - a.totalKobo)
      .map((s) => ({ ...s, totalKobo: money(ctx, s.totalKobo) })),
    receiptCount: count,
    totalKobo: money(ctx, total),
  };
}

// ------------------------------------------------------------ spray record

/** Harvests listed after a spray: up to harvest-safe date + this many days. */
export const SPRAY_FOLLOW_UP_DAYS = 7;
const SPRAY_MAX_FOLLOWING = 10;

export interface SprayProductLine {
  itemId: string;
  name: string;
  activeIngredient: string | null;
  baseUnit: BaseUnit;
  /** Total applied, base units. */
  quantity: number;
  /** Base units per 1,000 L of water (3 dp). */
  ratePer1000L: number;
  batchNumbers: string[];
  /** Label values snapshotted at application time. */
  phiDays: number | null;
  reiHours: number | null;
}

export interface SprayFollowingHarvest {
  harvestId: string;
  harvestedAt: Date;
  /** Lagos date of the harvest. */
  harvestDate: string;
  kg: number;
  /** Harvested before the spray's harvest-safe date. */
  withinPhi: boolean;
  phiOverride: boolean;
  phiOverrideReason: string | null;
}

export interface SprayRecordRow {
  applicationId: string;
  appliedAt: Date;
  greenhouseName: string;
  cycleId: string;
  cycleCode: string;
  cropName: string;
  varietyName: string;
  recipeName: string | null;
  waterVolumeLitres: number;
  operatorName: string;
  entrySafeAt: Date | null;
  harvestSafeDate: string | null;
  notes: string | null;
  products: SprayProductLine[];
  following: SprayFollowingHarvest[];
  /** Any following harvest inside the PHI window. */
  phiViolations: number;
}

export interface SprayRecordReport {
  range: ReportRange;
  rows: SprayRecordRow[];
  totalViolations: number;
}

const maxNullable = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.max(a, b);

/** Every spray application in range (oldest first). No money. */
export async function getSprayRecord(
  ctx: Ctx,
  range: ReportRange,
): Promise<SprayRecordReport> {
  const apps = await db
    .select({
      applicationId: applications.id,
      appliedAt: applications.appliedAt,
      greenhouseName: greenhouses.name,
      cycleId: applications.cropCycleId,
      cycleCode: cropCycles.code,
      cropName: crops.name,
      varietyName: varieties.name,
      recipeName: recipes.name,
      waterVolumeLitres: applications.waterVolumeLitres,
      operatorName: user.name,
      entrySafeAt: applications.entrySafeAt,
      harvestSafeDate: applications.harvestSafeDate,
      notes: applications.notes,
    })
    .from(applications)
    .innerJoin(
      greenhouses,
      and(
        eq(greenhouses.id, applications.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      cropCycles,
      and(
        eq(cropCycles.id, applications.cropCycleId),
        eq(cropCycles.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      varieties,
      and(
        eq(varieties.id, cropCycles.varietyId),
        eq(varieties.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      crops,
      and(eq(crops.id, varieties.cropId), eq(crops.organisationId, ctx.orgId)),
    )
    .innerJoin(user, eq(user.id, applications.operatorId))
    .leftJoin(
      recipes,
      and(
        eq(recipes.id, applications.recipeId),
        eq(recipes.organisationId, ctx.orgId),
      ),
    )
    .where(
      and(
        eq(applications.organisationId, ctx.orgId),
        eq(applications.type, "spray"),
        lagosDayBetween(applications.appliedAt, range),
      ),
    )
    .orderBy(asc(applications.appliedAt), asc(applications.createdAt));

  if (apps.length === 0) return { range, rows: [], totalViolations: 0 };

  const appIds = apps.map((a) => a.applicationId);
  const cycleIds = [...new Set(apps.map((a) => a.cycleId))];
  const earliest = apps[0].appliedAt;

  const [lines, harvestRows] = await Promise.all([
    db
      .select({
        applicationId: applicationItems.applicationId,
        itemId: applicationItems.itemId,
        name: items.name,
        activeIngredient: items.activeIngredient,
        baseUnit: items.baseUnit,
        quantity: applicationItems.quantity,
        batchNumber: itemBatches.batchNumber,
        phiDays: applicationItems.phiDaysSnapshot,
        reiHours: applicationItems.reiHoursSnapshot,
      })
      .from(applicationItems)
      .innerJoin(
        items,
        and(
          eq(items.id, applicationItems.itemId),
          eq(items.organisationId, ctx.orgId),
        ),
      )
      .innerJoin(
        itemBatches,
        and(
          eq(itemBatches.id, applicationItems.itemBatchId),
          eq(itemBatches.organisationId, ctx.orgId),
        ),
      )
      .where(
        and(
          eq(applicationItems.organisationId, ctx.orgId),
          inArray(applicationItems.applicationId, appIds),
        ),
      )
      .orderBy(asc(items.name)),
    db
      .select({
        harvestId: harvests.id,
        cycleId: harvests.cropCycleId,
        harvestedAt: harvests.harvestedAt,
        phiOverride: harvests.phiOverride,
        phiOverrideReason: harvests.phiOverrideReason,
        kg: sql<string>`coalesce(sum(${harvestLines.kg}), 0)`,
      })
      .from(harvests)
      .leftJoin(
        harvestLines,
        and(
          eq(harvestLines.harvestId, harvests.id),
          eq(harvestLines.organisationId, ctx.orgId),
        ),
      )
      .where(
        and(
          eq(harvests.organisationId, ctx.orgId),
          inArray(harvests.cropCycleId, cycleIds),
          gte(harvests.harvestedAt, earliest),
        ),
      )
      .groupBy(harvests.id)
      .orderBy(asc(harvests.harvestedAt)),
  ]);

  const productsByApp = new Map<
    string,
    Map<string, Omit<SprayProductLine, "ratePer1000L"> & { qtyMilli: number }>
  >();
  for (const l of lines) {
    const byItem = productsByApp.get(l.applicationId) ?? new Map();
    const prev = byItem.get(l.itemId);
    const qtyMilli = (prev?.qtyMilli ?? 0) + milli(Number(l.quantity));
    byItem.set(l.itemId, {
      itemId: l.itemId,
      name: l.name,
      activeIngredient: l.activeIngredient,
      baseUnit: l.baseUnit,
      quantity: qtyMilli / 1000,
      qtyMilli,
      batchNumbers: [...(prev?.batchNumbers ?? []), l.batchNumber],
      phiDays: maxNullable(prev?.phiDays ?? null, l.phiDays),
      reiHours: maxNullable(prev?.reiHours ?? null, l.reiHours),
    });
    productsByApp.set(l.applicationId, byItem);
  }

  const harvestsByCycle = new Map<string, typeof harvestRows>();
  for (const h of harvestRows) {
    const list = harvestsByCycle.get(h.cycleId) ?? [];
    list.push(h);
    harvestsByCycle.set(h.cycleId, list);
  }

  let totalViolations = 0;
  const rows: SprayRecordRow[] = apps.map((a) => {
    const volume = Number(a.waterVolumeLitres);
    const products = [...(productsByApp.get(a.applicationId)?.values() ?? [])].map(
      ({ qtyMilli, ...p }) => ({
        ...p,
        ratePer1000L: volume > 0 ? roundQty((qtyMilli / 1000 / volume) * 1000) : 0,
      }),
    );
    const appliedDate = lagosDateOf(a.appliedAt);
    const until = addDays(a.harvestSafeDate ?? appliedDate, SPRAY_FOLLOW_UP_DAYS);
    const following: SprayFollowingHarvest[] = (harvestsByCycle.get(a.cycleId) ?? [])
      .filter(
        (h) =>
          h.harvestedAt.getTime() >= a.appliedAt.getTime() &&
          lagosDateOf(h.harvestedAt) <= until,
      )
      .slice(0, SPRAY_MAX_FOLLOWING)
      .map((h) => {
        const harvestDate = lagosDateOf(h.harvestedAt);
        return {
          harvestId: h.harvestId,
          harvestedAt: h.harvestedAt,
          harvestDate,
          kg: roundQty(Number(h.kg)),
          withinPhi: !isHarvestSafe(a.harvestSafeDate, harvestDate),
          phiOverride: h.phiOverride,
          phiOverrideReason: h.phiOverrideReason,
        };
      });
    const phiViolations = following.filter((f) => f.withinPhi).length;
    totalViolations += phiViolations;
    return {
      applicationId: a.applicationId,
      appliedAt: a.appliedAt,
      greenhouseName: a.greenhouseName,
      cycleId: a.cycleId,
      cycleCode: a.cycleCode,
      cropName: a.cropName,
      varietyName: a.varietyName,
      recipeName: a.recipeName,
      waterVolumeLitres: volume,
      operatorName: a.operatorName,
      entrySafeAt: a.entrySafeAt,
      harvestSafeDate: a.harvestSafeDate,
      notes: a.notes,
      products,
      following,
      phiViolations,
    };
  });

  return { range, rows, totalViolations };
}
