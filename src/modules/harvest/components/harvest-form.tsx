"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldAlert, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
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
import { formatLagosDate, lagosDateOf } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { lagosLocalToDate } from "@/modules/applications/schema";
import { SafetyChips } from "@/modules/cycles/components/safety-chips";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { roundQty } from "@/modules/stock/logic";
import { logHarvest } from "../actions";
import { SectionCard } from "@/components/common/section-card";
import type { HarvestFormRefs, HarvestSummary } from "../queries";
import { HarvestList } from "./harvest-list";
import {
  GRADES,
  GRADE_LABELS,
  harvestCreateSchema,
  insidePhi,
  type HarvestCreateInput,
  type HarvestLineFormInput,
} from "../schema";
import { OverrideDialog } from "./override-dialog";

const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 });

/** One blank row per grade; blank rows are skipped on save. */
const blankLines = (): HarvestLineFormInput[] =>
  GRADES.map((grade) => ({ grade, crates: undefined, kg: undefined }));

/**
 * Quick harvest entry: greenhouse → active cycle (auto when single) →
 * harvested at → A/B/C/Reject rows (crates + kg) → destination store
 * (default packhouse) → notes. A red panel warns BEFORE submit when the
 * harvest date is inside the greenhouse's pre-harvest interval; on
 * PHI_BLOCKED managers/owners get the override dialog, workers are told to
 * ask a manager. No money anywhere.
 */
export function HarvestForm({
  refs,
  nowLocal,
  initialGreenhouseId,
  canOverride,
  recent,
}: {
  refs: HarvestFormRefs;
  /** greenhouseId → its latest harvests (server-loaded, refreshed on save). */
  recent: Record<string, HarvestSummary[]>;
  /** Current Lagos wall time as a datetime-local value (from the server). */
  nowLocal: string;
  initialGreenhouseId: string;
  /** owner | manager */
  canOverride: boolean;
}) {
  const router = useRouter();
  const [phiError, setPhiError] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [pending, setPending] = useState<HarvestCreateInput | null>(null);

  const cyclesFor = (ghId: string) =>
    refs.cycles.filter((c) => c.greenhouseId === ghId);
  const initialCycles = cyclesFor(initialGreenhouseId);
  const defaultStoreId = refs.stores[0]?.id ?? "";

  const form = useForm<HarvestCreateInput>({
    resolver: zodResolver(harvestCreateSchema),
    defaultValues: {
      clientId: newId(),
      greenhouseId: initialGreenhouseId,
      cropCycleId: initialCycles.length === 1 ? initialCycles[0].id : "",
      harvestedAt: nowLocal,
      lines: blankLines(),
      storeId: defaultStoreId,
      notes: "",
      override: undefined,
    },
  });

  const [greenhouseId, harvestedAt, lines] = useWatch({
    control: form.control,
    name: ["greenhouseId", "harvestedAt", "lines"],
  });

  const gh = refs.greenhouses.find((g) => g.id === greenhouseId);
  const cycles = cyclesFor(greenhouseId);
  const harvestInstant = harvestedAt ? lagosLocalToDate(harvestedAt) : null;
  const harvestDate = harvestInstant ? lagosDateOf(harvestInstant) : refs.today;
  const blocked = gh ? insidePhi(gh.harvestSafeDate, harvestDate) : false;
  const totalKg = roundQty(
    (lines ?? []).reduce((a, l) => a + (l?.kg && l.kg > 0 ? l.kg : 0), 0),
  );

  function onGreenhouseChange(id: string) {
    form.setValue("greenhouseId", id, { shouldValidate: true });
    const inGh = cyclesFor(id);
    form.setValue("cropCycleId", inGh.length === 1 ? inGh[0].id : "", {
      shouldValidate: inGh.length === 1,
    });
    setPhiError(null);
  }

  function resetAfterSave(values: HarvestCreateInput) {
    form.reset({
      clientId: newId(),
      greenhouseId: values.greenhouseId,
      cropCycleId: values.cropCycleId,
      harvestedAt: values.harvestedAt,
      lines: blankLines(),
      storeId: values.storeId,
      notes: "",
      override: undefined,
    });
    setPhiError(null);
    setPending(null);
  }

  async function submit(values: HarvestCreateInput): Promise<boolean> {
    setPhiError(null);
    const result = await logHarvest(values);
    if (result.ok) {
      if (result.data.duplicate) {
        toast.info("This harvest was already saved.");
      } else {
        toast.success(`Harvest saved — ${kgFmt.format(result.data.totalKg)} kg`, {
          description: result.data.overrideUsed
            ? "Logged with a pre-harvest interval override."
            : undefined,
        });
      }
      resetAfterSave(values);
      router.refresh();
      return true;
    }
    if (result.code === "PHI_BLOCKED") {
      // Nothing was written — the same clientId is safe to resubmit.
      if (canOverride) {
        setPending(values);
        setOverrideOpen(true);
      } else {
        setPhiError(result.error);
      }
      return false;
    }
    if (result.code === "FORBIDDEN_OVERRIDE") {
      setPhiError(result.error);
      toast.error(result.error);
      return false;
    }
    // Nothing was written — a fresh id keeps any retry clean.
    form.setValue("clientId", newId());
    if (result.code === "BAD_DATE") {
      form.setError("harvestedAt", { message: result.error });
    }
    if (result.code === "CYCLE_MISMATCH" || result.code === "CYCLE_NOT_ACTIVE") {
      form.setError("cropCycleId", { message: result.error });
    }
    if (result.code === "BAD_STORE") {
      form.setError("storeId", { message: result.error });
    }
    applyActionError(form, result);
    return false;
  }

  async function onSubmit(values: HarvestCreateInput) {
    await submit({ ...values, override: undefined });
  }

  async function onOverride(reason: string) {
    const values = pending;
    if (!values) return;
    const ok = await submit({ ...values, override: { reason } });
    if (ok) setOverrideOpen(false);
  }

  const linesError =
    form.formState.errors.lines?.root?.message ??
    form.formState.errors.lines?.message;

  return (
    <>
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
                        {g.blockedToday ? " · PHI" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {gh ? (
                  <SafetyChips
                    entrySafeAt={gh.entrySafeAt}
                    harvestSafeDate={gh.harvestSafeDate}
                    today={refs.today}
                  />
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />

          {gh && blocked ? (
            <Alert variant="destructive" aria-live="polite">
              <ShieldAlert className="size-4" />
              <AlertTitle>
                Inside pre-harvest interval until{" "}
                {formatLagosDate(gh.harvestSafeDate as string)}
              </AlertTitle>
              <AlertDescription>
                {canOverride
                  ? "A spray in this greenhouse has not cleared its PHI. Saving will ask for a manager override with a reason, recorded in the audit log."
                  : "A spray in this greenhouse has not cleared its PHI. Ask a manager to override — you cannot save this harvest yourself."}
              </AlertDescription>
            </Alert>
          ) : null}

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
                              ? "No growing cycle in this greenhouse"
                              : "Pick a cycle"
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {cycles.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="min-h-11">
                        {c.code} · {c.cropName} {c.varietyName}
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
            name="harvestedAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Harvested at</FormLabel>
                <FormControl>
                  <Input className="h-11" type="datetime-local" {...field} />
                </FormControl>
                <FormDescription>Lagos time.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <section className="space-y-2" aria-labelledby="grade-lines">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="grade-lines" className="text-sm font-medium">
                Grades
              </h2>
              <span className="text-muted-foreground text-sm tabular-nums">
                Total {kgFmt.format(totalKg)} kg
              </span>
            </div>
            <div className="text-muted-foreground grid grid-cols-[4.5rem_1fr_1fr] gap-2 text-xs">
              <span />
              <span>Crates</span>
              <span>Kg</span>
            </div>
            <ul className="space-y-2">
              {GRADES.map((grade, i) => (
                <li
                  key={grade}
                  className="grid grid-cols-[4.5rem_1fr_1fr] items-start gap-2"
                >
                  <span className="flex min-h-11 items-center text-sm font-medium">
                    {GRADE_LABELS[grade]}
                  </span>
                  <FormField
                    control={form.control}
                    name={`lines.${i}.crates`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">
                          {GRADE_LABELS[grade]} crates
                        </FormLabel>
                        <FormControl>
                          <NumberInput
                            decimal
                            placeholder="0"
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
                    name={`lines.${i}.kg`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">{GRADE_LABELS[grade]} kg</FormLabel>
                        <FormControl>
                          <NumberInput
                            decimal
                            placeholder="kg"
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
                </li>
              ))}
            </ul>
            {linesError ? (
              <p className="text-destructive text-sm">{linesError}</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Leave a grade blank to skip it.
              </p>
            )}
          </section>

          <FormField
            control={form.control}
            name="storeId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Send produce to</FormLabel>
                <Select value={field.value || undefined} onValueChange={field.onChange}>
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

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder="e.g. rows 1–8, some cracking"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {phiError ? (
            <Alert variant="destructive" aria-live="polite">
              <UserRoundCheck className="size-4" />
              <AlertTitle>Ask a manager to override</AlertTitle>
              <AlertDescription>{phiError}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            className="h-12 w-full text-base"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Saving…" : "Save harvest"}
          </Button>
        </form>
      </Form>

      {/* Rendered outside the <form>: portal events still bubble through React. */}
      {canOverride ? (
        <OverrideDialog
          open={overrideOpen}
          onOpenChange={(o) => {
            setOverrideOpen(o);
            if (!o) setPending(null);
          }}
          harvestSafeDate={gh?.harvestSafeDate ?? null}
          onConfirm={onOverride}
        />
      ) : null}

      <SectionCard title={gh ? `Recent harvests · ${gh.name}` : "Recent harvests"}>
        {!gh ? (
          <p className="text-muted-foreground text-sm">
            Pick a greenhouse to see its recent harvests.
          </p>
        ) : (recent[gh.id] ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing has been harvested in {gh.name} yet.
          </p>
        ) : (
          <HarvestList harvests={recent[gh.id]} showGreenhouse={false} />
        )}
      </SectionCard>
    </>
  );
}
