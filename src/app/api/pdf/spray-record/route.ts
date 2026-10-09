import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { AuthError } from "@/lib/errors";
import { requireMember } from "@/lib/guard";
import { SprayRecord } from "@/modules/documents/spray-record";
import {
  getFarmLetterhead,
  getSprayRecord,
  parseReportParams,
} from "@/modules/reports/queries";

/** GET /api/pdf/spray-record?from=yyyy-MM-dd&to=yyyy-MM-dd — owner/manager, org-scoped. */
export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await requireMember({ roles: ["owner", "manager"] });
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.code }, { status: 403 });
    }
    throw e;
  }

  const sp = new URL(request.url).searchParams;
  const { range } = parseReportParams((k) => sp.get(k) ?? undefined);

  const [farm, record] = await Promise.all([
    getFarmLetterhead(ctx),
    getSprayRecord(ctx, range),
  ]);

  const buffer = await renderToBuffer(
    createElement(SprayRecord, {
      farm,
      range,
      rows: record.rows,
      totalViolations: record.totalViolations,
      generatedAt: new Date(),
    }) as unknown as ReactElement<DocumentProps>,
  );
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="greenledger-spray-record-${range.from}-${range.to}.pdf"`,
    },
  });
}
