"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, ShieldAlert, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { formatLagos, formatLagosDate } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { submitWithOfflineFallback } from "@/lib/offline/outbox";
import { useCachedRefs } from "@/lib/offline/ref-cache";
import { formatQty, UNIT_LABELS } from "@/lib/units";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { InputCombobox } from "@/modules/recipes/components/input-combobox";
import { DEFAULT_CATEGORIES } from "@/modules/recipes/schema";
import { roundQty } from "@/modules/stock/logic";
import { logApplication } from "../actions";
import { computeSafety, scaleRecipe } from "../logic";
import type { ApplicationFormRefs } from "../queries";
import {
  APPLICATION_TYPES,
  APPLICATION_TYPE_LABELS,
  applicationCreateSchema,
  lagosLocalToDate,
  type ApplicationCreateInput,
  type ApplicationLineInput,
  type ApplicationType,
} from "../schema";

const CUSTOM = "__custom";

/** Empty line: quantity starts blank so zod reports "Enter a quantity". */
const blankLine = () =>
  ({ itemId: "", quantity: undefined }) as unknown as ApplicationLineInput;

const STOCK_CODES = ["NO_STOCK", "INSUFFICIENT_STOCK", "EXPIRED_BATCH"];

/**
 * Log a fertigation / spray: greenhouse → active cycle → type → optional
 * recipe → water volume → editable scaled lines (live scaleRecipe preview)
 * → store → applied-at → notes. Spray shows the REI/PHI lock-out it will
 * set, computed with the same computeSafety the server posts with.
 * No money anywhere on this form.
 */
export function ApplicationForm({
  refs: serverRefs,
  nowLocal,
}: {
  refs: ApplicationFormRefs;
  /** Current Lagos wall time as a datetime-local value (from the server). */
  nowLocal: string;
}) {
  const router = useRouter();
  const refs = useCachedRefs("application-form-refs", serverRefs);
  const [stockError, setStockError] = useState<string | null>(null);

  const initialGh = refs.greenhouses.length === 1 ? refs.greenhouses[0].id : "";
  const initialCycles = refs.cycles.filter((c) => c.greenhouseId === initialGh);
  const defaultStoreId =
    refs.stores.find((s) => s.isDefault)?.id ?? refs.stores[0]?.id ?? "";

  const form = useForm<ApplicationCreateInput>({
    resolver: zodResolver(applicationCreateSchema),
    defaultValues: {
      clientId: newId(),
      greenhouseId: initialGh,
      cropCycleId: initialCycles.length === 1 ? initialCycles[0].id : "",
      type: "fertigation",
      recipeId: undefined,
      waterVolumeLitres: undefined,
      lines: [blankLine()],
      storeId: defaultStoreId,
      appliedAt: nowLocal,
      notes: "",
    },
  });
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const [greenhouseId, type, recipeId, volume, lines, storeId, appliedAt] =
    useWatch({
      control: form.control,
      name: [
        "greenhouseId",
        "type",
        "recipeId",
        "waterVolumeLitres",
        "lines",
        "storeId",
        "appliedAt",
      ],
    });

  const itemsById = useMemo(
    () => new Map(refs.items.map((i) => [i.id, i])),
    [refs.items],
  );
  const cycles = refs.cycles.filter((c) => c.greenhouseId === greenhouseId);
  const recipes = refs.recipes.filter((r) => r.type === type);
  const storeName = refs.stores.find((s) => s.id === storeId)?.name;

  /** Replace the lines with the recipe scaled to the volume (scaleRecipe). */
  function rescale(nextRecipeId: string | undefined, nextVolume: number | undefined) {
    const recipe = refs.recipes.find((r) => r.id === nextRecipeId);
    if (!recipe || !nextVolume || nextVolume <= 0) return;
    const scaled = scaleRecipe(recipe.lines, nextVolume);
    replace(scaled.length > 0 ? scaled : [blankLine()]);
    setStockError(null);
  }

  function onGreenhouseChange(id: string) {
    form.setValue("greenhouseId", id, { shouldValidate: true });
    const inGh = refs.cycles.filter((c) => c.greenhouseId === id);
    form.setValue("cropCycleId", inGh.length === 1 ? inGh[0].id : "", {
      shouldValidate: inGh.length === 1,
    });
  }

  function onTypeChange(next: ApplicationType) {
    if (next === type) return;
    form.setValue("type", next);
    if (recipeId) {
      form.setValue("recipeId", undefined);
      replace([blankLine()]);
    }
    setStockError(null);
  }

  // Spray lock-out preview from the selected items' label PHI/REI.
  const appliedDate = appliedAt ? lagosLocalToDate(appliedAt) : null;
  const chosenItems = (lines ?? [])
    .map((l) => itemsById.get(l?.itemId))
    .filter((i): i is NonNullable<typeof i> => Boolean(i));
  const safety =
    type === "spray" && appliedDate && chosenItems.length > 0
      ? computeSafety(
          "spray",
          appliedDate,
          chosenItems.map((i) => ({ phiDays: i.phiDays, reiHours: i.reiHours })),
        )
      : null;

  async function onSubmit(values: ApplicationCreateInput) {
    setStockError(null);
    const payload = { ...values, recipeId: values.recipeId || undefined };
    const outcome = await submitWithOfflineFallback(
      logApplication,
      "application.create",
      payload.clientId,
      payload,
    );
    if (outcome.kind === "queued") {
      toast.success("Saved on this phone — will sync");
      form.reset({
        ...values,
        clientId: newId(),
        recipeId: undefined,
        waterVolumeLitres: undefined,
        lines: [blankLine()],
        notes: "",
      });
      return;
    }
    const result = outcome.result;
    if (result.ok) {
      const { entrySafeAt, harvestSafeDate } = result.data;
      const parts = [
        entrySafeAt ? `no entry until ${formatLagos(entrySafeAt, "dd MMM HH:mm")}` : null,
        harvestSafeDate ? `no harvest until ${formatLagosDate(harvestSafeDate)}` : null,
      ].filter(Boolean);
      toast.success(`${APPLICATION_TYPE_LABELS[values.type]} logged`, {
        description: parts.length > 0 ? `Greenhouse: ${parts.join(", ")}.` : undefined,
      });
      router.push("/applications");
      router.refresh();
      return;
    }
    if (result.code === "DUPLICATE") {
      toast.info("This application was already saved.");
      router.push("/applications");
      router.refresh();
      return;
    }
    // Nothing was written — a fresh id keeps any retry clean.
    form.setValue("clientId", newId());
    if (STOCK_CODES.includes(result.code)) setStockError(result.error);
    if (result.code === "BAD_DATE") {
      form.setError("appliedAt", { message: result.error });
    }
    if (result.code === "CYCLE_MISMATCH" || result.code === "CYCLE_NOT_ACTIVE") {
      form.setError("cropCycleId", { message: result.error });
    }
    applyActionError(form, result);
  }

  const linesError =
    form.formState.errors.lines?.root?.message ??
    form.formState.errors.lines?.message;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="greenhouseId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Greenhouse</FormLabel>
              <Select value={field.value || undefined} onValueChange={onGreenhouseChange}>
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a greenhouse" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {refs.greenhouses.map((g) => (
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

        <FormField
          control={form.control}
          name="cropCycleId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Crop cycle</FormLabel>
              <Select
                value={field.value || undefined}
                onValueChange={field.onChange}
                disabled={!greenhouseId || cycles.length === 0}
              >
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue
                      placeholder={
                        !greenhouseId
                          ? "Pick a greenhouse first"
                          : cycles.length === 0
                            ? "No active cycle in this greenhouse"
                            : "Pick a cycle"
                      }
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {cycles.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="min-h-11">
                      {c.code}
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
          name="type"
          render={() => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <div className="bg-muted flex gap-1 rounded-lg p-1" role="radiogroup">
                {APPLICATION_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={type === t}
                    onClick={() => onTypeChange(t)}
                    className={cn(
                      "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors",
                      type === t
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {APPLICATION_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="recipeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Recipe (optional)</FormLabel>
              <Select
                value={field.value ?? CUSTOM}
                onValueChange={(v) => {
                  const id = v === CUSTOM ? undefined : v;
                  field.onChange(id);
                  if (id) rescale(id, form.getValues("waterVolumeLitres"));
                }}
              >
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={CUSTOM} className="min-h-11">
                    Custom — enter inputs myself
                  </SelectItem>
                  {recipes.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="min-h-11">
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {recipes.length === 0 ? (
                <FormDescription>
                  No active {APPLICATION_TYPE_LABELS[type].toLowerCase()} recipes yet.
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="waterVolumeLitres"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Water volume (litres)</FormLabel>
              <FormControl>
                <NumberInput
                  decimal
                  className="h-12 text-lg"
                  placeholder="e.g. 650"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    rescale(form.getValues("recipeId"), v);
                  }}
                />
              </FormControl>
              {recipeId ? (
                <FormDescription>
                  Changing the recipe or volume recalculates the inputs below.
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="storeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Draw inputs from</FormLabel>
              <Select
                value={field.value || undefined}
                onValueChange={(v) => {
                  field.onChange(v);
                  setStockError(null);
                }}
              >
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Pick a store" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {refs.stores.map((s) => (
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

        <section className="space-y-3" aria-live="polite">
          <div>
            <h2 className="text-sm font-medium">Inputs to apply</h2>
            <p className="text-muted-foreground text-xs">
              {recipeId && volume
                ? `Scaled to ${volume} L. Adjust, add or remove inputs before saving.`
                : "Quantities in each input's stock unit."}
            </p>
          </div>
          <ul className="space-y-3">
            {fields.map((f, i) => {
              const line = lines?.[i];
              const item = line ? itemsById.get(line.itemId) : undefined;
              const usable = item && storeId ? (item.usable[storeId] ?? 0) : null;
              const short =
                item && usable !== null && line?.quantity
                  ? roundQty(line.quantity) > usable
                  : false;
              return (
                <li key={f.id} className="space-y-2 rounded-lg border p-3">
                  <FormField
                    control={form.control}
                    name={`lines.${i}.itemId`}
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Input</FormLabel>
                        <FormControl>
                          <InputCombobox
                            options={refs.items}
                            preferredCategories={DEFAULT_CATEGORIES[type]}
                            value={field.value}
                            onChange={(id) => {
                              field.onChange(id);
                              setStockError(null);
                            }}
                            invalid={Boolean(fieldState.error)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`lines.${i}.quantity`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel className="sr-only">Quantity</FormLabel>
                          <div className="flex items-center gap-2">
                            <FormControl>
                              <NumberInput
                                decimal
                                placeholder="Qty"
                                name={field.name}
                                ref={field.ref}
                                onBlur={field.onBlur}
                                value={field.value}
                                onChange={(v) => {
                                  field.onChange(v);
                                  setStockError(null);
                                }}
                              />
                            </FormControl>
                            <span className="text-muted-foreground w-12 shrink-0 text-sm">
                              {item ? UNIT_LABELS[item.baseUnit] : "—"}
                            </span>
                          </div>
                          {item && usable !== null ? (
                            <p
                              className={cn(
                                "text-xs",
                                short ? "text-destructive" : "text-muted-foreground",
                              )}
                            >
                              {formatQty(usable, item.baseUnit)} usable in{" "}
                              {storeName ?? "this store"}
                              {short ? " — not enough" : ""}
                            </p>
                          ) : null}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0"
                      aria-label="Remove input"
                      disabled={fields.length === 1}
                      onClick={() => remove(i)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {linesError ? (
            <p className="text-destructive text-sm">{linesError}</p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => append(blankLine())}
          >
            <Plus className="size-4" /> Add input
          </Button>
        </section>

        {stockError ? (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertTitle>Not enough stock</AlertTitle>
            <AlertDescription>{stockError}</AlertDescription>
          </Alert>
        ) : null}

        {type === "spray" && chosenItems.length > 0 ? (
          <Alert>
            <ShieldAlert className="size-4" />
            <AlertTitle>Safety windows</AlertTitle>
            <AlertDescription>
              {safety && (safety.entrySafeAt || safety.harvestSafeDate)
                ? sprayNotice(safety.entrySafeAt, safety.harvestSafeDate)
                : appliedDate
                  ? "The chosen products have no PHI/REI on file, so no entry or harvest lock will be set."
                  : "Enter the application time to see the safety windows."}
            </AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="appliedAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Applied at</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  type="datetime-local"
                  {...field}
                />
              </FormControl>
              <FormDescription>Lagos time.</FormDescription>
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
                <Textarea
                  rows={3}
                  placeholder="e.g. whitefly hotspot rows 3–5"
                  {...field}
                  value={field.value ?? ""}
                />
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
          {form.formState.isSubmitting
            ? "Saving…"
            : `Log ${APPLICATION_TYPE_LABELS[type].toLowerCase()}`}
        </Button>
      </form>
    </Form>
  );
}

function sprayNotice(entrySafeAt: Date | null, harvestSafeDate: string | null) {
  const entry = entrySafeAt
    ? `lock entry until ${formatLagos(entrySafeAt, "dd MMM yyyy HH:mm")}`
    : null;
  const harvest = harvestSafeDate
    ? `harvest until ${formatLagosDate(harvestSafeDate)}`
    : null;
  if (entry && harvest) return `This spray will ${entry} and ${harvest}.`;
  if (entry) return `This spray will ${entry}. No harvest lock (no PHI on file).`;
  return `This spray will lock ${harvest}. No entry lock (no REI on file).`;
}
