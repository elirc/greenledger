import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, PackagePlus, Printer } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/guard";
import { ReceiptSummary } from "@/modules/receipts/components/receipt-summary";
import { getReceipt } from "@/modules/receipts/queries";

export const metadata = { title: "Receipt" };

/** Receipt detail — also the success screen after receiving. */
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const receipt = await getReceipt(ctx, id);
  if (!receipt) notFound();

  const lineCount = receipt.lines.length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Receipt" backHref="/store/receive" />
      <div className="border-status-success/25 bg-status-success/10 flex items-start gap-3 rounded-xl border p-4">
        <CircleCheck className="text-status-success mt-0.5 size-6 shrink-0" />
        <div>
          <p className="font-medium">Stock received</p>
          <p className="text-muted-foreground text-sm">
            {lineCount} {lineCount === 1 ? "batch" : "batches"} added to{" "}
            {receipt.storeName}. Print QR labels and stick them on the packs.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button asChild className="h-12 text-base">
          <a
            href={`/api/pdf/label?receiptId=${receipt.id}`}
            target="_blank"
            rel="noopener"
          >
            <Printer className="size-5" /> Print labels
          </a>
        </Button>
        <Button asChild variant="outline" className="h-12 text-base">
          <Link href="/store/receive">
            <PackagePlus className="size-5" /> Receive more
          </Link>
        </Button>
      </div>
      <ReceiptSummary receipt={receipt} showMoney={ctx.canSeeMoney} />
    </div>
  );
}
