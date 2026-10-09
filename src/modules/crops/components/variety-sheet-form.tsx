"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { createVariety, updateVariety } from "../actions";
import type { CropRow, VarietyRow } from "../queries";
import { varietyCreateSchema, type VarietyCreateInput } from "../schema";

/** Add (no `variety`) or edit a variety. Lives inside a sheet. */
export function VarietySheetForm({
  crops,
  variety,
  defaultCropId,
  onSaved,
}: {
  crops: CropRow[];
  variety?: VarietyRow;
  defaultCropId?: string;
  onSaved: () => void;
}) {
  const router = useRouter();
  const form = useForm<VarietyCreateInput>({
    resolver: zodResolver(varietyCreateSchema),
    defaultValues: variety
      ? {
          cropId: variety.cropId,
          name: variety.name,
          daysToFirstHarvest: variety.daysToFirstHarvest,
          harvestDurationWeeks: variety.harvestDurationWeeks,
          expectedYieldKgPerPlant: variety.expectedYieldKgPerPlant,
          notes: variety.notes ?? "",
          isActive: variety.isActive,
        }
      : {
          cropId: defaultCropId ?? crops[0]?.id ?? "",
          name: "",
          daysToFirstHarvest: Number.NaN,
          harvestDurationWeeks: Number.NaN,
          expectedYieldKgPerPlant: Number.NaN,
          notes: "",
          isActive: true,
        },
  });

  async function onSubmit(values: VarietyCreateInput) {
    const result = variety
      ? await updateVariety({ ...values, id: variety.id })
      : await createVariety(values);
    if (result.ok) {
      toast.success(variety ? "Variety saved" : `${values.name} added`);
      onSaved();
      router.refresh();
      return;
    }
    applyActionError(form, result, "name");
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="cropId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Crop</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a crop" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {crops.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="min-h-11">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Variety name</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  autoComplete="off"
                  placeholder="e.g. Padma F1"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="daysToFirstHarvest"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Days to first harvest</FormLabel>
                <FormControl>
                  <NumberInput
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="harvestDurationWeeks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Harvest weeks</FormLabel>
                <FormControl>
                  <NumberInput
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="expectedYieldKgPerPlant"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Expected yield (kg per plant)</FormLabel>
              <FormControl>
                <NumberInput
                  decimal
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormDescription>
                Days are counted from transplant. Drives harvest forecasts.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="rounded-lg border px-3 py-2">
              <div className="flex min-h-11 items-center justify-between gap-3">
                <div>
                  <FormLabel>Active</FormLabel>
                  <FormDescription>
                    Inactive varieties are hidden when starting nursery batches.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting || crops.length === 0}
        >
          {form.formState.isSubmitting
            ? "Saving…"
            : variety
              ? "Save changes"
              : "Add variety"}
        </Button>
      </form>
    </Form>
  );
}
