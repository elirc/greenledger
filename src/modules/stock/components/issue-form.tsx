"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ScanQrCode, TriangleAlert } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScanSheet } from "@/components/scan/scan-sheet";
import { decodeScanText } from "@/components/scan/decode";
import { formatLagosDate } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { submitWithOfflineFallback } from "@/lib/offline/outbox";
import { useCachedRefs } from "@/lib/offline/ref-cache";
import { formatQty, UNIT_LABELS } from "@/lib/units";
import { NumberInput } from "@/modules/farm/components/number-input";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { issueStock } from "../actions";
import type { StockFormRefs } from "../queries";
import { issueStockSchema, type IssueStockInput } from "../schema";
import { ItemCombobox, type ItemOption } from "./item-combobox";
import {
  batchOnHandIn,
  batchesInStore,
  fefoPreview,
  isBatchExpired,
  itemOnHandIn,
  itemOnHandTotal,
} from "./ref-utils";

const NONE = "__none";

function expiryLabel(expiryDate: string | null): string {
  return expiryDate ? `exp ${formatLagosDate(expiryDate)}` : "no expiry";
}

export function IssueForm({
  refs: serverRefs,
  canOverride,
  initialBatchId,
  initialItemId,
}: {
  refs: StockFormRefs;
  /** Owner/manager: may issue expired stock with a reason. */
  canOverride: boolean;
  initialBatchId?: string;
  initialItemId?: string;
}) {
  const router = useRouter();
  const refs = useCachedRefs("issue-form-refs", serverRefs);
  const defaultStoreId =
    refs.stores.find((s) => s.isDefault)?.id ?? refs.stores[0]?.id ?? "";

  // Prefill from a scanned batch (/store/issue?batchId=&itemId=).
  const initialBatch = initialBatchId
    ? refs.batches.find((b) => b.id === initialBatchId)
    : undefined;
  const initialStoreId = initialBatch
    ? batchOnHandIn(initialBatch, defaultStoreId) > 0
      ? defaultStoreId
      : (Object.keys(initialBatch.stock).find(
          (sid) => batchOnHandIn(initialBatch, sid) > 0,
        ) ?? defaultStoreId)
    : defaultStoreId;

  const [manualBatch, setManualBatch] = useState(Boolean(initialBatch));
  const [overrideOn, setOverrideOn] = useState(false);
  const [expiredBlocked, setExpiredBlocked] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const form = useForm<IssueStockInput>({
    resolver: zodResolver(issueStockSchema),
    defaultValues: {
      clientId: newId(),
      storeId: initialStoreId,
      itemId: initialBatch?.itemId ?? initialItemId ?? "",
      batchId: initialBatch?.id,
      quantity: undefined,
      greenhouseId: undefined,
      cropCycleId: undefined,
      override: undefined,
    },
  });

  const [storeId, itemId, batchId, quantity, greenhouseId] = useWatch({
    control: form.control,
    name: ["storeId", "itemId", "batchId", "quantity", "greenhouseId"],
  });

  const item = refs.items.find((i) => i.id === itemId);
  const storeName = refs.stores.find((s) => s.id === storeId)?.name;

  const itemOptions: ItemOption[] = useMemo(
    () =>
      refs.items.map((i) => ({
        ...i,
        onHandInStore: storeId ? itemOnHandIn(refs.batches, i.id, storeId) : null,
        onHandTotal: itemOnHandTotal(refs.batches, i.id),
      })),
    [refs.items, refs.batches, storeId],
  );

  const storeBatches =
    itemId && storeId ? batchesInStore(refs.batches, itemId, storeId) : [];
  const chosenBatch = manualBatch
    ? storeBatches.find((b) => b.id === batchId)
    : undefined;

  const preview =
    !manualBatch && itemId && storeId && quantity && quantity > 0
      ? fefoPreview(refs.batches, itemId, storeId, quantity, overrideOn)
      : null;

  const needsExpiredOverride =
    (manualBatch && chosenBatch && isBatchExpired(chosenBatch)) ||
    (!manualBatch &&
      preview !== null &&
      (preview.shortfall > 0 || preview.allocations.length === 0) &&
      preview.expiredSkipped > 0) ||
    expiredBlocked;

  const cycles = refs.cycles.filter(
    (c) => !greenhouseId || c.greenhouseId === greenhouseId,
  );

  function setOverride(on: boolean) {
    setOverrideOn(on);
    form.setValue("override", on ? { reason: "" } : undefined);
  }

  function handleScan(text: string) {
    const decoded = decodeScanText(text);
    if (!decoded) {
      toast.error("That is not a GreenLedger label.");
      return;
    }
    if (decoded.kind !== "batch") {
      toast.error("That label is not an input batch.");
      return;
    }
    const batch = refs.batches.find((b) => b.id === decoded.id);
    if (!batch) {
      toast.error("Batch not found on this farm.");
      return;
    }
    setScanOpen(false);
    const currentStore = form.getValues("storeId");
    const store =
      batchOnHandIn(batch, currentStore) > 0
        ? currentStore
        : Object.keys(batch.stock).find((sid) => batchOnHandIn(batch, sid) > 0);
    if (!store) {
      toast.error(`Batch ${batch.batchNumber} has no stock left.`);
      return;
    }
    form.setValue("storeId", store);
    form.setValue("itemId", batch.itemId, { shouldValidate: true });
    setManualBatch(true);
    form.setValue("batchId", batch.id);
    setExpiredBlocked(false);
    toast.success(`Batch ${batch.batchNumber} selected`);
  }

  async function onSubmit(values: IssueStockInput) {
    const payload: IssueStockInput = {
      ...values,
      batchId: manualBatch ? values.batchId : undefined,
      override: overrideOn ? values.override : undefined,
    };
    if (manualBatch && !payload.batchId) {
      form.setError("batchId", { message: "Pick a batch" });
      return;
    }
    const resetAfterSave = () => {
      form.reset({
        clientId: newId(),
        storeId: values.storeId,
        itemId: "",
        batchId: undefined,
        quantity: undefined,
        greenhouseId: values.greenhouseId,
        cropCycleId: values.cropCycleId,
        override: undefined,
      });
      setManualBatch(false);
      setOverrideOn(false);
      setExpiredBlocked(false);
    };
    const outcome = await submitWithOfflineFallback(
      issueStock,
      "stock.issue",
      payload.clientId,
      payload,
    );
    if (outcome.kind === "queued") {
      toast.success("Saved on this phone — will sync");
      resetAfterSave();
      return;
    }
    const result = outcome.result;
    if (result.ok) {
      const unit = item?.baseUnit;
      const parts = result.data.allocations.map((a) => {
        const b = refs.batches.find((x) => x.id === a.batchId);
        return `${unit ? formatQty(a.quantity, unit) : a.quantity} from ${b?.batchNumber ?? "batch"}`;
      });
      toast.success(`Issued ${parts.join(", ")}`);
      resetAfterSave();
      router.refresh();
      return;
    }
    if (result.code === "EXPIRED_BATCH") setExpiredBlocked(true);
    if (result.code === "INSUFFICIENT_STOCK" || result.code === "NO_STOCK") {
      form.setError("quantity", { message: result.error });
    }
    if (result.code === "FORBIDDEN_OVERRIDE") setOverride(false);
    applyActionError(form, result);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Button
          type="button"
          variant="secondary"
          className="h-12 w-full text-base"
          onClick={() => setScanOpen(true)}
        >
          <ScanQrCode className="size-5" /> Scan batch label
        </Button>

        <FormField
          control={form.control}
          name="storeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>From store</FormLabel>
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  form.setValue("batchId", undefined);
                  setExpiredBlocked(false);
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

        <FormField
          control={form.control}
          name="itemId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Item</FormLabel>
              <FormControl>
                <ItemCombobox
                  options={itemOptions}
                  value={field.value || undefined}
                  storeName={storeName}
                  onChange={(id) => {
                    field.onChange(id);
                    form.setValue("batchId", undefined);
                    setExpiredBlocked(false);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Quantity{item ? ` (${UNIT_LABELS[item.baseUnit]})` : ""}
              </FormLabel>
              <FormControl>
                <NumberInput
                  decimal
                  className="h-12 text-lg"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              {item && storeId ? (
                <FormDescription>
                  {formatQty(
                    itemOnHandIn(refs.batches, item.id, storeId),
                    item.baseUnit,
                  )}{" "}
                  on hand in {storeName ?? "this store"}
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="rounded-lg border px-3 py-2">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Choose batch myself</p>
              <p className="text-muted-foreground text-xs">
                Off = earliest expiry first (FEFO).
              </p>
            </div>
            <Switch
              checked={manualBatch}
              onCheckedChange={(on) => {
                setManualBatch(on);
                if (!on) form.setValue("batchId", undefined);
                setExpiredBlocked(false);
              }}
              aria-label="Choose batch myself"
            />
          </div>
          {manualBatch ? (
            <FormField
              control={form.control}
              name="batchId"
              render={({ field }) => (
                <FormItem className="mt-2">
                  <Select
                    value={field.value ?? ""}
                    onValueChange={(v) => {
                      field.onChange(v);
                      setExpiredBlocked(false);
                    }}
                    disabled={!itemId || storeBatches.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue
                          placeholder={
                            itemId && storeBatches.length === 0
                              ? "No batches with stock here"
                              : "Pick a batch"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {storeBatches.map((b) => (
                        <SelectItem key={b.id} value={b.id} className="min-h-11">
                          {b.batchNumber} · {expiryLabel(b.expiryDate)} ·{" "}
                          {item
                            ? formatQty(batchOnHandIn(b, storeId), item.baseUnit)
                            : batchOnHandIn(b, storeId)}
                          {isBatchExpired(b) ? " · EXPIRED" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </div>

        {preview && item ? (
          <div
            className="bg-muted/50 rounded-lg border p-3 text-sm"
            aria-live="polite"
          >
            {preview.allocations.length === 0 ? (
              <p className="text-destructive">
                No usable stock of {item.name} in {storeName}.
              </p>
            ) : preview.allocations.length === 1 ? (
              <p>
                Will issue from batch{" "}
                <span className="font-medium">
                  {preview.allocations[0].batch.batchNumber}
                </span>
                , {expiryLabel(preview.allocations[0].batch.expiryDate)}
              </p>
            ) : (
              <div>
                <p>Will issue from {preview.allocations.length} batches:</p>
                <ul className="mt-1 list-disc pl-5">
                  {preview.allocations.map((a) => (
                    <li key={a.batch.id}>
                      {formatQty(a.quantity, item.baseUnit)} from{" "}
                      <span className="font-medium">{a.batch.batchNumber}</span>,{" "}
                      {expiryLabel(a.batch.expiryDate)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.shortfall > 0 && preview.allocations.length > 0 ? (
              <p className="text-destructive mt-1">
                Short by {formatQty(preview.shortfall, item.baseUnit)}.
              </p>
            ) : null}
            {preview.expiredSkipped > 0 ? (
              <p className="text-muted-foreground mt-1">
                {formatQty(preview.expiredSkipped, item.baseUnit)} of expired
                stock is held back.
              </p>
            ) : null}
          </div>
        ) : null}

        {needsExpiredOverride ? (
          canOverride ? (
            <div className="border-status-warning/40 bg-status-warning/10 rounded-lg border px-3 py-2">
              <div className="flex min-h-11 items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Override: issue expired stock</p>
                  <p className="text-muted-foreground text-xs">
                    Recorded with your reason in the audit log.
                  </p>
                </div>
                <Switch
                  checked={overrideOn}
                  onCheckedChange={setOverride}
                  aria-label="Override expired stock"
                />
              </div>
              {overrideOn ? (
                <FormField
                  control={form.control}
                  name="override.reason"
                  render={({ field }) => (
                    <FormItem className="mt-2">
                      <FormLabel>Reason</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={2}
                          placeholder="e.g. Supplier confirmed product still effective"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
            </div>
          ) : (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" />
              <AlertTitle>Expired stock</AlertTitle>
              <AlertDescription>
                Only an owner or farm manager can issue expired stock. Ask them
                to override, or choose another batch.
              </AlertDescription>
            </Alert>
          )
        ) : null}

        <FormField
          control={form.control}
          name="greenhouseId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>To greenhouse (optional)</FormLabel>
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) => {
                  field.onChange(v === NONE ? undefined : v);
                  form.setValue("cropCycleId", undefined);
                }}
              >
                <FormControl>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NONE} className="min-h-11">
                    Not for a greenhouse
                  </SelectItem>
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
              <FormLabel>Crop cycle (optional)</FormLabel>
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) => {
                  const id = v === NONE ? undefined : v;
                  field.onChange(id);
                  const cycle = refs.cycles.find((c) => c.id === id);
                  if (cycle && !form.getValues("greenhouseId")) {
                    form.setValue("greenhouseId", cycle.greenhouseId);
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
                    No crop cycle
                  </SelectItem>
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

        <Button
          type="submit"
          className="h-12 w-full text-base"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Issuing…" : "Issue stock"}
        </Button>
      </form>

      <ScanSheet
        open={scanOpen}
        onOpenChange={setScanOpen}
        onResult={handleScan}
      />
    </Form>
  );
}
