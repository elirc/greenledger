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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { transferProduce } from "../actions";
import type { ProduceLotRow, ProduceStoreOption } from "../queries";
import { produceTransferSchema, type ProduceTransferInput } from "../schema";

const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 });

/** Move kg of one lot out of the row's store into another produce store. */
export function ProduceTransferForm({
  row,
  stores,
  onDone,
}: {
  row: ProduceLotRow;
  stores: ProduceStoreOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const targets = stores.filter((s) => s.id !== row.storeId);
  const form = useForm<ProduceTransferInput>({
    resolver: zodResolver(produceTransferSchema),
    defaultValues: {
      lotId: row.lotId,
      fromStoreId: row.storeId,
      toStoreId: targets[0]?.id ?? "",
      kg: row.onHandKg,
    },
  });
  const kg = useWatch({ control: form.control, name: "kg" });

  async function onSubmit(values: ProduceTransferInput) {
    const result = await transferProduce(values);
    if (result.ok) {
      const to = stores.find((s) => s.id === values.toStoreId)?.name ?? "the other store";
      toast.success(`Moved ${kgFmt.format(values.kg)} kg to ${to}`);
      onDone();
      router.refresh();
      return;
    }
    if (result.code === "INSUFFICIENT_STOCK") {
      form.setError("kg", { message: result.error });
    }
    if (result.code === "SAME_STORE") {
      form.setError("toStoreId", { message: result.error });
    }
    applyActionError(form, result);
  }

  if (targets.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        There is no other packhouse or cold room to move this produce to.
      </p>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-sm">
          From <span className="font-medium">{row.storeName}</span>
        </p>
        <FormField
          control={form.control}
          name="toStoreId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>To store</FormLabel>
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a store" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {targets.map((s) => (
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
          name="kg"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Weight (kg)</FormLabel>
              <FormControl>
                <NumberInput
                  decimal
                  className="h-12 text-lg"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormDescription>
                {kgFmt.format(row.onHandKg)} kg of this lot in {row.storeName}.
              </FormDescription>
              {kg && kg > row.onHandKg ? (
                <p className="text-destructive text-sm">More than this lot holds here.</p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="h-12 w-full text-base"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Moving…" : "Move produce"}
        </Button>
      </form>
    </Form>
  );
}
