import { Workbook } from "exceljs";
import { formatLagos } from "@/lib/dates";
import type { Ctx } from "@/lib/guard";
import { UNIT_LABELS } from "@/lib/units";
import { CYCLE_STATUS_LABELS } from "@/modules/cycles/status";
import { GRADE_LABELS } from "@/modules/harvest/schema";
import { ITEM_CATEGORY_LABELS } from "@/modules/items/schema";
import {
  getHarvestReport,
  getInputUseReport,
  getProfitabilityReport,
  getPurchasesReport,
  getSprayRecord,
  getStockValuationReport,
  getWasteReport,
  REPORT_META,
  type ReportKey,
  type ReportParams,
  type ReportRange,
} from "./queries";

/**
 * ExcelJS helpers (ARCHITECTURE §10): one sheet per report, bold frozen
 * header row, explicit column widths, number formats (kobo → naira with
 * ₦#,##0.00), filename greenledger-<report>-<yyyyMMdd>.xlsx. Server-only
 * (used by /api/export/[report]); data comes from reports/queries.ts.
 */

export type ExcelFormat =
  | "text"
  | "naira" // value is integer kobo; written as naira
  | "qty" // up to 3 dp
  | "int"
  | "pct" // value is 0–100
  | "date"; // value is yyyy-MM-dd (Lagos calendar day)

export type ExcelValue = string | number | null | undefined;

export interface ExcelColumn<T> {
  header: string;
  width: number;
  format?: ExcelFormat;
  value: (row: T) => ExcelValue;
}

const NUM_FMT: Record<ExcelFormat, string | undefined> = {
  text: undefined,
  naira: '"₦"#,##0.00',
  qty: "#,##0.###",
  int: "#,##0",
  pct: '0.0"%"',
  date: "dd mmm yyyy",
};

function cellValue(format: ExcelFormat, v: ExcelValue): string | number | Date | null {
  if (v === null || v === undefined || v === "") return null;
  switch (format) {
    case "naira":
      return typeof v === "number" ? v / 100 : v;
    case "date": {
      // Calendar day → a UTC-midnight Date so Excel shows the same day.
      const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
      return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : v;
    }
    default:
      return v;
  }
}

/** One-sheet workbook → bytes. `totals` (optional) is appended as a bold row. */
export async function buildWorkbook<T>(opts: {
  sheetName: string;
  columns: ExcelColumn<T>[];
  rows: T[];
  totals?: Partial<Record<number, ExcelValue>>;
}): Promise<Uint8Array<ArrayBuffer>> {
  const wb = new Workbook();
  wb.creator = "GreenLedger";
  wb.created = new Date();
  // Sheet names: max 31 chars, no []:*?/\
  const ws = wb.addWorksheet(opts.sheetName.replace(/[[\]:*?/\\]/g, " ").slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = opts.columns.map((c, i) => ({
    key: `c${i}`,
    width: c.width,
    style: NUM_FMT[c.format ?? "text"]
      ? { numFmt: NUM_FMT[c.format ?? "text"] }
      : {},
  }));

  const header = ws.getRow(1);
  opts.columns.forEach((c, i) => {
    header.getCell(i + 1).value = c.header;
  });
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };

  for (const row of opts.rows) {
    ws.addRow(
      opts.columns.map((c) => cellValue(c.format ?? "text", c.value(row))),
    );
  }

  if (opts.totals) {
    const t = ws.addRow(
      opts.columns.map((c, i) => cellValue(c.format ?? "text", opts.totals?.[i])),
    );
    t.font = { bold: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as unknown as ArrayBuffer);
}

/** greenledger-<report>-<yyyyMMdd>.xlsx, dated by the Lagos calendar day. */
export function excelFilename(report: string, now: Date = new Date()): string {
  return `greenledger-${report}-${formatLagos(now, "yyyyMMdd")}.xlsx`;
}

const rangeSuffix = (r: ReportRange) => ` ${r.from} to ${r.to}`;

/** Build the workbook for one report key. */
export async function buildReportExport(
  ctx: Ctx,
  report: ReportKey,
  params: ReportParams,
  range: ReportRange,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; filename: string }> {
  const filename = excelFilename(report);
  const title = REPORT_META[report].title;

  switch (report) {
    case "profitability": {
      const data = await getProfitabilityReport(ctx);
      const bytes = await buildWorkbook({
        sheetName: title,
        rows: data.rows,
        columns: [
          { header: "Cycle", width: 16, value: (r) => r.code },
          { header: "Greenhouse", width: 14, value: (r) => r.greenhouseName },
          { header: "Crop", width: 12, value: (r) => r.cropName },
          { header: "Variety", width: 18, value: (r) => r.varietyName },
          { header: "Status", width: 12, value: (r) => CYCLE_STATUS_LABELS[r.status] },
          { header: "Harvested (kg)", width: 14, format: "qty", value: (r) => r.kgHarvested },
          { header: "Sold (kg)", width: 12, format: "qty", value: (r) => r.kgSold },
          { header: "Revenue", width: 16, format: "naira", value: (r) => r.revenueKobo },
          { header: "Input cost", width: 16, format: "naira", value: (r) => r.inputCostKobo },
          { header: "Cycle expenses", width: 16, format: "naira", value: (r) => r.expensesKobo },
          { header: "Profit", width: 16, format: "naira", value: (r) => r.profitKobo },
          { header: "Cost per kg sold", width: 16, format: "naira", value: (r) => r.costPerKgKobo },
        ],
        totals: {
          0: "Total",
          5: data.totals.kgHarvested,
          6: data.totals.kgSold,
          7: data.totals.revenueKobo,
          8: data.totals.inputCostKobo,
          9: data.totals.expensesKobo,
          10: data.totals.profitKobo,
          11: data.totals.costPerKgKobo,
        },
      });
      return { bytes, filename };
    }

    case "input-use": {
      const data = await getInputUseReport(ctx, range, params.by);
      const groupHeader =
        params.by === "item" ? "Item" : params.by === "greenhouse" ? "Greenhouse" : "Crop cycle";
      const bytes = await buildWorkbook({
        sheetName: `Input use by ${params.by}`,
        rows: data.rows,
        columns: [
          { header: groupHeader, width: 28, value: (r) => r.label },
          {
            header: params.by === "item" ? "Category" : params.by === "cycle" ? "Greenhouse" : "Detail",
            width: 16,
            value: (r) => r.sublabel,
          },
          { header: "Quantity", width: 12, format: "qty", value: (r) => r.quantity },
          { header: "Unit", width: 8, value: (r) => (r.baseUnit ? UNIT_LABELS[r.baseUnit] : null) },
          { header: "Issues", width: 9, format: "int", value: (r) => r.issues },
          { header: "Items", width: 9, format: "int", value: (r) => r.itemCount },
          { header: "Cost", width: 16, format: "naira", value: (r) => r.costKobo },
        ],
        totals: { 0: `Total${rangeSuffix(range)}`, 4: data.totalIssues, 6: data.totalCostKobo },
      });
      return { bytes, filename };
    }

    case "harvest": {
      const data = await getHarvestReport(ctx, range);
      const bytes = await buildWorkbook({
        sheetName: title,
        rows: data.rows,
        columns: [
          { header: "Week of (Mon)", width: 14, format: "date", value: (r) => r.weekStart },
          { header: `${GRADE_LABELS.a} (kg)`, width: 13, format: "qty", value: (r) => r.kg.a },
          { header: `${GRADE_LABELS.b} (kg)`, width: 13, format: "qty", value: (r) => r.kg.b },
          { header: `${GRADE_LABELS.c} (kg)`, width: 13, format: "qty", value: (r) => r.kg.c },
          { header: `${GRADE_LABELS.reject} (kg)`, width: 13, format: "qty", value: (r) => r.kg.reject },
          { header: "Total (kg)", width: 13, format: "qty", value: (r) => r.totalKg },
          { header: "Grade A share", width: 13, format: "pct", value: (r) => r.gradeAPct },
        ],
        totals: {
          0: "Total",
          1: data.totals.kg.a,
          2: data.totals.kg.b,
          3: data.totals.kg.c,
          4: data.totals.kg.reject,
          5: data.totals.totalKg,
          6: data.totals.gradeAPct,
        },
      });
      return { bytes, filename };
    }

    case "waste": {
      const data = await getWasteReport(ctx, range);
      const bytes = await buildWorkbook({
        sheetName: title,
        rows: data.rows,
        columns: [
          { header: "Date", width: 18, value: (r) => formatLagos(r.performedAt) },
          { header: "Crop", width: 12, value: (r) => r.cropName },
          { header: "Variety", width: 18, value: (r) => r.varietyName },
          { header: "Grade", width: 10, value: (r) => GRADE_LABELS[r.grade] },
          { header: "Store", width: 14, value: (r) => r.storeName },
          { header: "Kg", width: 10, format: "qty", value: (r) => r.kg },
          { header: "Reason", width: 18, value: (r) => r.reason },
          { header: "Note", width: 30, value: (r) => r.note },
        ],
        totals: { 0: "Total", 5: data.totalKg },
      });
      return { bytes, filename };
    }

    case "stock-valuation": {
      const data = await getStockValuationReport(ctx);
      const bytes = await buildWorkbook({
        sheetName: title,
        rows: data.rows,
        columns: [
          { header: "Item", width: 28, value: (r) => r.name },
          { header: "Category", width: 16, value: (r) => ITEM_CATEGORY_LABELS[r.category] },
          { header: "On hand", width: 12, format: "qty", value: (r) => r.onHand },
          { header: "Unit", width: 8, value: (r) => UNIT_LABELS[r.baseUnit] },
          { header: "Avg cost / unit", width: 16, format: "naira", value: (r) => r.avgCostKobo },
          { header: "Value", width: 16, format: "naira", value: (r) => r.valueKobo },
        ],
        totals: { 0: `Total as of ${data.asOf}`, 5: data.totalValueKobo },
      });
      return { bytes, filename };
    }

    case "purchases": {
      const data = await getPurchasesReport(ctx, range);
      const bytes = await buildWorkbook({
        sheetName: title,
        rows: data.rows,
        columns: [
          { header: "Month", width: 10, value: (r) => r.month },
          { header: "Supplier", width: 28, value: (r) => r.supplierName },
          { header: "Receipts", width: 10, format: "int", value: (r) => r.receipts },
          { header: "Total", width: 16, format: "naira", value: (r) => r.totalKobo },
        ],
        totals: { 0: `Total${rangeSuffix(range)}`, 2: data.receiptCount, 3: data.totalKobo },
      });
      return { bytes, filename };
    }

    case "spray-record": {
      const data = await getSprayRecord(ctx, range);
      // One row per product per spray, so rates sort and filter in Excel.
      const flat = data.rows.flatMap((a) =>
        (a.products.length > 0 ? a.products : [null]).map((p) => ({ a, p })),
      );
      const bytes = await buildWorkbook({
        sheetName: title,
        rows: flat,
        columns: [
          { header: "Applied (Lagos)", width: 18, value: ({ a }) => formatLagos(a.appliedAt) },
          { header: "Greenhouse", width: 12, value: ({ a }) => a.greenhouseName },
          { header: "Cycle", width: 14, value: ({ a }) => a.cycleCode },
          { header: "Crop / variety", width: 22, value: ({ a }) => `${a.cropName} ${a.varietyName}` },
          { header: "Operator", width: 16, value: ({ a }) => a.operatorName },
          { header: "Water (L)", width: 10, format: "qty", value: ({ a }) => a.waterVolumeLitres },
          { header: "Product", width: 24, value: ({ p }) => p?.name ?? "—" },
          { header: "Active ingredient", width: 20, value: ({ p }) => p?.activeIngredient },
          { header: "Batch", width: 14, value: ({ p }) => p?.batchNumbers.join(", ") },
          { header: "Quantity", width: 10, format: "qty", value: ({ p }) => p?.quantity },
          { header: "Unit", width: 7, value: ({ p }) => (p ? UNIT_LABELS[p.baseUnit] : null) },
          { header: "Rate / 1000 L", width: 13, format: "qty", value: ({ p }) => p?.ratePer1000L },
          { header: "PHI (days)", width: 10, format: "int", value: ({ p }) => p?.phiDays },
          { header: "REI (hours)", width: 10, format: "int", value: ({ p }) => p?.reiHours },
          {
            header: "Entry-safe at",
            width: 18,
            value: ({ a }) => (a.entrySafeAt ? formatLagos(a.entrySafeAt) : null),
          },
          { header: "Harvest-safe date", width: 15, format: "date", value: ({ a }) => a.harvestSafeDate },
          {
            header: "Harvests that followed",
            width: 40,
            value: ({ a }) =>
              a.following
                .map(
                  (h) =>
                    `${formatLagos(h.harvestedAt, "dd MMM")} ${h.kg} kg${h.withinPhi ? (h.phiOverride ? " (WITHIN PHI — override)" : " (WITHIN PHI)") : ""}`,
                )
                .join("; "),
          },
          { header: "Within-PHI harvests", width: 12, format: "int", value: ({ a }) => a.phiViolations },
        ],
      });
      return { bytes, filename };
    }
  }
}
