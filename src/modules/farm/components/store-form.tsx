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
import { createStore, updateStore } from "../actions";
import type { SiteRow, StoreRow } from "../queries";
import {
  STORE_TYPES,
  STORE_TYPE_LABELS,
  storeCreateSchema,
  type StoreCreateInput,
} from "../schema";
import { applyActionError } from "./form-helpers";

export function StoreForm({
  store,
  sites,
  onSaved,
}: {
  store?: StoreRow;
  sites: Pick<SiteRow, "id" | "name">[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const form = useForm<StoreCreateInput>({
    resolver: zodResolver(storeCreateSchema),
    defaultValues: store
      ? {
          siteId: store.siteId,
          name: store.name,
          type: store.type,
          isDefault: store.isDefault,
        }
      : {
          siteId: sites[0]?.id ?? "",
          name: "",
          type: "input_store",
          isDefault: false,
        },
  });

  async function onSubmit(values: StoreCreateInput) {
    const result = store
      ? await updateStore({ ...values, id: store.id })
      : await createStore(values);
    if (result.ok) {
      toast.success("Store saved");
      router.refresh();
      onSaved?.();
      return;
    }
    if (result.code === "DEFAULT_REQUIRED") {
      form.setError("isDefault", { message: result.error });
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
                  {STORE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="min-h-11">
                      {STORE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
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
          name="isDefault"
          render={({ field }) => (
            <FormItem className="rounded-lg border px-3 py-2">
              <div className="flex min-h-11 items-center justify-between gap-3">
                <div>
                  <FormLabel>Default store</FormLabel>
                  <FormDescription>
                    Pre-selected when receiving and issuing stock. Exactly one
                    store is the default.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={store?.isDefault === true}
                  />
                </FormControl>
              </div>
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
            : store
              ? "Save changes"
              : "Add store"}
        </Button>
      </form>
    </Form>
  );
}
