import Link from "next/link";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { listLabelBatches } from "@/modules/stock/stock-queries";
import { LabelPicker } from "./label-picker";

export const metadata = { title: "Print labels" };

export default async function LabelsPage() {
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const batches = await listLabelBatches(ctx);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Print labels"
        description="Pick batches, then print a QR label sheet (A4, 44 labels per page)."
        backHref="/store"
      />
      {batches.length === 0 ? (
        <EmptyState
          icon={QrCode}
          title="No batches yet"
          description="Batches appear here once stock has been received."
        >
          <Button asChild className="h-11">
            <Link href="/store/receive">Receive stock</Link>
          </Button>
        </EmptyState>
      ) : (
        <LabelPicker
          batches={batches.map((b) => ({
            batchId: b.batchId,
            batchNumber: b.batchNumber,
            itemName: b.itemName,
            baseUnit: b.baseUnit,
            expiryDate: b.expiryDate,
            onHand: b.onHand,
          }))}
        />
      )}
    </div>
  );
}
