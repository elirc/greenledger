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
import { updateCycleTransplantDate } from "../actions";
import {
  cycleTransplantDateSchema,
  type CycleTransplantDateInput,
} from "../schema";

/** Edit transplant date → server recomputes expected harvest dates. */
export function TransplantDateForm({
  cycleId,
  transplantDate,
  today,
  onDone,
}: {
  cycleId: string;
  transplantDate: string;
  today: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const form = useForm<CycleTransplantDateInput>({
    resolver: zodResolver(cycleTransplantDateSchema),
    defaultValues: { id: cycleId, transplantDate },
  });

  async function onSubmit(values: CycleTransplantDateInput) {
    const result = await updateCycleTransplantDate(values);
    if (result.ok) {
      toast.success("Transplant date updated");
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
              <FormLabel>Transplant date</FormLabel>
              <FormControl>
                <Input className="h-11" type="date" max={today} {...field} />
              </FormControl>
              <FormDescription>
                Expected first harvest and end dates will be recalculated.
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
          {form.formState.isSubmitting ? "Saving…" : "Save date"}
        </Button>
      </form>
    </Form>
  );
}
