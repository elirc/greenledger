"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
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
import type { ActionResult } from "@/lib/action";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import type { ExpenseFormRefs } from "../queries";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  expenseCreateSchema,
  type ExpenseCreateInput,
} from "../schema";

const NONE = "__none";

/**
 * Expense entry: category, amount (₦), date, optional site / greenhouse /
 * crop-cycle attribution. Picking a cycle fills its greenhouse; picking a
 * greenhouse narrows the cycle list (the server re-checks consistency).
 */
export function ExpenseForm({
  refs,
  today,
  defaultValues,
  onSubmitAction,
  submitLabel,
}: {
  refs: ExpenseFormRefs;
  /** yyyy-MM-dd Lagos date from the server. */
  today: string;
  defaultValues?: Partial<ExpenseCreateInput>;
  onSubmitAction: (
    input: ExpenseCreateInput,
  ) => Promise<ActionResult<{ id: string; month: string }>>;
  submitLabel: string;
}) {
  const router = useRouter();
  const form = useForm<ExpenseCreateInput>({
    resolver: zodResolver(expenseCreateSchema),
    defaultValues: {
      category: undefined,
      amount: "",
      incurredDate: today,
      siteId: "",
      greenhouseId: "",
      cropCycleId: "",
      description: "",
      ...defaultValues,
    },
  });
  const [siteId, greenhouseId] = useWatch({
    control: form.control,
    name: ["siteId", "greenhouseId"],
  });
  const ghOptions = refs.greenhouses.filter((g) => !siteId || g.siteId === siteId);
  const cycleOptions = refs.cycles.filter(
    (c) => !greenhouseId || c.greenhouseId === greenhouseId,
  );

  async function onSubmit(values: ExpenseCreateInput) {
    const result = await onSubmitAction(values);
    if (result.ok) {
      toast.success("Expense saved");
      router.push(`/expenses?month=${result.data.month}`);
      router.refresh();
      return;
    }
    if (result.code === "BAD_DATE") {
      form.setError("incurredDate", { message: result.error });
    }
    if (result.code === "INVALID_MONEY") {
      form.setError("amount", { message: result.error });
    }
    applyActionError(form, result);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="min-h-11">
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount (₦)</FormLabel>
                <FormControl>
                  <Input
                    className="h-11"
                    inputMode="decimal"
                    placeholder="e.g. 45,000"
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="incurredDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input className="h-11" type="date" max={today} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <fieldset className="space-y-4 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">
            Charge to (optional)
          </legend>
          <p className="text-muted-foreground text-sm">
            Charge to a crop cycle to include it in that cycle&apos;s
            profitability. Leave blank for farm-wide costs.
          </p>
          <FormField
            control={form.control}
            name="siteId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Site</FormLabel>
                <Select
                  value={field.value ? field.value : NONE}
                  onValueChange={(v) => {
                    const next = v === NONE ? "" : v;
                    field.onChange(next);
                    const gh = refs.greenhouses.find(
                      (g) => g.id === form.getValues("greenhouseId"),
                    );
                    if (gh && next && gh.siteId !== next) {
                      form.setValue("greenhouseId", "");
                      form.setValue("cropCycleId", "");
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
                    {refs.sites.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="min-h-11">
                        {s.name}
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
                <FormLabel>Greenhouse</FormLabel>
                <Select
                  value={field.value ? field.value : NONE}
                  onValueChange={(v) => {
                    const next = v === NONE ? "" : v;
                    field.onChange(next);
                    const cycle = refs.cycles.find(
                      (c) => c.id === form.getValues("cropCycleId"),
                    );
                    if (cycle && next && cycle.greenhouseId !== next) {
                      form.setValue("cropCycleId", "");
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
                      No greenhouse
                    </SelectItem>
                    {ghOptions.map((g) => (
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
                <FormLabel>Crop cycle</FormLabel>
                <Select
                  value={field.value ? field.value : NONE}
                  onValueChange={(v) => {
                    const next = v === NONE ? "" : v;
                    field.onChange(next);
                    const cycle = refs.cycles.find((c) => c.id === next);
                    if (cycle) {
                      form.setValue("greenhouseId", cycle.greenhouseId);
                      const gh = refs.greenhouses.find(
                        (g) => g.id === cycle.greenhouseId,
                      );
                      if (gh) form.setValue("siteId", gh.siteId);
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
                      Not charged to a cycle
                    </SelectItem>
                    {cycleOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="min-h-11">
                        {c.code}
                        {c.closed ? " (closed)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Counts in the cycle&apos;s profitability report.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  placeholder="e.g. Casual labour — week 41"
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
          {form.formState.isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
