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
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/action";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { scheduleCreateSchema, type ScheduleCreateInput } from "../schema";

/** Create / edit a maintenance schedule (name, interval days, next due). */
export function ScheduleForm({
  equipmentId,
  defaultValues,
  onSubmitAction,
  submitLabel,
}: {
  equipmentId: string;
  defaultValues?: Partial<ScheduleCreateInput>;
  onSubmitAction: (
    input: ScheduleCreateInput,
  ) => Promise<ActionResult<{ id: string; equipmentId: string }>>;
  submitLabel: string;
}) {
  const router = useRouter();
  const form = useForm<ScheduleCreateInput>({
    resolver: zodResolver(scheduleCreateSchema),
    defaultValues: {
      equipmentId,
      name: "",
      intervalDays: undefined,
      nextDueDate: "",
      isActive: true,
      ...defaultValues,
    },
  });

  async function onSubmit(values: ScheduleCreateInput) {
    const result = await onSubmitAction(values);
    if (result.ok) {
      toast.success("Schedule saved");
      router.push(`/equipment/${equipmentId}`);
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>What needs doing</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  autoComplete="off"
                  placeholder="e.g. Service pump, change oil seals"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="intervalDays"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Every (days)</FormLabel>
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
        <FormField
          control={form.control}
          name="nextDueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Next due</FormLabel>
              <FormControl>
                <Input className="h-11" type="date" {...field} />
              </FormControl>
              <FormDescription>
                Logging work against this schedule moves it on automatically.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3">
              <FormLabel>Active (send reminders)</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
