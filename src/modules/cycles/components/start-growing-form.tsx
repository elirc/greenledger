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
import { Input } from "@/components/ui/input";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { startCycleGrowing } from "../actions";
import {
  cycleStartGrowingSchema,
  type CycleStartGrowingInput,
} from "../schema";

/** Direct-seeded / outside-nursery start: planned|nursery → growing. */
export function StartGrowingForm({
  cycleId,
  today,
  onDone,
}: {
  cycleId: string;
  today: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const form = useForm<CycleStartGrowingInput>({
    resolver: zodResolver(cycleStartGrowingSchema),
    defaultValues: { id: cycleId, transplantDate: today, plantCount: undefined },
  });

  async function onSubmit(values: CycleStartGrowingInput) {
    const result = await startCycleGrowing(values);
    if (result.ok) {
      toast.success("Cycle is now growing");
      onDone?.();
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
          name="transplantDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Planted out on</FormLabel>
              <FormControl>
                <Input className="h-11" type="date" max={today} {...field} />
              </FormControl>
              <FormDescription>
                Expected first harvest and end dates are calculated from this.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="plantCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Plants in the ground</FormLabel>
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
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving…" : "Mark as growing"}
        </Button>
      </form>
    </Form>
  );
}
