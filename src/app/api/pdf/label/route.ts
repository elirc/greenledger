import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { itemBatches, items, receiptLines } from "@/db/schema";
import { AuthError } from "@/lib/errors";
import { requireMember } from "@/lib/guard";
import { buildQrUrl } from "@/lib/qr";
import { formatLagosDate } from "@/lib/dates";
import { UNIT_LABELS } from "@/lib/units";
import { LabelSheet, type LabelData } from "@/modules/documents/label-sheet";

const MAX_LABELS = 220; // 5 pages

export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await requireMember({ roles: ["owner", "manager", "storekeeper"] });
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.code }, { status: 403 });
    }
    throw e;
  }

  const url = new URL(request.url);
  const copies = Math.min(
    Math.max(Number(url.searchParams.get("copies") ?? 6) || 6, 1),
    44,
  );

  let batchIds: string[] = [];
  const receiptId = url.searchParams.get("receiptId");
  if (receiptId) {
    const lines = await db
      .select({ itemBatchId: receiptLines.itemBatchId })
      .from(receiptLines)
      .where(
        and(
          eq(receiptLines.organisationId, ctx.orgId),
          eq(receiptLines.receiptId, receiptId),
        ),
      );
    batchIds = [...new Set(lines.map((l) => l.itemBatchId))];
  } else {
    batchIds = (url.searchParams.get("batchIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (batchIds.length === 0) {
    return Response.json(
      { error: "Pass ?receiptId=... or ?batchIds=a,b,c" },
      { status: 400 },
    );
  }

  const rows = await db
    .select({
      id: itemBatches.id,
      batchNumber: itemBatches.batchNumber,
      expiryDate: itemBatches.expiryDate,
      itemName: items.name,
      baseUnit: items.baseUnit,
    })
    .from(itemBatches)
    .innerJoin(items, eq(items.id, itemBatches.itemId))
    .where(
      and(
        eq(itemBatches.organisationId, ctx.orgId),
        inArray(itemBatches.id, batchIds),
      ),
    );
  if (rows.length === 0) {
    return Response.json({ error: "No matching batches" }, { status: 404 });
  }

  const labels: LabelData[] = [];
  for (const row of rows) {
    const qrDataUrl = await QRCode.toDataURL(buildQrUrl("batch", row.id), {
      margin: 0,
      scale: 6,
      errorCorrectionLevel: "M",
    });
    const label: LabelData = {
      qrDataUrl,
      itemName: row.itemName,
      batchNumber: row.batchNumber,
      expiryText: row.expiryDate
        ? `Exp ${formatLagosDate(row.expiryDate)}`
        : "No expiry",
      unitLabel: UNIT_LABELS[row.baseUnit],
    };
    for (let i = 0; i < copies && labels.length < MAX_LABELS; i++) {
      labels.push(label);
    }
  }

  const buffer = await renderToBuffer(
    createElement(LabelSheet, { labels }) as unknown as ReactElement<DocumentProps>,
  );
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="greenledger-labels.pdf"`,
    },
  });
}
