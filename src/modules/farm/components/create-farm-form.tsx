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
import { createFarm } from "../actions";
import { createFarmSchema, type CreateFarmInput } from "../schema";
import { applyActionError } from "./form-helpers";

export function CreateFarmForm() {
  const router = useRouter();
  const form = useForm<CreateFarmInput>({
    resolver: zodResolver(createFarmSchema),
    defaultValues: { name: "" },
  });

  async function onSubmit(values: CreateFarmInput) {
    const result = await createFarm(values);
    if (result.ok) {
      toast.success("Farm created — 14-day trial started");
      router.push("/setup");
      router.refresh();
      return;
    }
    if (result.code === "ALREADY_MEMBER") {
      router.push("/");
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
              <FormLabel>Farm name</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  autoComplete="organization"
                  placeholder="e.g. Green Valley Farms"
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormDescription>
                You can change sites, greenhouses and stores later.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Creating farm…" : "Create farm"}
        </Button>
      </form>
    </Form>
  );
}
