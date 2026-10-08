"use client";

import { useMemo } from "react";
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
import { formatLagosDate } from "@/lib/dates";
import { formatQty, UNIT_LABELS } from "@/lib/units";
import { NumberInput } from "@/modules/farm/components/number-input";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { transferStock } from "../actions";
import type { StockFormRefs } from "../queries";
import { transferStockSchema, type TransferStockInput } from "../schema";
import { ItemCombobox, type ItemOption } from "./item-combobox";
import {
  batchOnHandIn,
  batchesInStore,
  fefoPreview,
  isBatchExpired,
  itemOnHandIn,
  itemOnHandTotal,
} from "./ref-utils";

const FEFO = "__fefo";

export function TransferForm({ refs }: { refs: StockFormRefs }) {
  const router = useRouter();
  const defaultStoreId =
    refs.stores.find((s) => s.isDefault)?.id ?? refs.stores[0]?.id ?? "";
  const otherStoreId = refs.stores.find((s) => s.id !== defaultStoreId)?.id ?? "";

  const form = useForm<TransferStockInput>({
    resolver: zodResolver(transferStockSchema),
    defaultValues: {
      fromStoreId: defaultStoreId,
      toStoreId: otherStoreId,
      itemId: "",
      batchId: undefined,
      quantity: undefined,
      reason: "",
    },
  });

  const [fromStoreId, itemId, batchId, quantity] = useWatch({
    control: form.control,
    name: ["fromStoreId", "itemId", "batchId", "quantity"],
  });
  const item = refs.items.find((i) => i.id === itemId);
  const fromName = refs.stores.find((s) => s.id === fromStoreId)?.name;

  const itemOptions: ItemOption[] = useMemo(
    () =>
      refs.items.map((i) => ({
        ...i,
        onHandInStore: fromStoreId
          ? itemOnHandIn(refs.batches, i.id, fromStoreId)
          : null,
        onHandTotal: itemOnHandTotal(refs.batches, i.id),
      })),
    [refs.items, refs.batches, fromStoreId],
  );

  const storeBatches =
    itemId && fromStoreId ? batchesInStore(refs.batches, itemId, fromStoreId) : [];
  // Transfers move ONE batch: FEFO default = first non-expired batch.
  const fefoFirst =
    !batchId && itemId && fromStoreId
      ? fefoPreview(refs.batches, itemId, fromStoreId, Number.MAX_SAFE_INTEGER)
          .allocations[0]?.batch
      : undefined;
  const activeBatch = batchId
    ? storeBatches.find((b) => b.id === batchId)
    : fefoFirst;
  const activeOnHand = activeBatch ? batchOnHandIn(activeBatch, fromStoreId) : 0;

  async function onSubmit(values: TransferStockInput) {
    const result = await transferStock(values);
    if (result.ok) {
      const b = refs.batches.find((x) => x.id === result.data.batchId);
      toast.success(
        `Moved ${item ? formatQty(values.quantity, item.baseUnit) : values.quantity}${b ? ` of ${b.batchNumber}` : ""}`,
      );
      form.reset({
        fromStoreId: values.fromStoreId,
        toStoreId: values.toStoreId,
        itemId: "",
        batchId: undefined,
        quantity: undefined,
        reason: "",
      });
      router.refresh();
      return;
    }
    if (result.code === "INSUFFICIENT_STOCK" || result.code === "NO_STOCK") {
      form.setError("quantity", { message: result.error });
    }
    if (result.code === "SAME_STORE") {
      form.setError("toStoreId", { message: result.error });
    }
    applyActionError(form, result);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(["fromStoreId", "toStoreId"] as const).map((name) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{name === "fromStoreId" ? "From store" : "To store"}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      if (name === "fromStoreId") form.setValue("batchId", undefined);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue placeholder="Pick a store" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {refs.stores.map((s) => (
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
          ))}
        </div>

        <FormField
          control={form.control}
          name="itemId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Item</FormLabel>
              <FormControl>
                <ItemCombobox
                  options={itemOptions}
                  value={field.value || undefined}
                  storeName={fromName}
                  onChange={(id) => {
                    field.onChange(id);
                    form.setValue("batchId", undefined);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="batchId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Batch</FormLabel>
              <Select
                value={field.value ?? FEFO}
                onValueChange={(v) => field.onChange(v === FEFO ? undefined : v)}
                disabled={!itemId}
              >
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={FEFO} className="min-h-11">
                    Earliest expiry (automatic)
                  </SelectItem>
                  {storeBatches.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="min-h-11">
                      {b.batchNumber} ·{" "}
                      {b.expiryDate ? `exp ${formatLagosDate(b.expiryDate)}` : "no expiry"}
                      {item ? ` · ${formatQty(batchOnHandIn(b, fromStoreId), item.baseUnit)}` : ""}
                      {isBatchExpired(b) ? " · EXPIRED" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {itemId ? (
                <FormDescription>
                  {activeBatch && item
                    ? `${batchId ? "Moving" : "Will move"} batch ${activeBatch.batchNumber} — ${formatQty(activeOnHand, item.baseUnit)} available in ${fromName ?? "source"}.`
                    : "No usable stock of this item in the source store."}
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Quantity{item ? ` (${UNIT_LABELS[item.baseUnit]})` : ""}
              </FormLabel>
              <FormControl>
                <NumberInput
                  decimal
                  className="h-12 text-lg"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              {activeBatch && quantity && quantity > activeOnHand ? (
                <p className="text-destructive text-sm">
                  More than this batch holds in {fromName}.
                </p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note (optional)</FormLabel>
              <FormControl>
                <Input className="h-11" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="h-12 w-full text-base"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Moving…" : "Transfer stock"}
        </Button>
      </form>
    </Form>
  );
}
