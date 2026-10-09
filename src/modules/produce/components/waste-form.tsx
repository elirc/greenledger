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
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/ids";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { recordProduceWaste } from "../actions";
import type { ProduceLotRow } from "../queries";
import {
  produceWasteSchema,
  WASTE_REASONS,
  WASTE_REASON_LABELS,
  type ProduceWasteInput,
} from "../schema";

const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 });

/** Write off kg of one lot in one store: kg + reason (+ note). */
export function WasteForm({
  row,
  onDone,
}: {
  row: ProduceLotRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const form = useForm<ProduceWasteInput>({
    resolver: zodResolver(produceWasteSchema),
    defaultValues: {
      clientId: newId(),
      lotId: row.lotId,
      storeId: row.storeId,
      kg: undefined,
      reason: undefined,
      note: "",
    },
  });
  const [kg, reason] = useWatch({ control: form.control, name: ["kg", "reason"] });

  async function onSubmit(values: ProduceWasteInput) {
    const result = await recordProduceWaste(values);
    if (result.ok) {
      if (result.data.duplicate) toast.info("This waste entry was already saved.");
      else toast.success(`Wrote off ${kgFmt.format(values.kg)} kg`);
      onDone();
      router.refresh();
      return;
    }
    form.setValue("clientId", newId());
    if (result.code === "INSUFFICIENT_STOCK") {
      form.setError("kg", { message: result.error });
    }
    if (result.code === "REASON_REQUIRED") {
      form.setError("reason", { message: result.error });
    }
    applyActionError(form, result);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  placeholder="kg"
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
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reason</FormLabel>
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a reason" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {WASTE_REASONS.map((r) => (
                    <SelectItem key={r} value={r} className="min-h-11">
                      {WASTE_REASON_LABELS[r]}
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
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{reason === "other" ? "What happened" : "Note (optional)"}</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          variant="destructive"
          className="h-12 w-full text-base"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving…" : "Write off"}
        </Button>
      </form>
    </Form>
  );
}
