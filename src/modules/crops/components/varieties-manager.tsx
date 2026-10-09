"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Sprout, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { deleteVariety, ensureDefaultCrops } from "../actions";
import type { CropRow, VarietyRow } from "../queries";
import { DEFAULT_CROPS, DEFAULT_CROP_KEYS } from "../schema";
import { CropShelfLifeForm } from "./crop-shelf-life-form";
import { VarietySheetForm } from "./variety-sheet-form";

type SheetState =
  | { mode: "add"; cropId: string }
  | { mode: "edit"; varietyId: string }
  | null;

/** Settings → Varieties: varieties grouped by crop, add/edit in sheets. */
export function VarietiesManager({
  crops,
  varieties,
}: {
  crops: CropRow[];
  varieties: VarietyRow[];
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [addingCrops, setAddingCrops] = useState(false);
  const editing =
    sheet?.mode === "edit"
      ? (varieties.find((v) => v.id === sheet.varietyId) ?? null)
      : null;
  const close = () => setSheet(null);

  const missingDefaults = DEFAULT_CROP_KEYS.filter(
    (k) =>
      !crops.some(
        (c) => c.name.toLowerCase() === DEFAULT_CROPS[k].name.toLowerCase(),
      ),
  );

  async function addDefaultCrops() {
    setAddingCrops(true);
    try {
      const result = await ensureDefaultCrops({ crops: [...missingDefaults] });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Crops added");
      router.refresh();
    } finally {
      setAddingCrops(false);
    }
  }

  async function onDelete(v: VarietyRow) {
    const result = await deleteVariety({ id: v.id });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${v.name} deleted`);
    close();
    router.refresh();
  }

  if (crops.length === 0) {
    return (
      <EmptyState
        icon={Sprout}
        title="No crops yet"
        description="Add tomato and pepper, then the varieties you plant. Shelf life starts at 7 and 10 days — you can change it."
      >
        <Button
          className="h-11"
          onClick={addDefaultCrops}
          disabled={addingCrops}
        >
          {addingCrops ? "Adding…" : "Add Tomato and Pepper"}
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {crops.map((crop) => {
        const list = varieties.filter((v) => v.cropId === crop.id);
        return (
          <SectionCard
            key={crop.id}
            title={crop.name}
            action={
              <Button
                variant="outline"
                className="h-11"
                onClick={() => setSheet({ mode: "add", cropId: crop.id })}
              >
                <Plus /> Add variety
              </Button>
            }
          >
            <div className="space-y-4">
              <CropShelfLifeForm key={`${crop.id}-${crop.shelfLifeDays}`} crop={crop} />
              {list.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                  No {crop.name.toLowerCase()} varieties yet.
                </p>
              ) : (
                <ul className="divide-border divide-y rounded-lg border">
                  {list.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setSheet({ mode: "edit", varietyId: v.id })
                        }
                        className="hover:bg-muted/50 flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{v.name}</span>
                            {!v.isActive ? (
                              <StatusBadge variant="neutral">Inactive</StatusBadge>
                            ) : null}
                          </div>
                          <span className="text-muted-foreground text-sm">
                            First harvest day {v.daysToFirstHarvest} ·{" "}
                            {v.harvestDurationWeeks} harvest weeks ·{" "}
                            {v.expectedYieldKgPerPlant} kg/plant
                          </span>
                        </div>
                        <ChevronRight className="text-muted-foreground size-5 shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </SectionCard>
        );
      })}

      {missingDefaults.length > 0 ? (
        <Button
          variant="ghost"
          className="h-11 w-full"
          onClick={addDefaultCrops}
          disabled={addingCrops}
        >
          <Plus />{" "}
          {missingDefaults.map((k) => DEFAULT_CROPS[k].name).join(" and ")}
        </Button>
      ) : null}

      <Sheet
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {sheet?.mode === "add" ? (
            <>
              <SheetHeader>
                <SheetTitle>Add variety</SheetTitle>
                <SheetDescription>
                  Harvest timing and yield drive cycle forecasts.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <VarietySheetForm
                  key={`add-${sheet.cropId}`}
                  crops={crops}
                  defaultCropId={sheet.cropId}
                  onSaved={close}
                />
              </div>
            </>
          ) : null}
          {editing ? (
            <>
              <SheetHeader>
                <SheetTitle>{editing.name}</SheetTitle>
                <SheetDescription>
                  Changes apply to new crop cycles; existing cycles keep their
                  dates.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 px-4 pb-6">
                <VarietySheetForm
                  key={editing.id}
                  crops={crops}
                  variety={editing}
                  onSaved={close}
                />
                <Separator />
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive" className="h-11 w-full">
                      <Trash2 /> Delete variety
                    </Button>
                  }
                  title={`Delete ${editing.name}?`}
                  description="Varieties used by nursery batches or crop cycles can't be deleted — mark them inactive instead."
                  confirmLabel="Delete"
                  destructive
                  onConfirm={() => onDelete(editing)}
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
