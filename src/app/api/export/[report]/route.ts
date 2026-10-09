import { z } from "zod";
import { AuthError } from "@/lib/errors";
import { requireMember } from "@/lib/guard";
import { buildReportExport } from "@/modules/reports/excel";
import { parseReportParams, REPORT_KEYS } from "@/modules/reports/queries";

const reportSchema = z.enum(REPORT_KEYS);

/**
 * GET /api/export/<report>?from=yyyy-MM-dd&to=yyyy-MM-dd[&by=item|greenhouse|cycle]
 * Owner/manager only; every query is org-scoped (reports/queries.ts).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ report: string }> },
) {
  let ctx;
  try {
    ctx = await requireMember({ roles: ["owner", "manager"] });
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.code }, { status: 403 });
    }
    throw e;
  }

  const parsedReport = reportSchema.safeParse((await params).report);
  if (!parsedReport.success) {
    return Response.json(
      { error: `Unknown report. Use one of: ${REPORT_KEYS.join(", ")}` },
      { status: 404 },
    );
  }

  const sp = new URL(request.url).searchParams;
  const { params: reportParams, range } = parseReportParams(
    (k) => sp.get(k) ?? undefined,
  );

  const { bytes, filename } = await buildReportExport(
    ctx,
    parsedReport.data,
    reportParams,
    range,
  );
  return new Response(bytes, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
