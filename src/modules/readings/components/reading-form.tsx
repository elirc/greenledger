"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { newId } from "@/lib/ids";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { createReading } from "../actions";
import type { ReadingGreenhouse } from "../queries";
import {
  METRICS,
  METRIC_META,
  readingCreateSchema,
  type Metric,
  type ReadingCreateInput,
} from "../schema";

const PLACEHOLDERS: Record<Metric, string> = {
  temperatureC: "e.g. 29.5",
  humidityPct: "e.g. 72",
  ecMsCm: "e.g. 2.2",
  ph: "e.g. 6.0",
};

/**
 * Climate / EC / pH entry. Any subset of the four readings, at least one
 * (zod refine). Time defaults to now (Lagos, from the server).
 */
export function ReadingForm({
  greenhouses,
  initialGreenhouseId,
  nowLocal,
}: {
  greenhouses: ReadingGreenhouse[];
  initialGreenhouseId: string;
  /** Current Lagos wall time as a datetime-local value (from the server). */
  nowLocal: string;
}) {
  const router = useRouter();
  const form = useForm<ReadingCreateInput>({
    resolver: zodResolver(readingCreateSchema),
    defaultValues: {
      clientId: newId(),
      greenhouseId: initialGreenhouseId,
      recordedAt: nowLocal,
      temperatureC: undefined,
      humidityPct: undefined,
      ecMsCm: undefined,
      ph: undefined,
    },
  });

  async function onSubmit(values: ReadingCreateInput) {
    const result = await createReading(values);
    if (result.ok) {
      toast.success("Reading saved");
      router.push(`/readings?gh=${values.greenhouseId}`);
      router.refresh();
      return;
    }
    if (result.code === "BAD_DATE") {
      form.setError("recordedAt", { message: result.error });
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
          name="greenhouseId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Greenhouse</FormLabel>
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a greenhouse" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {greenhouses.map((g) => (
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
          name="recordedAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Recorded at</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  type="datetime-local"
                  max={nowLocal}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <p className="text-muted-foreground text-sm">
          Fill in what you measured — at least one.
        </p>
        <div className="grid grid-cols-2 gap-4">
          {METRICS.map((m) => (
            <FormField
              key={m}
              control={form.control}
              name={m}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {METRIC_META[m].label}
                    {METRIC_META[m].unit ? ` (${METRIC_META[m].unit})` : ""}
                  </FormLabel>
                  <FormControl>
                    <NumberInput
                      decimal
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={PLACEHOLDERS[m]}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving…" : "Save reading"}
        </Button>
      </form>
    </Form>
  );
}
