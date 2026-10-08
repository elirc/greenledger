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
import { createSite, updateSite } from "../actions";
import { siteCreateSchema, type SiteCreateInput } from "../schema";
import { applyActionError } from "./form-helpers";

/** Create (no `site`) or rename/edit an existing site. */
export function SiteForm({
  site,
  submitLabel,
  onSaved,
}: {
  site?: { id: string; name: string; address: string | null };
  submitLabel: string;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const form = useForm<SiteCreateInput>({
    resolver: zodResolver(siteCreateSchema),
    defaultValues: { name: site?.name ?? "", address: site?.address ?? "" },
  });

  async function onSubmit(values: SiteCreateInput) {
    const result = site
      ? await updateSite({ ...values, id: site.id })
      : await createSite(values);
    if (result.ok) {
      toast.success("Site saved");
      if (!site) form.reset({ name: "", address: "" });
      router.refresh();
      onSaved?.(result.data.id);
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
              <FormLabel>Site name</FormLabel>
              <FormControl>
                <Input className="h-11" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address (optional)</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  placeholder="Village / LGA / State"
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
