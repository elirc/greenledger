"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
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
import { createVariety } from "@/modules/crops/actions";
import type { CropRow } from "@/modules/crops/queries";
import {
  varietyCreateSchema,
  type VarietyCreateInput,
} from "@/modules/crops/schema";
import { applyActionError } from "./form-helpers";
import { NumberInput } from "./number-input";

/** Add a variety (wizard step 4). Uses the crops module schema + action. */
export function VarietyForm({
  crops,
  onSaved,
}: {
  crops: CropRow[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const blank = (cropId: string): VarietyCreateInput => ({
    cropId,
    name: "",
    daysToFirstHarvest: Number.NaN,
    harvestDurationWeeks: Number.NaN,
    expectedYieldKgPerPlant: Number.NaN,
    notes: "",
    isActive: true,
  });
  const form = useForm<VarietyCreateInput>({
    resolver: zodResolver(varietyCreateSchema),
    defaultValues: blank(crops[0]?.id ?? ""),
  });

  async function onSubmit(values: VarietyCreateInput) {
    const result = await createVariety(values);
    if (result.ok) {
      toast.success(`${values.name} added`);
      form.reset(blank(values.cropId));
      router.refresh();
      onSaved?.();
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
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          variant="secondary"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting || crops.length === 0}
        >
          {form.formState.isSubmitting ? "Adding…" : "Add variety"}
        </Button>
      </form>
    </Form>
  );
}
