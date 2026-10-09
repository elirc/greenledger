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
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { updateCrop } from "../actions";
import type { CropRow } from "../queries";
import { cropUpdateSchema, type CropUpdateInput } from "../schema";

/** Inline shelf-life editor for one crop (placeholder 7 / 10 days). */
export function CropShelfLifeForm({ crop }: { crop: CropRow }) {
  const router = useRouter();
  const form = useForm<CropUpdateInput>({
    resolver: zodResolver(cropUpdateSchema),
    defaultValues: {
      id: crop.id,
      name: crop.name,
      shelfLifeDays: crop.shelfLifeDays,
    },
  });

  async function onSubmit(values: CropUpdateInput) {
    const result = await updateCrop(values);
    if (result.ok) {
      toast.success(`${crop.name} shelf life saved`);
      form.reset(values);
      router.refresh();
      return;
    }
    applyActionError(form, result);
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex items-end gap-2"
      >
        <FormField
          control={form.control}
          name="shelfLifeDays"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Shelf life after harvest (days)</FormLabel>
              <FormControl>
                <NumberInput
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  onChange={field.onChange}
                  min={1}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          variant="outline"
          className="h-11 shrink-0"
          disabled={form.formState.isSubmitting || !form.formState.isDirty}
        >
          {form.formState.isSubmitting ? "Saving…" : "Save"}
        </Button>
      </form>
    </Form>
  );
}
