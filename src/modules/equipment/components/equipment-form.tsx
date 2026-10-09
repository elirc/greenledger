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
import type { EquipmentFormRefs } from "../queries";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_STATUS_LABELS,
  equipmentCreateSchema,
  type EquipmentCreateInput,
} from "../schema";

/** Radix Select can't hold "" — this sentinel maps to "no selection". */
const NONE = "__none";

export function EquipmentForm({
  refs,
  defaultValues,
  onSubmitAction,
  submitLabel,
  canSeeMoney,
}: {
  refs: EquipmentFormRefs;
  defaultValues?: Partial<EquipmentCreateInput>;
  onSubmitAction: (
    input: EquipmentCreateInput,
  ) => Promise<ActionResult<{ id: string }>>;
  submitLabel: string;
  canSeeMoney: boolean;
}) {
  const router = useRouter();
  const form = useForm<EquipmentCreateInput>({
    resolver: zodResolver(equipmentCreateSchema),
    defaultValues: {
      name: "",
      category: undefined,
      siteId: refs.sites.length === 1 ? refs.sites[0].id : "",
      greenhouseId: "",
      locationNote: "",
      serialNumber: "",
      purchaseDate: "",
      cost: "",
      status: "operational",
      notes: "",
      ...defaultValues,
    },
  });
  const siteId = useWatch({ control: form.control, name: "siteId" });
  const ghOptions = refs.greenhouses.filter((g) => !siteId || g.siteId === siteId);

  async function onSubmit(values: EquipmentCreateInput) {
    const result = await onSubmitAction(values);
    if (result.ok) {
      toast.success("Equipment saved");
      router.push(`/equipment/${result.data.id}`);
      router.refresh();
      return;
    }
    applyActionError(form, result);
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
                  placeholder="e.g. Fertigation pump GH1"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
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
                    {EQUIPMENT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="min-h-11">
                        {EQUIPMENT_CATEGORY_LABELS[c]}
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
                    {EQUIPMENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="min-h-11">
                        {EQUIPMENT_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="siteId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Site</FormLabel>
                <Select
                  value={field.value ? field.value : NONE}
                  onValueChange={(v) => {
                    field.onChange(v === NONE ? "" : v);
                    const gh = form.getValues("greenhouseId");
                    if (gh && !refs.greenhouses.some((g) => g.id === gh && g.siteId === v)) {
                      form.setValue("greenhouseId", "");
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
                      No site
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
                <FormLabel>Greenhouse (optional)</FormLabel>
                <Select
                  value={field.value ? field.value : NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                >
                  <FormControl>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE} className="min-h-11">
                      Not in a greenhouse
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
        </div>
        <FormField
          control={form.control}
          name="locationNote"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location note (optional)</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  placeholder="e.g. Pump house by borehole"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="serialNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Serial number (optional)</FormLabel>
                <FormControl>
                  <Input className="h-11" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="purchaseDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Purchase date (optional)</FormLabel>
                <FormControl>
                  <Input className="h-11" type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {canSeeMoney ? (
          <FormField
            control={form.control}
            name="cost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Purchase cost (₦, optional)</FormLabel>
                <FormControl>
                  <Input
                    className="h-11"
                    inputMode="decimal"
                    placeholder="e.g. 450,000"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>Leave blank if unknown.</FormDescription>
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
