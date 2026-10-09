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
import { formatLagosDate } from "@/lib/dates";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { logMaintenanceWork } from "../actions";
import { logWorkSchema, type LogWorkInput } from "../schema";

const NONE = "__none";

/**
 * "Log work": done date, description, cost, optional schedule. Picking a
 * schedule moves its next due date on (server, same transaction).
 */
export function LogWorkForm({
  equipmentId,
  schedules,
  today,
  initialScheduleId,
  canSeeMoney,
}: {
  equipmentId: string;
  schedules: { id: string; name: string; intervalDays: number }[];
  /** yyyy-MM-dd Lagos date from the server. */
  today: string;
  initialScheduleId?: string;
  canSeeMoney: boolean;
}) {
  const router = useRouter();
  const form = useForm<LogWorkInput>({
    resolver: zodResolver(logWorkSchema),
    defaultValues: {
      equipmentId,
      scheduleId: schedules.some((s) => s.id === initialScheduleId)
        ? initialScheduleId
        : "",
      doneDate: today,
      description: "",
      cost: "",
      notes: "",
    },
  });

  async function onSubmit(values: LogWorkInput) {
    const result = await logMaintenanceWork(values);
    if (result.ok) {
      toast.success(
        result.data.nextDueDate
          ? `Work logged — next due ${formatLagosDate(`${result.data.nextDueDate}T12:00:00Z`)}`
          : "Work logged",
      );
      router.push(`/equipment/${equipmentId}`);
      router.refresh();
      return;
    }
    if (result.code === "BAD_DATE") {
      form.setError("doneDate", { message: result.error });
    }
    applyActionError(form, result);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {schedules.length > 0 ? (
          <FormField
            control={form.control}
            name="scheduleId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Schedule (optional)</FormLabel>
                <Select
                  value={field.value ? field.value : NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                >
                  <FormControl>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE} className="min-h-11">
                      Unscheduled work / repair
                    </SelectItem>
                    {schedules.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="min-h-11">
                        {s.name} (every {s.intervalDays} d)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        <FormField
          control={form.control}
          name="doneDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date done</FormLabel>
              <FormControl>
                <Input className="h-11" type="date" max={today} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Work done</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="e.g. Replaced impeller and mechanical seal"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {canSeeMoney ? (
          <FormField
            control={form.control}
            name="cost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cost (₦, optional)</FormLabel>
                <FormControl>
                  <Input
                    className="h-11"
                    inputMode="decimal"
                    placeholder="e.g. 25,000"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>Parts and labour, if any.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} />
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
          {form.formState.isSubmitting ? "Saving…" : "Log work"}
        </Button>
      </form>
    </Form>
  );
}
