"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sprout } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { ensureDefaultCrops } from "@/modules/crops/actions";
import type { CropRow, VarietyRow } from "@/modules/crops/queries";
import {
  DEFAULT_CROPS,
  DEFAULT_CROP_KEYS,
  ensureCropsSchema,
  type EnsureCropsInput,
} from "@/modules/crops/schema";
import { applyActionError } from "./form-helpers";
import { VarietyForm } from "./variety-form";

/** Wizard step 4: pick crops (tomato / pepper), then add varieties. */
export function WizardVarietiesStep({
  crops,
  varieties,
  onDone,
}: {
  crops: CropRow[];
  varieties: VarietyRow[];
  onDone: () => void;
}) {
  const router = useRouter();
  const hasCrop = (name: string) =>
    crops.some((c) => c.name.toLowerCase() === name.toLowerCase());
  const missing = DEFAULT_CROP_KEYS.filter((k) => !hasCrop(DEFAULT_CROPS[k].name));

  const form = useForm<EnsureCropsInput>({
    resolver: zodResolver(ensureCropsSchema),
    defaultValues: { crops: missing.length > 0 ? [...missing] : [] },
  });

  async function onSubmitCrops(values: EnsureCropsInput) {
    const result = await ensureDefaultCrops(values);
    if (result.ok) {
      toast.success("Crops saved");
      router.refresh();
      return;
    }
    applyActionError(form, result);
  }

  return (
    <div className="space-y-5">
      <SectionCard title="1. Crops you grow">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmitCrops)}
            className="space-y-3"
          >
            <FormField
              control={form.control}
              name="crops"
              render={({ field }) => (
                <FormItem>
                  <ul className="space-y-2">
                    {DEFAULT_CROP_KEYS.map((k) => {
                      const def = DEFAULT_CROPS[k];
                      const exists = hasCrop(def.name);
                      return (
                        <li key={k}>
                          <label className="has-[:disabled]:bg-muted/40 flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2">
                            <FormControl>
                              <Checkbox
                                className="size-5"
                                checked={exists || field.value.includes(k)}
                                disabled={exists}
                                onCheckedChange={(v) =>
                                  field.onChange(
                                    v === true
                                      ? [...new Set([...field.value, k])]
                                      : field.value.filter((x) => x !== k),
                                  )
                                }
                              />
                            </FormControl>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 font-medium">
                                {def.name}
                                {exists ? (
                                  <StatusBadge variant="success">Added</StatusBadge>
                                ) : null}
                              </div>
                              <p className="text-muted-foreground text-sm">
                                Shelf life {def.shelfLifeDays} days (editable later)
                              </p>
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <FormMessage />
                </FormItem>
              )}
            />
            {missing.length > 0 ? (
              <Button
                type="submit"
                variant={crops.length === 0 ? "default" : "outline"}
                className="h-11 w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Saving…" : "Save crops"}
              </Button>
            ) : null}
          </form>
        </Form>
      </SectionCard>

      <SectionCard title="2. Varieties">
        {crops.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Save your crops first, then add the varieties you plant.
          </p>
        ) : (
          <div className="space-y-4">
            {varieties.length === 0 ? (
              <EmptyState
                icon={Sprout}
                title="No varieties yet"
                description="Add at least one variety — it drives harvest forecasts."
              />
            ) : (
              <ul className="divide-border divide-y rounded-lg border">
                {varieties.map((v) => (
                  <li key={v.id} className="flex min-h-14 flex-col justify-center px-4 py-2">
                    <span className="font-medium">
                      {v.name}{" "}
                      <span className="text-muted-foreground font-normal">
                        · {v.cropName}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-sm">
                      First harvest day {v.daysToFirstHarvest} ·{" "}
                      {v.harvestDurationWeeks} weeks · {v.expectedYieldKgPerPlant}{" "}
                      kg/plant
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <VarietyForm crops={crops} />
          </div>
        )}
      </SectionCard>

      <Button
        type="button"
        className="h-11 w-full"
        disabled={varieties.length === 0}
        onClick={onDone}
      >
        Continue
      </Button>
    </div>
  );
}
