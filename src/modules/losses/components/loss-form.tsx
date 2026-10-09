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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/ids";
import { submitWithOfflineFallback } from "@/lib/offline/outbox";
import { useCachedRefs } from "@/lib/offline/ref-cache";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { logPlantLoss } from "../actions";
import {
  LOSS_CAUSES,
  LOSS_CAUSE_LABELS,
  plantLossCreateSchema,
  type PlantLossCreateInput,
} from "../schema";

const numberFmt = new Intl.NumberFormat("en-NG");

export function LossForm({
  cropCycleId,
  plantsAlive: serverPlantsAlive,
  today,
  minDate,
}: {
  cropCycleId: string;
  plantsAlive: number;
  /** yyyy-MM-dd Lagos date from the server. */
  today: string;
  /** Transplant date — losses cannot predate it. */
  minDate?: string | null;
}) {
  const router = useRouter();
  const plantsAlive = useCachedRefs(
    `loss-form-refs:${cropCycleId}`,
    serverPlantsAlive,
  );
  const form = useForm<PlantLossCreateInput>({
    resolver: zodResolver(plantLossCreateSchema),
    defaultValues: {
      clientId: newId(),
      cropCycleId,
      date: today,
      count: undefined,
      cause: undefined,
      notes: "",
    },
  });

  async function onSubmit(values: PlantLossCreateInput) {
    if (values.count > plantsAlive) {
      form.setError("count", {
        message: `Only ${numberFmt.format(plantsAlive)} plants are alive.`,
      });
      return;
    }
    const outcome = await submitWithOfflineFallback(
      logPlantLoss,
      "plantLoss.create",
      values.clientId,
      values,
    );
    if (outcome.kind === "queued") {
      toast.success("Saved on this phone — will sync");
      form.reset({ ...values, clientId: newId(), count: undefined, notes: "" });
      return;
    }
    const result = outcome.result;
    if (result.ok) {
      toast.success("Loss logged");
      router.push(`/cycles/${cropCycleId}`);
      router.refresh();
      return;
    }
    if (result.code === "BAD_COUNT") {
      form.setError("count", { message: result.error });
    }
    if (result.code === "BAD_DATE") {
      form.setError("date", { message: result.error });
    }
    // A replayed clientId means it already saved; fresh id for any retry.
    if (result.code !== "DUPLICATE") form.setValue("clientId", newId());
    applyActionError(form, result);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  type="date"
                  max={today}
                  min={minDate ?? undefined}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="count"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Plants lost</FormLabel>
              <FormControl>
                <NumberInput
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormDescription>
                {numberFmt.format(plantsAlive)} plants alive now.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cause"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cause</FormLabel>
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a cause" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {LOSS_CAUSES.map((c) => (
                    <SelectItem key={c} value={c} className="min-h-11">
                      {LOSS_CAUSE_LABELS[c]}
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
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note (optional)</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="e.g. bacterial wilt in row 4"
                  {...field}
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
          {form.formState.isSubmitting ? "Saving…" : "Log loss"}
        </Button>
      </form>
    </Form>
  );
}
