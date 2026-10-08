"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, SearchX } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { MoneyText } from "@/components/common/money-text";
import { QtyText } from "@/components/common/qty-text";
import {
  StatusBadge,
  type StatusVariant,
} from "@/components/common/status-badge";
import { formatLagosDate } from "@/lib/dates";
// Type-only import: erased at build, so no server code reaches the client.
import type { StockListRow } from "@/modules/stock/stock-queries";

const CATEGORY_LABELS: Record<StockListRow["category"], string> = {
  seed: "Seeds",
  growing_media: "Growing media",
  fertiliser: "Fertilisers",
  agrochemical: "Agrochemicals",
  packaging: "Packaging",
  consumable: "Consumables",
  spare_part: "Spare parts",
};

const ALL = "all";

function expiryChip(
  expiryDate: string,
  today: string,
): { variant: StatusVariant; label: string } {
  const days = Math.round(
    (Date.parse(`${expiryDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  if (days < 0) return { variant: "danger", label: "Expired" };
  if (days < 30) return { variant: "danger", label: `${days}d left` };
  if (days <= 60) return { variant: "warning", label: `${days}d left` };
  return { variant: "neutral", label: `${days}d left` };
}

export function StockList({
  rows,
  today,
  showValue,
}: {
  rows: StockListRow[];
  /** yyyy-MM-dd Lagos date from the server (avoids client clock skew). */
  today: string;
  showValue: boolean;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);

  const categories = useMemo(
    () =>
      (Object.keys(CATEGORY_LABELS) as StockListRow["category"][]).filter(
        (c) => rows.some((r) => r.category === c),
      ),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (category === ALL || r.category === category) &&
        (q === "" || r.name.toLowerCase().includes(q)),
    );
  }, [rows, search, category]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="search"
          placeholder="Search items"
          aria-label="Search items"
          className="h-11 sm:flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger
            className="h-11 w-full sm:w-52"
            aria-label="Filter by category"
          >
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No matching items"
          description="Try a different search or category."
        />
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {filtered.map((r) => {
            const chip = r.nextExpiryDate
              ? expiryChip(r.nextExpiryDate, today)
              : null;
            return (
              <li key={r.id}>
                <Link
                  href={`/store/items/${r.id}`}
                  className="hover:bg-muted/50 flex min-h-16 items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{r.name}</span>
                      {r.belowReorder ? (
                        <StatusBadge variant="warning">Reorder</StatusBadge>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span>{CATEGORY_LABELS[r.category]}</span>
                      {r.nextExpiryDate && chip ? (
                        <span className="flex items-center gap-1.5">
                          Next expiry {formatLagosDate(`${r.nextExpiryDate}T12:00:00Z`)}
                          <StatusBadge variant={chip.variant}>
                            {chip.label}
                          </StatusBadge>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                    <QtyText
                      qty={r.onHand}
                      unit={r.baseUnit}
                      className="font-medium"
                    />
                    {showValue ? (
                      <MoneyText
                        kobo={r.stockValueKobo}
                        className="text-muted-foreground text-sm"
                      />
                    ) : null}
                  </div>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
