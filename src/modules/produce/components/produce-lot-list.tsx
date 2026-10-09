"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatLagosDate } from "@/lib/dates";
import { GRADE_LABELS } from "@/modules/harvest/schema";
import type { ProduceLotRow, ProduceStoreOption } from "../queries";
import { BestBeforeChip } from "./best-before-chip";
import { ProduceTransferForm } from "./transfer-form";
import { WasteForm } from "./waste-form";

const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 });

type Mode = "waste" | "transfer";

function LotRow({
  row,
  today,
  onAction,
}: {
  row: ProduceLotRow;
  today: string;
  onAction: (mode: Mode, row: ProduceLotRow) => void;
}) {
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">
            {row.varietyName} · {row.storeName}
          </p>
          <p className="text-muted-foreground text-sm">
            Harvested {formatLagosDate(row.harvestedAt)} · {row.ageDays} d old
          </p>
        </div>
        <span className="shrink-0 text-lg font-semibold tabular-nums">
          {kgFmt.format(row.onHandKg)} kg
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BestBeforeChip bestBeforeDate={row.bestBeforeDate} today={today} />
        {row.cycleId ? (
          <Link
            href={`/cycles/${row.cycleId}`}
            className="text-muted-foreground inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            {row.cycleCode}
            {row.greenhouseName ? ` · ${row.greenhouseName}` : ""}
          </Link>
        ) : null}
        {row.harvestId ? (
          <Link
            href={`/harvest/${row.harvestId}`}
            className="text-muted-foreground inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            Harvest
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => onAction("waste", row)}
        >
          <Trash2 className="size-4" /> Waste
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => onAction("transfer", row)}
        >
          <ArrowRightLeft className="size-4" /> Move
        </Button>
      </div>
    </li>
  );
}

/**
 * Produce lots with stock (one row per lot per store). `grouped` groups by
 * crop + grade with a kg total per group. Waste / Move open a dialog.
 */
export function ProduceLotList({
  rows,
  stores,
  today,
  grouped = true,
}: {
  rows: ProduceLotRow[];
  stores: ProduceStoreOption[];
  /** Lagos yyyy-MM-dd from the server. */
  today: string;
  grouped?: boolean;
}) {
  const [active, setActive] = useState<{ mode: Mode; row: ProduceLotRow } | null>(null);
  const onAction = (mode: Mode, row: ProduceLotRow) => setActive({ mode, row });

  const groups = new Map<string, { title: string; rows: ProduceLotRow[] }>();
  if (grouped) {
    for (const r of rows) {
      const key = `${r.cropId}:${r.grade}`;
      const g = groups.get(key) ?? {
        title: `${r.cropName} · ${GRADE_LABELS[r.grade]}`,
        rows: [],
      };
      g.rows.push(r);
      groups.set(key, g);
    }
  }

  return (
    <>
      {grouped ? (
        <div className="space-y-4">
          {[...groups.entries()]
            .sort((a, b) => a[1].title.localeCompare(b[1].title))
            .map(([key, g]) => (
              <section key={key} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold">{g.title}</h2>
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {kgFmt.format(g.rows.reduce((a, r) => a + r.onHandKg, 0))} kg
                  </span>
                </div>
                <ul className="divide-border divide-y rounded-lg border">
                  {g.rows.map((r) => (
                    <LotRow key={r.key} row={r} today={today} onAction={onAction} />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {rows.map((r) => (
            <LotRow key={r.key} row={r} today={today} onAction={onAction} />
          ))}
        </ul>
      )}

      <Dialog
        open={active !== null}
        onOpenChange={(o) => {
          if (!o) setActive(null);
        }}
      >
        <DialogContent>
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {active.mode === "waste" ? "Record waste" : "Move produce"}
                </DialogTitle>
                <DialogDescription>
                  {active.row.cropName} {active.row.varietyName} ·{" "}
                  {GRADE_LABELS[active.row.grade]} · harvested{" "}
                  {formatLagosDate(active.row.harvestedAt)}
                </DialogDescription>
              </DialogHeader>
              {active.mode === "waste" ? (
                <WasteForm
                  key={active.row.key}
                  row={active.row}
                  onDone={() => setActive(null)}
                />
              ) : (
                <ProduceTransferForm
                  key={active.row.key}
                  row={active.row}
                  stores={stores}
                  onDone={() => setActive(null)}
                />
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
