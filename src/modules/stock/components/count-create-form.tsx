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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { createStockCount } from "../actions";
import {
  createStockCountSchema,
  type CreateStockCountInput,
} from "../schema";

export function CountCreateForm({
  stores,
}: {
  stores: { id: string; name: string; isDefault: boolean }[];
}) {
  const router = useRouter();
  const form = useForm<CreateStockCountInput>({
    resolver: zodResolver(createStockCountSchema),
    defaultValues: {
      storeId: stores.find((s) => s.isDefault)?.id ?? stores[0]?.id ?? "",
      notes: "",
    },
  });

  async function onSubmit(values: CreateStockCountInput) {
    const result = await createStockCount(values);
    if (result.ok) {
      toast.success("Count started");
      router.push(`/store/counts/${result.data.id}`);
      return;
    }
    applyActionError(form, result);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="storeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Store</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a store" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="min-h-11">
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                The sheet lists every batch that has moved through this store.
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
                <Textarea rows={2} placeholder="e.g. Month-end count" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="h-12 w-full text-base"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Starting…" : "Start count"}
        </Button>
      </form>
    </Form>
  );
}
