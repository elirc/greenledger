"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
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
import type { ActionResult } from "@/lib/action";
import { UNIT_LABELS } from "@/lib/units";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import {
  BASE_UNITS,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS,
  itemCreateSchema,
  type ItemCategory,
  type ItemCreateInput,
} from "../schema";

const UNIT_HINTS: Record<(typeof BASE_UNITS)[number], string> = {
  kg: "kilograms",
  g: "grams",
  l: "litres",
  ml: "millilitres",
  pcs: "pieces",
};

/**
 * Item create/edit form. Category drives which extra fields show; hidden
 * fields are cleared so the shared zod rules (forbidden outside their
 * category) never trip on stale values.
 */
export function ItemForm({
  defaultValues,
  onSubmitAction,
  submitLabel,
  unitLocked = false,
}: {
  defaultValues?: Partial<ItemCreateInput>;
  onSubmitAction: (
    input: ItemCreateInput,
  ) => Promise<ActionResult<{ id: string }>>;
  submitLabel: string;
  /** Base unit cannot change once batches exist. */
  unitLocked?: boolean;
}) {
  const router = useRouter();
  const form = useForm<ItemCreateInput>({
    resolver: zodResolver(itemCreateSchema),
    defaultValues: {
      name: "",
      category: "consumable",
      baseUnit: "kg",
      reorderLevel: 0,
      activeIngredient: "",
      notes: "",
      isActive: true,
      ...defaultValues,
    },
  });

  const category = useWatch({ control: form.control, name: "category" });
  const baseUnit = useWatch({ control: form.control, name: "baseUnit" });
  const isChem = category === "agrochemical";
  const isFert = category === "fertiliser";

  function onCategoryChange(next: ItemCategory) {
    form.setValue("category", next, { shouldDirty: true });
    if (next !== "agrochemical") {
      form.setValue("activeIngredient", "");
      form.setValue("phiDays", undefined);
      form.setValue("reiHours", undefined);
      form.clearErrors(["activeIngredient", "phiDays", "reiHours"]);
    }
    if (next !== "fertiliser") {
      form.setValue("nPct", undefined);
      form.setValue("pPct", undefined);
      form.setValue("kPct", undefined);
      form.clearErrors(["nPct", "pPct", "kPct"]);
    }
  }

  async function onSubmit(values: ItemCreateInput) {
    const result = await onSubmitAction(values);
    if (result.ok) {
      toast.success("Item saved");
      router.push(`/store/items/${result.data.id}`);
      router.refresh();
      return;
    }
    if (result.code === "UNIT_LOCKED") {
      form.setError("baseUnit", { message: result.error });
    }
    applyActionError(form, result, "name");
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  autoComplete="off"
                  placeholder="e.g. Calcium nitrate"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(v) => onCategoryChange(v as ItemCategory)}
                >
                  <FormControl>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ITEM_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="min-h-11">
                        {ITEM_CATEGORY_LABELS[c]}
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
            name="baseUnit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Base unit</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={unitLocked}
                >
                  <FormControl>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {BASE_UNITS.map((u) => (
                      <SelectItem key={u} value={u} className="min-h-11">
                        {UNIT_LABELS[u]} ({UNIT_HINTS[u]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {unitLocked
                    ? "Locked: this item already has stock batches."
                    : "Stock is counted and costed in this unit."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="reorderLevel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reorder level ({UNIT_LABELS[baseUnit]})</FormLabel>
              <FormControl>
                <NumberInput
                  decimal
                  min={0}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormDescription>
                Flag the item when total stock falls below this. 0 = never.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {isChem ? (
          <fieldset className="space-y-4 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">
              Agrochemical label details
            </legend>
            <FormField
              control={form.control}
              name="activeIngredient"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Active ingredient</FormLabel>
                  <FormControl>
                    <Input
                      className="h-11"
                      autoComplete="off"
                      placeholder="e.g. Abamectin 18 g/L"
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
                name="phiDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PHI (days)</FormLabel>
                    <FormControl>
                      <NumberInput
                        min={0}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reiHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>REI (hours)</FormLabel>
                    <FormControl>
                      <NumberInput
                        min={0}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              PHI = days from spraying until harvest is safe. REI = hours until
              workers may re-enter the greenhouse. Copy them from the product
              label.
            </p>
          </fieldset>
        ) : null}

        {isFert ? (
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">
              Nutrient analysis (optional)
            </legend>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["nPct", "N %"],
                  ["pPct", "P %"],
                  ["kPct", "K %"],
                ] as const
              ).map(([name, label]) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <NumberInput
                          decimal
                          min={0}
                          max={100}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </fieldset>
        ) : null}

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
                    Inactive items are hidden from receive and issue pickers.
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
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
