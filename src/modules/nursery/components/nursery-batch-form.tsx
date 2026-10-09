"use client";

import { useRef } from "react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { VarietyRow } from "@/modules/crops/queries";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { createNurseryBatch } from "../actions";
import type { SeedBatchOption } from "../queries";
import {
  nurseryBatchCreateSchema,
  type NurseryBatchCreateInput,
} from "../schema";
import { SeedBatchCombobox } from "./seed-batch-combobox";

/** New nursery batch. Seeds sown follows trays × cells until edited by hand. */
export function NurseryBatchForm({
  varieties,
  seedBatches,
  today,
}: {
  varieties: VarietyRow[];
  seedBatches: SeedBatchOption[];
  /** Lagos yyyy-MM-dd, computed on the server. */
  today: string;
}) {
  const router = useRouter();
  const seedsEdited = useRef(false);
  const form = useForm<NurseryBatchCreateInput>({
    resolver: zodResolver(nurseryBatchCreateSchema),
    defaultValues: {
      varietyId: varieties.length === 1 ? varieties[0].id : "",
      sowDate: today,
      trays: Number.NaN,
      cellsPerTray: Number.NaN,
      seedsSown: Number.NaN,
      seedItemBatchId: "",
      notes: "",
    },
  });

  // Group varieties under their crop for the select.
  const groups = new Map<string, VarietyRow[]>();
  for (const v of varieties) {
    const list = groups.get(v.cropName) ?? [];
    list.push(v);
    groups.set(v.cropName, list);
  }

  function syncSeeds(trays: number | undefined, cells: number | undefined) {
    if (seedsEdited.current) return;
    if (
      trays !== undefined &&
      cells !== undefined &&
      Number.isFinite(trays) &&
      Number.isFinite(cells) &&
      trays > 0 &&
      cells > 0
    ) {
      form.setValue("seedsSown", trays * cells, { shouldValidate: true });
    }
  }

  async function onSubmit(values: NurseryBatchCreateInput) {
    const result = await createNurseryBatch(values);
    if (result.ok) {
      toast.success("Nursery batch started");
      router.push(`/nursery/${result.data.id}`);
      router.refresh();
      return;
    }
    if (result.code === "NOT_SEED") {
      form.setError("seedItemBatchId", { message: result.error });
    }
    applyActionError(form, result);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="varietyId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Variety</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a variety" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {[...groups.entries()].map(([crop, list]) => (
                    <SelectGroup key={crop}>
                      <SelectLabel>{crop}</SelectLabel>
                      {list.map((v) => (
                        <SelectItem key={v.id} value={v.id} className="min-h-11">
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="sowDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sow date</FormLabel>
              <FormControl>
                <Input className="h-11" type="date" max={today} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="trays"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trays</FormLabel>
                <FormControl>
                  <NumberInput
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      syncSeeds(v, form.getValues("cellsPerTray"));
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="cellsPerTray"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cells per tray</FormLabel>
                <FormControl>
                  <NumberInput
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      syncSeeds(form.getValues("trays"), v);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="seedsSown"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Seeds sown</FormLabel>
              <FormControl>
                <NumberInput
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  onChange={(v) => {
                    seedsEdited.current = v !== undefined;
                    field.onChange(v);
                  }}
                />
              </FormControl>
              <FormDescription>
                Fills in as trays × cells. Change it if some cells were left
                empty or double-sown.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="seedItemBatchId"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Seed batch used</FormLabel>
              <SeedBatchCombobox
                id={field.name}
                batches={seedBatches}
                value={field.value ?? ""}
                onChange={field.onChange}
                invalid={fieldState.invalid}
              />
              <FormDescription>
                Optional — links this batch to the seed lot from the store.
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
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving…" : "Start nursery batch"}
        </Button>
      </form>
    </Form>
  );
}
