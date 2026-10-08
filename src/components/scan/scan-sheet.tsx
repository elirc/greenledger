"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ManualCodeEntry } from "./manual-code-entry";
import { QrScanner } from "./qr-scanner";

/**
 * Bottom sheet with the camera scanner + manual entry. The scanner (and the
 * camera) only mounts while the sheet is open.
 */
export function ScanSheet({
  open,
  onOpenChange,
  onResult,
  title = "Scan a label",
  description = "Point the camera at the QR code on the batch label.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (text: string) => void;
  title?: string;
  description?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[95dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="mx-auto w-full max-w-sm space-y-4 px-4 pb-6">
          {open ? <QrScanner onDecode={onResult} /> : null}
          <ManualCodeEntry onSubmit={onResult} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
