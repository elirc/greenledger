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
import { planCreateSchema, type PlanCreateInput } from "../schema";

/** Create / edit a plan. Price is typed in naira, stored as integer kobo. */
export function PlanForm({
  defaultValues,
  onSubmitAction,
  submitLabel,
}: {
  defaultValues?: Partial<PlanCreateInput>;
  onSubmitAction: (input: PlanCreateInput) => Promise<ActionResult<{ id: string }>>;
  submitLabel: string;
}) {
  const router = useRouter();
  const form = useForm<PlanCreateInput>({
    resolver: zodResolver(planCreateSchema),
    defaultValues: {
      code: "",
      name: "",
      maxGreenhouses: undefined,
      monthlyPriceNaira: "",
      paystackPlanCode: "",
      isActive: true,
      ...defaultValues,
    },
  });

  async function onSubmit(values: PlanCreateInput) {
    const result = await onSubmitAction(values);
    if (result.ok) {
      toast.success("Plan saved");
      router.push("/platform/plans");
      router.refresh();
      return;
    }
    applyActionError(form, result, "code");
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Code</FormLabel>
              <FormControl>
                <Input className="h-11" autoComplete="off" placeholder="growth" {...field} />
              </FormControl>
              <FormDescription>Stable identifier, e.g. starter, growth, estate.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input className="h-11" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="maxGreenhouses"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Greenhouse limit</FormLabel>
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
          name="monthlyPriceNaira"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Monthly price (₦)</FormLabel>
              <FormControl>
                <Input className="h-11" inputMode="decimal" placeholder="60000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="paystackPlanCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Paystack plan code</FormLabel>
              <FormControl>
                <Input className="h-11" autoComplete="off" placeholder="PLN_…" {...field} />
              </FormControl>
              <FormDescription>Optional until the live Paystack driver is enabled.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3">
              <FormLabel>Offered to farms</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
