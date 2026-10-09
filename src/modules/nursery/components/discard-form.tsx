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
import { Textarea } from "@/components/ui/textarea";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { discardNurserySeedlings } from "../actions";
import { nurseryDiscardSchema, type NurseryDiscardInput } from "../schema";

/** Discard seedlings (count + reason) — increments the discarded counter. */
export function DiscardForm({
  batchId,
  available,
  onDone,
}: {
  batchId: string;
  available: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const form = useForm<NurseryDiscardInput>({
    resolver: zodResolver(nurseryDiscardSchema),
    defaultValues: { id: batchId, count: Number.NaN, reason: "" },
  });

  async function onSubmit(values: NurseryDiscardInput) {
    if (values.count > available) {
      form.setError("count", {
        message: `Only ${available} seedlings are left in this batch.`,
      });
      return;
    }
    const result = await discardNurserySeedlings(values);
    if (result.ok) {
      toast.success(`${values.count} discarded`);
      onDone();
      router.refresh();
      return;
    }
    if (result.code === "BAD_COUNT") {
      form.setError("count", { message: result.error });
    }
    applyActionError(form, result);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="count"
          render={({ field }) => (
            <FormItem>
              <FormLabel>How many</FormLabel>
              <FormControl>
                <NumberInput
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  onChange={field.onChange}
                  min={1}
                  max={available}
                />
              </FormControl>
              <FormDescription>{available} still in trays.</FormDescription>
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
                  rows={3}
                  placeholder="e.g. damping off, weak seedlings, pest damage"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          variant="destructive"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving…" : "Discard seedlings"}
        </Button>
      </form>
    </Form>
  );
}
