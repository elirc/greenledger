"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { formatLagosDate } from "@/lib/dates";
import { formatQty, UNIT_LABELS } from "@/lib/units";
import { NumberInput } from "@/modules/farm/components/number-input";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { postStockCount, saveStockCount } from "../actions";
import { roundQty } from "../logic";
import type { StockCountSheetLine } from "../queries";
import { saveStockCountSchema, type SaveStockCountInput } from "../schema";

/** Draft count sheet: big numeric inputs, save draft or post. */
export function CountSheet({
  countId,
  lines,
}: {
  countId: string;
  lines: StockCountSheetLine[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<"save" | "post" | null>(null);

  const form = useForm<SaveStockCountInput>({
    resolver: zodResolver(saveStockCountSchema),
    defaultValues: {
      id: countId,
      lines: lines.map((l) => ({
        batchId: l.batchId,
        countedQuantity: l.countedQuantity ?? undefined,
      })),
    },
  });
  const values = useWatch({ control: form.control, name: "lines" });
  const countedCount = values.filter((v) => v?.countedQuantity !== undefined).length;
  const q = filter.trim().toLowerCase();

  async function save(input: SaveStockCountInput) {
    setBusy("save");
    try {
      const result = await saveStockCount(input);
      if (result.ok) {
        toast.success(`Draft saved (${result.data.countedLines} counted)`);
        router.refresh();
        return;
      }
      applyActionError(form, result);
    } finally {
      setBusy(null);
    }
  }

  async function post(input: SaveStockCountInput) {
    setBusy("post");
    try {
      const result = await postStockCount(input);
      if (result.ok) {
        toast.success(
          result.data.adjustments === 0
            ? "Count posted — no differences"
            : `Count posted — ${result.data.adjustments} adjustment${result.data.adjustments === 1 ? "" : "s"}`,
        );
        router.refresh();
        return;
      }
      applyActionError(form, result);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(save)} className="space-y-4">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="h-11 pl-9"
            placeholder="Filter by item or batch"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <p className="text-muted-foreground text-sm">
          {countedCount} of {lines.length} lines counted. Lines left blank are
          not adjusted.
        </p>

        <ul className="space-y-3">
          {lines.map((line, i) => {
            if (
              q &&
              !line.itemName.toLowerCase().includes(q) &&
              !line.batchNumber.toLowerCase().includes(q)
            ) {
              return null;
            }
            const counted = values[i]?.countedQuantity;
            const diff =
              counted === undefined || Number.isNaN(counted)
                ? null
                : roundQty(counted - line.systemQuantity);
            return (
              <li key={line.batchId} className="bg-card rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{line.itemName}</p>
                    <p className="text-muted-foreground text-xs">
                      Batch {line.batchNumber} ·{" "}
                      {line.expiryDate
                        ? `exp ${formatLagosDate(line.expiryDate)}`
                        : "no expiry"}
                    </p>
                  </div>
                  {diff !== null && diff !== 0 ? (
                    <StatusBadge variant={diff < 0 ? "danger" : "warning"}>
                      {diff > 0 ? "+" : ""}
                      {formatQty(diff, line.baseUnit)}
                    </StatusBadge>
                  ) : diff === 0 ? (
                    <StatusBadge variant="success">Matches</StatusBadge>
                  ) : null}
                </div>
                <div className="mt-2 grid grid-cols-2 items-end gap-3">
                  <div>
                    <p className="text-muted-foreground text-xs">System</p>
                    <p className="text-lg tabular-nums">
                      {formatQty(line.systemQuantity, line.baseUnit)}
                    </p>
                  </div>
                  <FormField
                    control={form.control}
                    name={`lines.${i}.countedQuantity`}
                    render={({ field }) => (
                      <FormItem>
                        <p className="text-muted-foreground text-xs">
                          Counted ({UNIT_LABELS[line.baseUnit]})
                        </p>
                        <FormControl>
                          <NumberInput
                            decimal
                            min={0}
                            className="h-14 text-xl"
                            aria-label={`Counted ${line.itemName} batch ${line.batchNumber}`}
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
              </li>
            );
          })}
        </ul>

        <div className="bg-background/95 sticky bottom-16 z-10 grid grid-cols-2 gap-3 border-t py-3 lg:bottom-0">
          <Button
            type="submit"
            variant="outline"
            className="h-12"
            disabled={busy !== null}
          >
            {busy === "save" ? "Saving…" : "Save draft"}
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                type="button"
                className="h-12"
                disabled={busy !== null || countedCount === 0}
              >
                {busy === "post" ? "Posting…" : "Post count"}
              </Button>
            }
            title="Post this count?"
            description="Differences become adjustment movements and the count is locked. This cannot be undone — later corrections need a new count."
            confirmLabel="Post count"
            onConfirm={() => form.handleSubmit(post)()}
          />
        </div>
      </form>
    </Form>
  );
}
