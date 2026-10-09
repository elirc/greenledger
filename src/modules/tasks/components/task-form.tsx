"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action";
import { ROLE_LABELS } from "@/lib/permissions";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import type { TaskFormRefs } from "../queries";
import { taskCreateSchema, type TaskCreateInput } from "../schema";

const NONE = "__none";

/** Create/edit form (owner/manager). Same schema as the server action. */
export function TaskForm({
  refs,
  defaultValues,
  onSubmitAction,
  submitLabel,
}: {
  refs: TaskFormRefs;
  defaultValues?: Partial<TaskCreateInput>;
  onSubmitAction: (
    input: TaskCreateInput,
  ) => Promise<ActionResult<{ id: string }>>;
  submitLabel: string;
}) {
  const router = useRouter();
  const form = useForm<TaskCreateInput>({
    resolver: zodResolver(taskCreateSchema),
    defaultValues: {
      title: "",
      description: "",
      assignedTo: undefined,
      greenhouseId: undefined,
      cropCycleId: undefined,
      dueDate: "",
      ...defaultValues,
    },
  });

  const greenhouseId = useWatch({ control: form.control, name: "greenhouseId" });
  const cycles = refs.cycles.filter(
    (c) => !greenhouseId || c.greenhouseId === greenhouseId,
  );

  async function onSubmit(values: TaskCreateInput) {
    let result;
    try {
      result = await onSubmitAction(values);
    } catch {
      toast.error("Could not reach the server. Try again.");
      return;
    }
    if (result.ok) {
      toast.success("Task saved");
      router.push("/tasks");
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
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Task</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  autoComplete="off"
                  placeholder="e.g. Clean drip filters GH2"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Due date</FormLabel>
              <FormControl>
                <Input type="date" className="h-11" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="assignedTo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Assign to</FormLabel>
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}
              >
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NONE} className="min-h-11">
                    Unassigned
                  </SelectItem>
                  {refs.staff.map((s) => (
                    <SelectItem key={s.userId} value={s.userId} className="min-h-11">
                      {s.name}
                      {s.role ? ` · ${ROLE_LABELS[s.role]}` : ""}
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
          name="greenhouseId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Greenhouse (optional)</FormLabel>
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) => {
                  const next = v === NONE ? undefined : v;
                  field.onChange(next);
                  const cycleId = form.getValues("cropCycleId");
                  const cycle = refs.cycles.find((c) => c.id === cycleId);
                  if (cycle && next && cycle.greenhouseId !== next) {
                    form.setValue("cropCycleId", undefined);
                  }
                }}
              >
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NONE} className="min-h-11">
                    Whole farm
                  </SelectItem>
                  {refs.greenhouses.map((g) => (
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
          name="cropCycleId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Crop cycle (optional)</FormLabel>
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) => {
                  const next = v === NONE ? undefined : v;
                  field.onChange(next);
                  const cycle = refs.cycles.find((c) => c.id === next);
                  if (cycle) form.setValue("greenhouseId", cycle.greenhouseId);
                }}
              >
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NONE} className="min-h-11">
                    No cycle
                  </SelectItem>
                  {cycles.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="min-h-11">
                      {c.code}
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
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Details (optional)</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="h-12 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
