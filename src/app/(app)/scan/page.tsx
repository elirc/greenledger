import { PageHeader } from "@/components/shell/page-header";
import { ScanView, type ScanResult } from "@/components/scan/scan-view";
import { requireMember } from "@/lib/guard";
import { parseQrPayload } from "@/lib/qr";
import { getBatchSummary } from "@/modules/stock/queries";

export const metadata = { title: "Scan" };

/**
 * Labels encode `${APP_URL}/scan?t=<kind>&id=<uuid>`, so a phone camera
 * app opens this page directly; the in-app scanner navigates to the same
 * URL. The result is resolved server-side (org-scoped).
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember();
  const sp = await searchParams;

  let result: ScanResult | null = null;
  const t = typeof sp.t === "string" ? sp.t : undefined;
  const id = typeof sp.id === "string" ? sp.id : undefined;
  if (t || id) {
    const parsed = parseQrPayload(
      `http://scan.local/scan?t=${encodeURIComponent(t ?? "")}&id=${encodeURIComponent(id ?? "")}`,
    );
    if (!parsed) {
      result = { kind: "invalid" };
    } else if (parsed.kind === "batch") {
      result = {
        kind: "batch",
        id: parsed.id,
        batch: await getBatchSummary(ctx, parsed.id),
      };
    } else {
      result = { kind: parsed.kind, id: parsed.id };
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Scan"
        description="Scan a batch label to see its stock or issue it."
      />
      <ScanView result={result} canIssue={ctx.role !== "worker"} />
    </div>
  );
}
