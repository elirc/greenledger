"use client";

import { useMemo, useState } from "react";
import { Printer, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { QtyText } from "@/components/common/qty-text";
import { formatLagosDate } from "@/lib/dates";
import type { BaseUnit } from "@/lib/units";

export interface LabelPickerBatch {
  batchId: string;
  batchNumber: string;
  itemName: string;
  baseUnit: BaseUnit;
  expiryDate: string | null;
  onHand: number;
}

/** The label route caps a sheet run at 220 labels and 44 copies per batch. */
const MAX_LABELS = 220;
const COPY_OPTIONS = [1, 2, 4, 6, 11, 22, 44] as const;

export function LabelPicker({ batches }: { batches: LabelPickerBatch[] }) {
  const [search, setSearch] = useState("");
  const [copies, setCopies] = useState<string>("6");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return batches;
    return batches.filter(
      (b) =>
        b.itemName.toLowerCase().includes(q) ||
        b.batchNumber.toLowerCase().includes(q),
    );
  }, [batches, search]);

  const maxBatches = Math.max(1, Math.floor(MAX_LABELS / Number(copies)));

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function print() {
    if (selected.size === 0) return;
    if (selected.size > maxBatches) {
      toast.error(
        `Too many labels: pick at most ${maxBatches} batches at ${copies} copies each.`,
      );
      return;
    }
    const params = new URLSearchParams({
      batchIds: [...selected].join(","),
      copies,
    });
    window.open(`/api/pdf/label?${params.toString()}`, "_blank", "noopener");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="search"
          placeholder="Search item or batch number"
          aria-label="Search batches"
          className="h-11 sm:flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={copies} onValueChange={setCopies}>
          <SelectTrigger className="h-11 w-full sm:w-44" aria-label="Copies per batch">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COPY_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} {n === 1 ? "copy" : "copies"} each
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No matching batches"
          description="Try another item name or batch number."
        />
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {filtered.map((b) => {
            const id = `label-${b.batchId}`;
            const checked = selected.has(b.batchId);
            return (
              <li key={b.batchId}>
                <label
                  htmlFor={id}
                  className="hover:bg-muted/50 flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2"
                >
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(v) => toggle(b.batchId, v === true)}
                    className="size-5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{b.itemName}</div>
                    <div className="text-muted-foreground text-sm">
                      Batch {b.batchNumber}
                      {" · "}
                      {b.expiryDate
                        ? `exp ${formatLagosDate(`${b.expiryDate}T12:00:00Z`)}`
                        : "no expiry"}
                    </div>
                  </div>
                  <QtyText
                    qty={b.onHand}
                    unit={b.baseUnit}
                    className="text-muted-foreground shrink-0 text-sm"
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="bg-background/95 border-border sticky bottom-20 z-10 rounded-lg border px-3 py-2 backdrop-blur lg:bottom-4">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground flex-1 text-sm">
            {selected.size === 0
              ? "No batches selected"
              : `${selected.size} selected · ${selected.size * Number(copies)} labels`}
          </span>
          {selected.size > 0 ? (
            <Button
              variant="ghost"
              className="h-11"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          ) : null}
          <Button
            className="h-11"
            disabled={selected.size === 0}
            onClick={print}
          >
            <Printer className="size-4" /> Print labels
          </Button>
        </div>
      </div>
    </div>
  );
}
