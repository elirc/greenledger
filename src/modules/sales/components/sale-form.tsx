"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { MoneyText } from "@/components/common/money-text";
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
import { todayLagos } from "@/lib/dates";
import { nairaToKobo } from "@/lib/money";
import { NewCustomerDialog } from "@/modules/customers/components/new-customer-dialog";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { NumberInput } from "@/modules/farm/components/number-input";
import { createSale } from "../actions";
import { lineTotalKobo } from "../logic";
import type { SaleFormRefs } from "../queries";
import {
  GRADE_LABELS,
  GRADES,
  isNairaText,
  PRICE_BASES,
  PRICE_BASIS_LABELS,
  saleCreateSchema,
  type Grade,
  type SaleCreateInput,
  type SaleLineInput,
} from "../schema";

const emptyLine = (): SaleLineInput => ({
  cropId: "",
  grade: "a",
  kg: Number.NaN,
  crates: undefined,
  priceBasis: "per_kg",
  unitPrice: "",
});

const kgFormat = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 });

/** Line total in kobo, or null while the line is incomplete. */
function lineTotal(line: Partial<SaleLineInput> | undefined): number | null {
  if (!line?.unitPrice || !isNairaText(line.unitPrice)) return null;
  const kg = line.kg;
  if (typeof kg !== "number" || !Number.isFinite(kg) || kg <= 0) return null;
  const basis = line.priceBasis ?? "per_kg";
  if (basis === "per_crate" && !(line.crates && line.crates > 0)) return null;
  return lineTotalKobo({
    priceBasis: basis,
    unitPriceKobo: nairaToKobo(line.unitPrice),
    kg,
    crates: line.crates ?? null,
  });
}

/**
 * New sale: customer (+ inline new), date, source store, then lines of
 * crop → grade (with available kg) → kg / crates → price basis → unit
 * price in naira. Live line totals + grand total; the server re-checks
 * stock and allocates FIFO.
 */
export function SaleForm({ refs }: { refs: SaleFormRefs }) {
  const router = useRouter();
  const [customers, setCustomers] = useState(refs.customers);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);

  const form = useForm<SaleCreateInput>({
    resolver: zodResolver(saleCreateSchema),
    defaultValues: {
      customerId: "",
      saleDate: todayLagos(),
      storeId: refs.defaultStoreId ?? "",
      notes: "",
      lines: [emptyLine()],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const lines = useWatch({ control: form.control, name: "lines" });
  const storeId = useWatch({ control: form.control, name: "storeId" });

  const available = (cropId: string | undefined, grade: Grade): number => {
    if (!cropId || !storeId) return 0;
    return (
      refs.availability.find(
        (a) => a.storeId === storeId && a.cropId === cropId && a.grade === grade,
      )?.kg ?? 0
    );
  };

  const totals = (lines ?? []).map((l) => lineTotal(l));
  const grandTotal = totals.reduce<number>((a, t) => a + (t ?? 0), 0);

  async function onSubmit(values: SaleCreateInput) {
    const result = await createSale(values);
    if (result.ok) {
      toast.success(`Sale ${result.data.invoiceNumber} saved`);
      router.push(`/sales/${result.data.id}`);
      router.refresh();
      return;
    }
    applyActionError(form, result);
  }

  const linesError =
    form.formState.errors.lines?.root?.message ??
    form.formState.errors.lines?.message;
  const noStores = refs.stores.length === 0;
  const noCrops = refs.crops.length === 0;

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Customer</FormLabel>
                <div className="flex gap-2">
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="h-11 min-w-0 flex-1">
                        <SelectValue placeholder="Pick a customer" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="min-h-11">
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0"
                    onClick={() => setCustomerDialogOpen(true)}
                  >
                    <Plus className="size-4" /> New
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="saleDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sale date</FormLabel>
                  <FormControl>
                    <Input
                      className="h-11"
                      type="date"
                      max={todayLagos()}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="storeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sold from</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
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
          </div>
          {noStores ? (
            <p className="text-muted-foreground rounded-lg border px-4 py-3 text-sm">
              No cold room or packhouse yet.{" "}
              <Link href="/settings/stores" className="text-primary underline">
                Add a store
              </Link>{" "}
              to sell produce from.
            </p>
          ) : null}

          <section aria-label="Lines" className="space-y-3">
            <h2 className="text-base font-semibold">Lines</h2>
            {noCrops ? (
              <p className="text-muted-foreground rounded-lg border px-4 py-3 text-sm">
                No crops set up yet.
              </p>
            ) : null}
            {fields.map((f, index) => {
              const line = lines?.[index];
              const avail = available(line?.cropId, line?.grade ?? "a");
              const kg = line?.kg;
              const over =
                !!line?.cropId &&
                typeof kg === "number" &&
                Number.isFinite(kg) &&
                kg > avail;
              const perCrate = line?.priceBasis === "per_crate";
              return (
                <fieldset
                  key={f.id}
                  aria-label={`Line ${index + 1}`}
                  className="space-y-3 rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Line {index + 1}</p>
                    {fields.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="size-11"
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name={`lines.${index}.cropId`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Crop</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger className="h-11 w-full">
                                <SelectValue placeholder="Crop" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {refs.crops.map((c) => (
                                <SelectItem
                                  key={c.id}
                                  value={c.id}
                                  className="min-h-11"
                                >
                                  {c.name}
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
                      name={`lines.${index}.grade`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Grade</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger className="h-11 w-full">
                                <SelectValue placeholder="Grade" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {GRADES.map((g) => (
                                <SelectItem
                                  key={g}
                                  value={g}
                                  className="min-h-11"
                                >
                                  {GRADE_LABELS[g]}
                                  {line?.cropId
                                    ? ` · ${kgFormat.format(available(line.cropId, g))} kg`
                                    : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {line?.cropId ? (
                    <p
                      className={
                        over
                          ? "text-status-danger flex items-start gap-1.5 text-sm"
                          : "text-muted-foreground text-sm"
                      }
                    >
                      {over ? (
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      ) : null}
                      {kgFormat.format(avail)} kg available in this store
                      {over ? " — not enough for this line." : "."}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name={`lines.${index}.kg`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Weight (kg)</FormLabel>
                          <FormControl>
                            <NumberInput
                              decimal
                              min={0}
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`lines.${index}.crates`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Crates{perCrate ? "" : " (optional)"}
                          </FormLabel>
                          <FormControl>
                            <NumberInput
                              decimal
                              min={0}
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name={`lines.${index}.priceBasis`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priced</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger className="h-11 w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {PRICE_BASES.map((b) => (
                                <SelectItem
                                  key={b}
                                  value={b}
                                  className="min-h-11"
                                >
                                  {PRICE_BASIS_LABELS[b]}
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
                      name={`lines.${index}.unitPrice`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Price {perCrate ? "per crate" : "per kg"} (₦)
                          </FormLabel>
                          <FormControl>
                            <Input
                              className="h-11"
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder="0.00"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <p className="text-muted-foreground flex justify-between text-sm">
                    <span>Line total</span>
                    <MoneyText kobo={totals[index]} className="text-foreground" />
                  </p>
                </fieldset>
              );
            })}
            {linesError ? (
              <p className="text-destructive text-sm">{linesError}</p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => append(emptyLine())}
              disabled={fields.length >= 50}
            >
              <Plus className="size-4" /> Add line
            </Button>
          </section>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (optional)</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} />
                </FormControl>
                <FormDescription>
                  Vehicle, driver, delivery address — kept for your records.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="bg-muted/50 flex items-center justify-between rounded-lg px-4 py-3">
            <span className="text-sm font-medium">Sale total</span>
            <MoneyText kobo={grandTotal} className="text-lg font-semibold" />
          </div>
          <Button
            type="submit"
            className="h-12 w-full text-base"
            disabled={form.formState.isSubmitting || noStores || noCrops}
          >
            {form.formState.isSubmitting ? "Saving sale…" : "Save sale"}
          </Button>
        </form>
      </Form>
      <NewCustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onCreated={(c) => {
          setCustomers((prev) =>
            [...prev, c].sort((a, b) => a.name.localeCompare(b.name)),
          );
          form.setValue("customerId", c.id, { shouldValidate: true });
        }}
      />
    </>
  );
}
