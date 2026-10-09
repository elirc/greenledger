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
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { planCycle, updatePlannedCycle } from "../actions";
import type { CyclePlanRefs } from "../queries";
import { cyclePlanSchema, type CyclePlanInput } from "../schema";

/** Plan a cycle (status planned) or edit a planned one. Owner/manager. */
export function CyclePlanForm({
  refs,
  cycleId,
  defaultValues,
  today,
}: {
  refs: CyclePlanRefs;
  /** Present → edit mode. */
  cycleId?: string;
  defaultValues?: CyclePlanInput;
  /** yyyy-MM-dd Lagos date from the server. */
  today: string;
}) {
  const router = useRouter();
  const form = useForm<CyclePlanInput>({
    resolver: zodResolver(cyclePlanSchema),
    defaultValues: defaultValues ?? {
      greenhouseId: refs.greenhouses.length === 1 ? refs.greenhouses[0].id : "",
      varietyId: "",
      sowDate: today,
      notes: "",
    },
  });

  async function onSubmit(values: CyclePlanInput) {
    const result = cycleId
      ? await updatePlannedCycle({ ...values, id: cycleId })
      : await planCycle(values);
    if (result.ok) {
      toast.success(cycleId ? "Plan updated" : "Cycle planned");
      router.push(`/cycles/${result.data.id}`);
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
          name="greenhouseId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Greenhouse</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a greenhouse" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
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
          name="varietyId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Variety</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a variety" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {refs.varieties.map((v) => (
                    <SelectItem key={v.id} value={v.id} className="min-h-11">
                      {v.cropName} · {v.name}
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
          name="sowDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Intended sow date</FormLabel>
              <FormControl>
                <Input className="h-11" type="date" {...field} />
              </FormControl>
              <FormDescription>
                Expected harvest dates are set when the crop is planted out.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
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
          {form.formState.isSubmitting
            ? "Saving…"
            : cycleId
              ? "Save changes"
              : "Plan cycle"}
        </Button>
      </form>
    </Form>
  );
}
