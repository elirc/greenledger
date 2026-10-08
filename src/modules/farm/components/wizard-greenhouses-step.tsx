"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Wand2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveGreenhouses } from "../actions";
import type { GreenhouseRow } from "../queries";
import {
  GREENHOUSE_TYPES,
  GREENHOUSE_TYPE_LABELS,
  greenhousesBulkSchema,
  type GreenhouseRowInput,
  type GreenhousesBulkInput,
} from "../schema";
import { applyActionError } from "./form-helpers";
import { NumberInput } from "./number-input";

const emptyRow = (name = ""): GreenhouseRowInput => ({
  name,
  type: "greenhouse",
  areaM2: Number.NaN,
  plantCapacity: Number.NaN,
});

/** Wizard step 2: repeatable greenhouse rows + "GH1..GHn" bulk helper. */
export function WizardGreenhousesStep({
  siteId,
  greenhouses,
  onDone,
}: {
  siteId: string;
  greenhouses: GreenhouseRow[];
  onDone: () => void;
}) {
  const router = useRouter();
  const form = useForm<GreenhousesBulkInput>({
    resolver: zodResolver(greenhousesBulkSchema),
    defaultValues: {
      siteId,
      rows:
        greenhouses.length > 0
          ? greenhouses.map((g) => ({
              id: g.id,
              name: g.name,
              type: g.type,
              areaM2: g.areaM2,
              plantCapacity: g.plantCapacity,
            }))
          : [emptyRow("GH1")],
    },
  });
  // keyName "key": keep the row's own `id` (existing greenhouse) intact.
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "rows",
    keyName: "key",
  });

  const [bulkCount, setBulkCount] = useState<number | undefined>(4);
  const [bulkPrefix, setBulkPrefix] = useState("GH");
  const [bulkArea, setBulkArea] = useState<number | undefined>(undefined);
  const [bulkCapacity, setBulkCapacity] = useState<number | undefined>(
    undefined,
  );

  function bulkAdd() {
    const n = bulkCount ?? 0;
    if (n < 1 || n > 100) {
      toast.error("Enter how many greenhouses to add (1–100).");
      return;
    }
    const prefix = bulkPrefix.trim() || "GH";
    const current = form.getValues("rows");
    // Fill blank rows first, then append; skip names already used.
    const used = new Set(
      current.map((r) => r.name.trim().toLowerCase()).filter(Boolean),
    );
    const names: string[] = [];
    for (let k = 1; names.length < n && k < n + 500; k++) {
      const name = `${prefix}${k}`;
      if (!used.has(name.toLowerCase())) names.push(name);
    }
    const toRow = (name: string): GreenhouseRowInput => ({
      name,
      type: "greenhouse",
      areaM2: bulkArea ?? Number.NaN,
      plantCapacity: bulkCapacity ?? Number.NaN,
    });
    const keep = current.filter(
      (r) => r.id || r.name.trim() !== "" || !Number.isNaN(r.areaM2),
    );
    replace([...keep, ...names.map(toRow)]);
    toast.success(`Added ${names.length} rows`);
  }

  async function onSubmit(values: GreenhousesBulkInput) {
    const result = await saveGreenhouses(values);
    if (result.ok) {
      const { created, updated } = result.data;
      toast.success(
        created > 0
          ? `${created} greenhouse${created === 1 ? "" : "s"} added`
          : `${updated} greenhouse${updated === 1 ? "" : "s"} saved`,
      );
      router.refresh();
      onDone();
      return;
    }
    if (result.code === "DUPLICATE") {
      const rows = form.getValues("rows");
      rows.forEach((r, i) => {
        if (result.error.includes(`"${r.name}"`)) {
          form.setError(`rows.${i}.name`, { message: "Name already used" });
        }
      });
    }
    applyActionError(form, result);
  }

  const rowsError = form.formState.errors.rows?.root?.message ??
    form.formState.errors.rows?.message;

  return (
    <div className="space-y-5">
      <div className="bg-muted/40 space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2 font-medium">
          <Wand2 className="size-4" /> Quick add
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-count">How many</Label>
            <NumberInput
              id="bulk-count"
              value={bulkCount}
              onChange={setBulkCount}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-prefix">Name prefix</Label>
            <Input
              id="bulk-prefix"
              className="h-11"
              value={bulkPrefix}
              onChange={(e) => setBulkPrefix(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-area">Area each (m²)</Label>
            <NumberInput
              id="bulk-area"
              decimal
              value={bulkArea}
              onChange={setBulkArea}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-capacity">Plants each</Label>
            <NumberInput
              id="bulk-capacity"
              value={bulkCapacity}
              onChange={setBulkCapacity}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          onClick={bulkAdd}
        >
          Add {bulkPrefix.trim() || "GH"}1…{bulkPrefix.trim() || "GH"}
          {bulkCount ?? "n"}
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          {fields.map((f, i) => {
            const isExisting = Boolean(form.getValues(`rows.${i}.id`));
            return (
              <div key={f.key} className="space-y-3 rounded-xl border p-3">
                <div className="flex items-start gap-2">
                  <FormField
                    control={form.control}
                    name={`rows.${i}.name`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input
                            className="h-11"
                            autoComplete="off"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!isExisting ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive mt-6 size-11"
                      aria-label="Remove row"
                      onClick={() => remove(i)}
                      disabled={fields.length === 1}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
                <FormField
                  control={form.control}
                  name={`rows.${i}.type`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="h-11 w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {GREENHOUSE_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="min-h-11">
                              {GREENHOUSE_TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name={`rows.${i}.areaM2`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Area (m²)</FormLabel>
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
                  <FormField
                    control={form.control}
                    name={`rows.${i}.plantCapacity`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plant capacity</FormLabel>
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
              </div>
            );
          })}
          {rowsError ? (
            <p className="text-destructive text-sm">{rowsError}</p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => append(emptyRow())}
          >
            <Plus /> Add another greenhouse
          </Button>
          <Button
            type="submit"
            className="h-11 w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Saving…" : "Save & continue"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
