"use client";

import { useState } from "react";
import { Shovel, Sprout, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DiscardForm } from "./discard-form";
import { TransplantForm, type TransplantGreenhouse } from "./transplant-form";
import { UpdateCountsForm } from "./update-counts-form";

type Panel = "counts" | "discard" | "transplant" | null;

/** Action buttons + sheets for an open nursery batch. */
export function NurseryBatchActions({
  batch,
  available,
  today,
  greenhouses,
}: {
  batch: {
    id: string;
    sowDate: string;
    seedsSown: number;
    germinated: number;
    ready: number;
  };
  available: number;
  today: string;
  greenhouses: TransplantGreenhouse[];
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const close = () => setPanel(null);

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          className="h-12"
          onClick={() => setPanel("transplant")}
          disabled={available <= 0}
        >
          <Shovel /> Transplant
        </Button>
        <Button
          variant="outline"
          className="h-12"
          onClick={() => setPanel("counts")}
        >
          <Sprout /> Update counts
        </Button>
        <Button
          variant="outline"
          className="h-12"
          onClick={() => setPanel("discard")}
          disabled={available <= 0}
        >
          <Trash2 /> Discard
        </Button>
      </div>

      <Sheet
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {panel === "counts" ? (
            <>
              <SheetHeader>
                <SheetTitle>Update counts</SheetTitle>
                <SheetDescription>
                  Enter running totals. To record losses use Discard.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <UpdateCountsForm batch={batch} onDone={close} />
              </div>
            </>
          ) : null}
          {panel === "discard" ? (
            <>
              <SheetHeader>
                <SheetTitle>Discard seedlings</SheetTitle>
                <SheetDescription>
                  Removes seedlings from this batch. This can&apos;t be undone.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <DiscardForm
                  batchId={batch.id}
                  available={available}
                  onDone={close}
                />
              </div>
            </>
          ) : null}
          {panel === "transplant" ? (
            <>
              <SheetHeader>
                <SheetTitle>Transplant</SheetTitle>
                <SheetDescription>
                  Starts a crop cycle in the greenhouse you pick.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <TransplantForm
                  batchId={batch.id}
                  available={available}
                  sowDate={batch.sowDate}
                  today={today}
                  greenhouses={greenhouses}
                  onDone={close}
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
