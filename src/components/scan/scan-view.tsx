"use client";

import { useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageMinus, Package } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { addDays, formatLagosDate, todayLagos } from "@/lib/dates";
import { formatQty, type BaseUnit } from "@/lib/units";
import { decodeScanText } from "./decode";
import { ManualCodeEntry } from "./manual-code-entry";
import { QrScanner } from "./qr-scanner";

export interface ScannedBatch {
  id: string;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  batchNumber: string;
  expiryDate: string | null;
  stock: { storeId: string; storeName: string; onHand: number }[];
  totalOnHand: number;
}

export type ScanResult =
  | { kind: "batch"; id: string; batch: ScannedBatch | null }
  | { kind: "lot" | "equip"; id: string }
  | { kind: "invalid" };

const LATER_PHASE: Record<"lot" | "equip", string> = {
  lot: "Produce lot scanning is coming in a later phase.",
  equip: "Equipment scanning is coming in a later phase.",
};

/**
 * /scan: live camera + manual entry. A decoded label navigates to the same
 * URL a phone camera app would open (/scan?t=..&id=..), so the server
 * renders the result either way.
 */
export function ScanView({
  result,
  canIssue,
}: {
  result: ScanResult | null;
  /** Owner/manager/storekeeper — workers only see the summary. */
  canIssue: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const announced = useRef<string | null>(null);

  const batch = result?.kind === "batch" ? result.batch : null;
  const sheetOpen = Boolean(batch);

  // One toast per scanned URL for kinds without a screen yet / bad ids.
  useEffect(() => {
    if (!result) return;
    const key = JSON.stringify(result.kind === "invalid" ? result : { k: result.kind, id: result.id });
    if (announced.current === key) return;
    announced.current = key;
    if (result.kind === "lot" || result.kind === "equip") {
      toast.info(LATER_PHASE[result.kind]);
    } else if (result.kind === "invalid") {
      toast.error("That code is not a GreenLedger label.");
    } else if (result.kind === "batch" && !result.batch) {
      toast.error("Batch not found on this farm.");
    }
  }, [result]);

  function handleText(text: string) {
    const decoded = decodeScanText(text);
    if (!decoded) {
      toast.error("That code is not a GreenLedger label.");
      return;
    }
    if (decoded.kind !== "batch") {
      toast.info(LATER_PHASE[decoded.kind]);
      return;
    }
    announced.current = null;
    startTransition(() => {
      router.replace(`/scan?t=batch&id=${decoded.id}`);
    });
  }

  function closeSheet(open: boolean) {
    if (open) return;
    startTransition(() => router.replace("/scan"));
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <QrScanner onDecode={handleText} paused={sheetOpen || pending} />
      <p className="text-muted-foreground text-center text-sm">
        {pending ? "Looking up…" : "Hold the label inside the square."}
      </p>
      <ManualCodeEntry onSubmit={handleText} />

      <Sheet open={sheetOpen} onOpenChange={closeSheet}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          {batch ? <BatchSummaryBody batch={batch} canIssue={canIssue} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BatchSummaryBody({
  batch,
  canIssue,
}: {
  batch: ScannedBatch;
  canIssue: boolean;
}) {
  const today = todayLagos();
  const expired = batch.expiryDate !== null && batch.expiryDate < today;
  const soon =
    !expired && batch.expiryDate !== null && batch.expiryDate <= addDays(today, 30);

  return (
    <>
      <SheetHeader>
        <SheetTitle>{batch.itemName}</SheetTitle>
        <SheetDescription>Batch {batch.batchNumber}</SheetDescription>
      </SheetHeader>
      <div className="space-y-3 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">
            {batch.expiryDate
              ? `Expires ${formatLagosDate(batch.expiryDate)}`
              : "No expiry date"}
          </span>
          {expired ? (
            <StatusBadge variant="danger">Expired</StatusBadge>
          ) : soon ? (
            <StatusBadge variant="warning">Expires soon</StatusBadge>
          ) : null}
        </div>
        <div className="rounded-lg border">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-medium">On hand</span>
            <span className="text-lg font-semibold tabular-nums">
              {formatQty(batch.totalOnHand, batch.baseUnit)}
            </span>
          </div>
          {batch.stock.length > 0 ? (
            <ul className="divide-y border-t">
              {batch.stock.map((s) => (
                <li
                  key={s.storeId}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>{s.storeName}</span>
                  <span className="tabular-nums">
                    {formatQty(s.onHand, batch.baseUnit)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground border-t px-3 py-2 text-sm">
              No stock left in any store.
            </p>
          )}
        </div>
      </div>
      {canIssue ? (
        <SheetFooter className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            asChild
            className="h-12 text-base"
            disabled={batch.totalOnHand <= 0}
          >
            <Link
              href={`/store/issue?batchId=${batch.id}&itemId=${batch.itemId}`}
            >
              <PackageMinus className="size-5" /> Issue this batch
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-12 text-base">
            <Link href={`/store/items/${batch.itemId}`}>
              <Package className="size-5" /> View item
            </Link>
          </Button>
        </SheetFooter>
      ) : (
        <SheetFooter>
          <p className="text-muted-foreground text-sm">
            Ask the storekeeper to issue this batch.
          </p>
        </SheetFooter>
      )}
    </>
  );
}
