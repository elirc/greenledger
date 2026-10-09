"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { transplantNurseryBatch } from "../actions";
import {
  nurseryTransplantSchema,
  type NurseryTransplantInput,
} from "../schema";

const NO_ZONE = "__none";

export interface TransplantGreenhouse {
  id: string;
  name: string;
  zones: { id: string; name: string }[];
}

/**
 * Moves seedlings into a greenhouse: creates a crop cycle via
 * transplantToCycle, then offers a link to the new cycle.
 */
export function TransplantForm({
  batchId,
  available,
  sowDate,
  today,
  greenhouses,
  onDone,
}: {
  batchId: string;
  available: number;
  sowDate: string;
  /** Lagos yyyy-MM-dd, computed on the server. */
  today: string;
  greenhouses: TransplantGreenhouse[];
  onDone: () => void;
}) {
  const router = useRouter();
  const form = useForm<NurseryTransplantInput>({
    resolver: zodResolver(nurseryTransplantSchema),
    defaultValues: {
      nurseryBatchId: batchId,
      greenhouseId: greenhouses.length === 1 ? greenhouses[0].id : "",
      zoneId: "",
      count: available,
      transplantDate: today,
      closeBatch: false,
    },
  });
  const greenhouseId = useWatch({ control: form.control, name: "greenhouseId" });
  const zonesForGh =
    greenhouses.find((g) => g.id === greenhouseId)?.zones ?? [];

  async function onSubmit(values: NurseryTransplantInput) {
    if (values.count > available) {
      form.setError("count", {
        message: `Only ${available} seedlings are available.`,
      });
      return;
    }
    if (values.transplantDate < sowDate) {
      form.setError("transplantDate", {
        message: "Transplant date can't be before the sow date.",
      });
      return;
    }
    const result = await transplantNurseryBatch(values);
    if (result.ok) {
      const { cycleId, code } = result.data;
      toast.success(`Crop cycle ${code} started`, {
        description: `${values.count} seedlings transplanted.`,
        action: {
          label: "Open cycle",
          onClick: () => router.push(`/cycles/${cycleId}`),
        },
        duration: 10_000,
      });
      onDone();
      router.refresh();
      return;
    }
    if (result.code === "BAD_COUNT") {
      form.setError("count", { message: result.error });
    } else if (result.code === "BAD_DATE") {
      form.setError("transplantDate", { message: result.error });
    }
    applyActionError(form, result);
  }

  if (greenhouses.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No greenhouses available to you. Ask a manager to add a greenhouse or
        assign you to one.
      </p>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="greenhouseId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Greenhouse</FormLabel>
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  form.setValue("zoneId", "");
                }}
              >
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a greenhouse" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {greenhouses.map((g) => (
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
        {zonesForGh.length > 0 ? (
          <FormField
            control={form.control}
            name="zoneId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Zone</FormLabel>
                <Select
                  value={field.value ? field.value : NO_ZONE}
                  onValueChange={(v) => field.onChange(v === NO_ZONE ? "" : v)}
                >
                  <FormControl>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue placeholder="Whole greenhouse" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NO_ZONE} className="min-h-11">
                      Whole greenhouse
                    </SelectItem>
                    {zonesForGh.map((z) => (
                      <SelectItem key={z.id} value={z.id} className="min-h-11">
                        {z.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Optional.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="count"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Seedlings</FormLabel>
                <FormControl>
                  <NumberInput
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value}
                    onChange={field.onChange}
                    min={1}
                    max={available}
                  />
                </FormControl>
                <FormDescription>{available} available.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="transplantDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input
                    className="h-11"
                    type="date"
                    min={sowDate}
                    max={today}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="closeBatch"
          render={({ field }) => (
            <FormItem>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2">
                <FormControl>
                  <Checkbox
                    className="size-5"
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                </FormControl>
                <span className="flex-1">
                  <span className="block text-sm font-medium">
                    Close this batch
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    Mark it finished even if seedlings are left over.
                  </span>
                </span>
              </label>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Transplanting…" : "Transplant"}
        </Button>
      </form>
    </Form>
  );
}
