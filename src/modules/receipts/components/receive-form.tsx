"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { MoneyText } from "@/components/common/money-text";
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
import { Textarea } from "@/components/ui/textarea";
import { todayLagos } from "@/lib/dates";
import { nairaToKobo, rateTimesQty } from "@/lib/money";
import { UNIT_LABELS } from "@/lib/units";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import type { ItemOption } from "@/modules/items/queries";
import { EXPIRY_EXPECTED_CATEGORIES } from "@/modules/items/schema";
import { receiveStock } from "../actions";
import {
  isNairaText,
  receiveStockSchema,
  type ReceiptLineInput,
  type ReceiveStockInput,
} from "../schema";
import { ItemCombobox } from "./item-combobox";
import { NewSupplierDialog } from "./new-supplier-dialog";

const emptyLine = (): ReceiptLineInput => ({
  itemId: "",
  batchNumber: "",
  expiryDate: "",
  quantity: Number.NaN,
  unitCost: "",
});

/** Line cost in kobo, or null while the line is incomplete. */
function lineCost(line: Partial<ReceiptLineInput> | undefined): number | null {
  if (!line?.unitCost || !isNairaText(line.unitCost)) return null;
  const qty = line.quantity;
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) return null;
  return rateTimesQty(nairaToKobo(line.unitCost), qty);
}

/**
 * Receive stock: supplier + store + reference, then repeatable lines
 * (item, batch, expiry, quantity in base unit, cost per base unit in naira).
 */
export function ReceiveForm({
  suppliers: initialSuppliers,
  stores,
  items,
}: {
  suppliers: { id: string; name: string }[];
  stores: { id: string; name: string; isDefault: boolean }[];
  items: ItemOption[];
}) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const today = todayLagos();

  const form = useForm<ReceiveStockInput>({
    resolver: zodResolver(receiveStockSchema),
    defaultValues: {
      supplierId: "",
      storeId: (stores.find((s) => s.isDefault) ?? stores[0])?.id ?? "",
      reference: "",
      notes: "",
      lines: [emptyLine()],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const lines = useWatch({ control: form.control, name: "lines" });
  const costs = (lines ?? []).map((l) => lineCost(l));
  const total = costs.reduce<number>((a, c) => a + (c ?? 0), 0);

  async function onSubmit(values: ReceiveStockInput) {
    const result = await receiveStock(values);
    if (result.ok) {
      toast.success("Stock received");
      router.push(`/store/receive/${result.data.receiptId}`);
      router.refresh();
      return;
    }
    if (result.code === "BATCH_EXISTS") {
      // Point at the offending line when we can find it.
      const idx = values.lines.findIndex((l) =>
        result.error.includes(`Batch ${l.batchNumber} `),
      );
      if (idx >= 0) {
        form.setError(`lines.${idx}.batchNumber`, { message: result.error });
      }
    }
    applyActionError(form, result);
  }

  const linesError = form.formState.errors.lines?.root?.message ??
    form.formState.errors.lines?.message;

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="supplierId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Supplier</FormLabel>
                <div className="flex gap-2">
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="h-11 min-w-0 flex-1">
                        <SelectValue placeholder="Pick a supplier" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="min-h-11">
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0"
                    onClick={() => setSupplierDialogOpen(true)}
                  >
                    <Plus className="size-4" /> New
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="storeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Receiving store</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue placeholder="Pick a store" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {stores.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="min-h-11">
                          {s.name}
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
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference (optional)</FormLabel>
                  <FormControl>
                    <Input
                      className="h-11"
                      autoComplete="off"
                      placeholder="Supplier invoice / waybill no."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <section aria-label="Lines" className="space-y-3">
            <h2 className="text-base font-semibold">Lines</h2>
            {items.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border px-4 py-3 text-sm">
                No items yet.{" "}
                <Link href="/store/items/new" className="text-primary underline">
                  Add an item
                </Link>{" "}
                first (owner or farm manager).
              </p>
            ) : null}
            {fields.map((f, index) => {
              const line = lines?.[index];
              const item = line?.itemId ? itemById.get(line.itemId) : undefined;
              const unit = item ? UNIT_LABELS[item.baseUnit] : "unit";
              const missingExpiry =
                !!item &&
                EXPIRY_EXPECTED_CATEGORIES.includes(item.category) &&
                !line?.expiryDate;
              const alreadyExpired = !!line?.expiryDate && line.expiryDate < today;
              return (
                <fieldset
                  key={f.id}
                  aria-label={`Line ${index + 1}`}
                  className="space-y-3 rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Line {index + 1}</p>
                    {fields.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="size-11"
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                  <FormField
                    control={form.control}
                    name={`lines.${index}.itemId`}
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel>Item</FormLabel>
                        <FormControl>
                          <ItemCombobox
                            items={items}
                            value={field.value}
                            onChange={field.onChange}
                            invalid={!!fieldState.error}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name={`lines.${index}.batchNumber`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Batch no.</FormLabel>
                          <FormControl>
                            <Input
                              className="h-11"
                              autoComplete="off"
                              autoCapitalize="characters"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`lines.${index}.expiryDate`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expiry</FormLabel>
                          <FormControl>
                            <Input className="h-11" type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {missingExpiry ? (
                    <p className="text-status-warning flex items-start gap-1.5 text-sm">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      Agrochemicals and fertilisers usually have an expiry date
                      — add it so expiry alerts and FEFO issuing work.
                    </p>
                  ) : null}
                  {alreadyExpired ? (
                    <p className="text-status-danger flex items-start gap-1.5 text-sm">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      This expiry date is in the past — the batch will be
                      blocked from normal issue.
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name={`lines.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity ({unit})</FormLabel>
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`lines.${index}.unitCost`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cost per {unit} (₦)</FormLabel>
                          <FormControl>
                            <Input
                              className="h-11"
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder="0.00"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <p className="text-muted-foreground flex justify-between text-sm">
                    <span>Line total</span>
                    <MoneyText kobo={costs[index]} className="text-foreground" />
                  </p>
                </fieldset>
              );
            })}
            {linesError ? (
              <p className="text-destructive text-sm">{linesError}</p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => append(emptyLine())}
              disabled={fields.length >= 100}
            >
              <Plus className="size-4" /> Add line
            </Button>
          </section>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (optional)</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} />
                </FormControl>
                <FormDescription>
                  Condition on arrival, driver, anything worth remembering.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="bg-muted/50 flex items-center justify-between rounded-lg px-4 py-3">
            <span className="text-sm font-medium">Receipt total</span>
            <MoneyText kobo={total} className="text-lg font-semibold" />
          </div>
          <Button
            type="submit"
            className="h-12 w-full text-base"
            disabled={form.formState.isSubmitting || items.length === 0}
          >
            {form.formState.isSubmitting ? "Receiving…" : "Receive stock"}
          </Button>
        </form>
      </Form>
      <NewSupplierDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        onCreated={(s) => {
          setSuppliers((prev) =>
            [...prev, s].sort((a, b) => a.name.localeCompare(b.name)),
          );
          form.setValue("supplierId", s.id, { shouldValidate: true });
        }}
      />
    </>
  );
}
