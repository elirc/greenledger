import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { z } from "zod";
import { AuthError } from "@/lib/errors";
import { requireMember } from "@/lib/guard";
import { Invoice } from "@/modules/documents/invoice";
import { getSaleDocument } from "@/modules/sales/queries";

/** GET /api/pdf/invoice?saleId=<uuid> — owner/manager only, org-scoped. */
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

  const saleId = new URL(request.url).searchParams.get("saleId");
  const parsed = z.uuid().safeParse(saleId);
  if (!parsed.success) {
    return Response.json({ error: "Pass ?saleId=<uuid>" }, { status: 400 });
  }

  const doc = await getSaleDocument(ctx, parsed.data);
  if (!doc) return Response.json({ error: "Sale not found" }, { status: 404 });

  const buffer = await renderToBuffer(
    createElement(Invoice, { doc }) as unknown as ReactElement<DocumentProps>,
  );
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="greenledger-invoice-${doc.sale.invoiceNumber}.pdf"`,
    },
  });
}
