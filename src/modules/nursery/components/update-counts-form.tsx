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
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { updateNurseryCounts } from "../actions";
import { nurseryCountsSchema, type NurseryCountsInput } from "../schema";

/** Germinated / ready counters — they only ever go up. */
export function UpdateCountsForm({
  batch,
  onDone,
}: {
  batch: { id: string; seedsSown: number; germinated: number; ready: number };
  onDone: () => void;
}) {
  const router = useRouter();
  const form = useForm<NurseryCountsInput>({
    resolver: zodResolver(nurseryCountsSchema),
    defaultValues: {
      id: batch.id,
      germinated: batch.germinated,
      ready: batch.ready,
    },
  });

  async function onSubmit(values: NurseryCountsInput) {
    const result = await updateNurseryCounts(values);
    if (result.ok) {
      toast.success("Counts updated");
      onDone();
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
          name="germinated"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Germinated</FormLabel>
              <FormControl>
                <NumberInput
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  onChange={field.onChange}
                  min={batch.germinated}
                  max={batch.seedsSown}
                />
              </FormControl>
              <FormDescription>
                Total so far, out of {batch.seedsSown} sown. Can&apos;t go down.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="ready"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ready to transplant</FormLabel>
              <FormControl>
                <NumberInput
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  onChange={field.onChange}
                  min={batch.ready}
                />
              </FormControl>
              <FormDescription>
                Total so far. Can&apos;t be more than germinated.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving…" : "Save counts"}
        </Button>
      </form>
    </Form>
  );
}
