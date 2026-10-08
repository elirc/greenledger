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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createGreenhouse, updateGreenhouse } from "../actions";
import type { GreenhouseRow, SiteRow } from "../queries";
import {
  GREENHOUSE_TYPES,
  GREENHOUSE_TYPE_LABELS,
  greenhouseCreateSchema,
  type GreenhouseCreateInput,
} from "../schema";
import { applyActionError } from "./form-helpers";
import { NumberInput } from "./number-input";

export function GreenhouseForm({
  greenhouse,
  sites,
  onSaved,
}: {
  greenhouse?: GreenhouseRow;
  sites: Pick<SiteRow, "id" | "name">[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const form = useForm<GreenhouseCreateInput>({
    resolver: zodResolver(greenhouseCreateSchema),
    defaultValues: greenhouse
      ? {
          siteId: greenhouse.siteId,
          name: greenhouse.name,
          type: greenhouse.type,
          areaM2: greenhouse.areaM2,
          plantCapacity: greenhouse.plantCapacity,
          notes: greenhouse.notes ?? "",
          isActive: greenhouse.isActive,
        }
      : {
          siteId: sites[0]?.id ?? "",
          name: "",
          type: "greenhouse",
          areaM2: undefined,
          plantCapacity: undefined,
          notes: "",
          isActive: true,
        },
  });

  async function onSubmit(values: GreenhouseCreateInput) {
    const result = greenhouse
      ? await updateGreenhouse({ ...values, id: greenhouse.id })
      : await createGreenhouse(values);
    if (result.ok) {
      toast.success("Greenhouse saved");
      router.refresh();
      onSaved?.();
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
                <Input
                  className="h-11"
                  autoComplete="off"
                  placeholder="GH1"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {GREENHOUSE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="min-h-11">
                      {GREENHOUSE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="areaM2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Area (m²)</FormLabel>
                <FormControl>
                  <NumberInput
                    decimal
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
            name="plantCapacity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Plant capacity</FormLabel>
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
        </div>
        {sites.length > 1 ? (
          <FormField
            control={form.control}
            name="siteId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Site</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue placeholder="Pick a site" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {sites.map((s) => (
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
        ) : null}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div>
                <FormLabel>Active</FormLabel>
                <FormDescription>
                  Inactive greenhouses are hidden from daily forms.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
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
            : greenhouse
              ? "Save changes"
              : "Add greenhouse"}
        </Button>
      </form>
    </Form>
  );
}
