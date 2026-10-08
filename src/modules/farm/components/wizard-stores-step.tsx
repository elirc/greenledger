"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { ensureStores } from "../actions";
import type { StoreRow } from "../queries";
import {
  DEFAULT_STORE_NAMES,
  STORE_TYPES,
  ensureStoresSchema,
  type EnsureStoresInput,
  type StoreType,
} from "../schema";
import { applyActionError } from "./form-helpers";

const HINTS: Record<StoreType, string> = {
  input_store: "Seed, fertiliser, chemicals, packaging",
  cold_room: "Harvested produce kept cool",
  packhouse: "Grading and packing produce",
};

/** Wizard step 3: tick the standard stores the farm has. */
export function WizardStoresStep({
  siteId,
  stores,
  onDone,
}: {
  siteId: string;
  stores: StoreRow[];
  onDone: () => void;
}) {
  const router = useRouter();
  const existingTypes = new Set(stores.map((s) => s.type));
  const form = useForm<EnsureStoresInput>({
    resolver: zodResolver(ensureStoresSchema),
    defaultValues: { siteId, types: [...STORE_TYPES] },
  });

  async function onSubmit(values: EnsureStoresInput) {
    const result = await ensureStores(values);
    if (result.ok) {
      const n = result.data.created;
      toast.success(n > 0 ? `${n} store${n === 1 ? "" : "s"} added` : "Stores saved");
      router.refresh();
      onDone();
      return;
    }
    applyActionError(form, result);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="types"
          render={({ field }) => (
            <FormItem>
              <ul className="space-y-2">
                {STORE_TYPES.map((t) => {
                  const exists = existingTypes.has(t);
                  const checked = exists || field.value.includes(t);
                  const existingName = stores.find((s) => s.type === t)?.name;
                  return (
                    <li key={t}>
                      <label className="has-[:disabled]:bg-muted/40 flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2">
                        <FormControl>
                          <Checkbox
                            className="size-5"
                            checked={checked}
                            disabled={exists}
                            onCheckedChange={(v) =>
                              field.onChange(
                                v === true
                                  ? [...new Set([...field.value, t])]
                                  : field.value.filter((x) => x !== t),
                              )
                            }
                          />
                        </FormControl>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 font-medium">
                            {existingName ?? DEFAULT_STORE_NAMES[t]}
                            {exists ? (
                              <StatusBadge variant="success">Added</StatusBadge>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground text-sm">
                            {HINTS[t]}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <FormMessage />
            </FormItem>
          )}
        />
        <p className="text-muted-foreground text-sm">
          You can rename stores or add more in Settings → Farm structure.
        </p>
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Saving…" : "Save & continue"}
        </Button>
      </form>
    </Form>
  );
}
