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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatLagosDate } from "@/lib/dates";
import { formatQty, UNIT_LABELS } from "@/lib/units";
import { NumberInput } from "@/modules/farm/components/number-input";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { returnStock } from "../actions";
import type { StockFormRefs } from "../queries";
import { returnStockSchema, type ReturnStockInput } from "../schema";
import { ItemCombobox, type ItemOption } from "./item-combobox";
import { itemOnHandIn, itemOnHandTotal } from "./ref-utils";

const NONE = "__none";

export function ReturnForm({ refs }: { refs: StockFormRefs }) {
  const router = useRouter();
  const defaultStoreId =
    refs.stores.find((s) => s.isDefault)?.id ?? refs.stores[0]?.id ?? "";

  const form = useForm<ReturnStockInput>({
    resolver: zodResolver(returnStockSchema),
    defaultValues: {
      storeId: defaultStoreId,
      greenhouseId: "",
      cropCycleId: undefined,
      itemId: "",
      batchId: "",
      quantity: undefined,
      reason: "",
    },
  });

  const [storeId, itemId, greenhouseId] = useWatch({
    control: form.control,
    name: ["storeId", "itemId", "greenhouseId"],
  });
  const item = refs.items.find((i) => i.id === itemId);
  const storeName = refs.stores.find((s) => s.id === storeId)?.name;

  const itemOptions: ItemOption[] = useMemo(
    () =>
      refs.items.map((i) => ({
        ...i,
        onHandInStore: storeId ? itemOnHandIn(refs.batches, i.id, storeId) : null,
        onHandTotal: itemOnHandTotal(refs.batches, i.id),
      })),
    [refs.items, refs.batches, storeId],
  );
  // Any batch of the item may come back (it may be fully issued out).
  const itemBatches = itemId
    ? refs.batches.filter((b) => b.itemId === itemId)
    : [];
  const cycles = refs.cycles.filter(
    (c) => !greenhouseId || c.greenhouseId === greenhouseId,
  );

  async function onSubmit(values: ReturnStockInput) {
    const result = await returnStock(values);
    if (result.ok) {
      toast.success(
        `Returned ${item ? formatQty(values.quantity, item.baseUnit) : values.quantity} to ${storeName ?? "store"}`,
      );
      form.reset({
        storeId: values.storeId,
        greenhouseId: values.greenhouseId,
        cropCycleId: values.cropCycleId,
        itemId: "",
        batchId: "",
        quantity: undefined,
        reason: "",
      });
      router.refresh();
      return;
    }
    applyActionError(form, result);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="greenhouseId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>From greenhouse</FormLabel>
              <Select
                value={field.value || undefined}
                onValueChange={(v) => {
                  field.onChange(v);
                  form.setValue("cropCycleId", undefined);
                }}
              >
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a greenhouse" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {refs.greenhouses.map((g) => (
                    <SelectItem key={g.id} value={g.id} className="min-h-11">
                      {g.name}
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
          name="cropCycleId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Crop cycle (optional)</FormLabel>
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}
                disabled={!greenhouseId}
              >
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NONE} className="min-h-11">
                    No crop cycle
                  </SelectItem>
                  {cycles.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="min-h-11">
                      {c.code}
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
          name="storeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Back into store</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
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
                  storeName={storeName}
                  onChange={(id) => {
                    field.onChange(id);
                    form.setValue("batchId", "");
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
                value={field.value || undefined}
                onValueChange={field.onChange}
                disabled={!itemId}
              >
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue
                      placeholder={
                        itemId && itemBatches.length === 0
                          ? "This item has no batches"
                          : "Pick the batch on the label"
                      }
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {itemBatches.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="min-h-11">
                      {b.batchNumber} ·{" "}
                      {b.expiryDate ? `exp ${formatLagosDate(b.expiryDate)}` : "no expiry"}
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
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Quantity returned{item ? ` (${UNIT_LABELS[item.baseUnit]})` : ""}
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
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reason</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  placeholder="e.g. Spray cancelled — rain"
                  {...field}
                />
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
          {form.formState.isSubmitting ? "Saving…" : "Return to store"}
        </Button>
      </form>
    </Form>
  );
}
