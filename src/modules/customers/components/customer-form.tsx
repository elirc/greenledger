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
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import {
  customerCreateSchema,
  type CustomerCreateInput,
} from "../schema";

/**
 * Canonical form pattern: rhf + zodResolver on the SAME schema the action
 * validates, ActionResult handling with fieldErrors mapped into the form.
 */
export function CustomerForm({
  defaultValues,
  onSubmitAction,
  submitLabel,
}: {
  defaultValues?: Partial<CustomerCreateInput>;
  onSubmitAction: (
    input: CustomerCreateInput,
  ) => Promise<ActionResult<{ id: string }>>;
  submitLabel: string;
}) {
  const router = useRouter();
  const form = useForm<CustomerCreateInput>({
    resolver: zodResolver(customerCreateSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      notes: "",
      ...defaultValues,
    },
  });

  async function onSubmit(values: CustomerCreateInput) {
    const result = await onSubmitAction(values);
    if (result.ok) {
      toast.success("Customer saved");
      router.push(`/sales/customers/${result.data.id}`);
      router.refresh();
      return;
    }
    applyActionError(form, result, "name");
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  type="tel"
                  inputMode="tel"
                  placeholder="0803 123 4567"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  type="email"
                  inputMode="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
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
          {form.formState.isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
