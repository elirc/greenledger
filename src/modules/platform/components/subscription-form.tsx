"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { extendTrial, updateSubscription } from "../actions";
import {
  SUBSCRIPTION_STATUSES,
  subscriptionEditSchema,
  type SubscriptionEditInput,
} from "../schema";

const STATUS_LABELS: Record<(typeof SUBSCRIPTION_STATUSES)[number], string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due (read-only)",
  cancelled: "Cancelled (read-only)",
};

/** Platform override of an organisation's subscription — audited with a reason. */
export function SubscriptionForm({
  defaultValues,
  plans,
}: {
  defaultValues: SubscriptionEditInput;
  plans: { id: string; name: string; isActive: boolean }[];
}) {
  const router = useRouter();
  const form = useForm<SubscriptionEditInput>({
    resolver: zodResolver(subscriptionEditSchema),
    defaultValues,
  });

  async function onSubmit(values: SubscriptionEditInput) {
    const result = await updateSubscription(values);
    if (result.ok) {
      toast.success("Subscription updated");
      form.reset({ ...values, reason: "" });
      router.refresh();
      return;
    }
    applyActionError(form, result);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="planId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Plan</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue placeholder="Choose a plan" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="min-h-11">
                        {p.name}
                        {p.isActive ? "" : " (inactive)"}
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
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SUBSCRIPTION_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="min-h-11">
                        {STATUS_LABELS[s]}
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
            name="trialEndsOn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trial ends</FormLabel>
                <FormControl>
                  <Input className="h-11" type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="periodEndsOn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Paid period ends</FormLabel>
                <FormControl>
                  <Input className="h-11" type="date" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reason (audit log)</FormLabel>
              <FormControl>
                <Textarea rows={2} placeholder="e.g. Paid by bank transfer, ref 12345" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : "Save subscription"}
        </Button>
      </form>
    </Form>
  );
}

/** One-tap trial extensions (+7 / +14 / +30 days). */
export function ExtendTrialButtons({ orgId, disabled }: { orgId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);

  async function extend(days: number) {
    setPending(days);
    try {
      const result = await extendTrial({ orgId, days });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Trial extended by ${days} days`);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {[7, 14, 30].map((d) => (
        <Button
          key={d}
          variant="outline"
          className="h-11"
          disabled={disabled || pending !== null}
          onClick={() => void extend(d)}
        >
          {pending === d ? "Extending…" : `+${d} days`}
        </Button>
      ))}
    </div>
  );
}
