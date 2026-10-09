import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatLagosDate } from "@/lib/dates";
import { availableSeedlings } from "../logic";
import type { NurseryBatchListRow } from "../queries";
import { NurseryStatusBadge } from "./nursery-status-badge";

const numberFmt = new Intl.NumberFormat("en-NG");

function ageLabel(days: number): string {
  if (days <= 0) return "Sown today";
  return `Day ${days}`;
}

function BatchRow({ b }: { b: NurseryBatchListRow }) {
  const open = b.status === "open";
  return (
    <li>
      <Link
        href={`/nursery/${b.id}`}
        className="hover:bg-muted/50 flex min-h-16 items-center gap-3 px-4 py-2"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{b.varietyName}</span>
            <span className="text-muted-foreground text-sm">{b.cropName}</span>
            <NurseryStatusBadge status={b.status} />
          </div>
          <span className="text-muted-foreground text-sm">
            {open ? `${ageLabel(b.ageDays)} · ` : ""}
            Sown {formatLagosDate(b.sowDate)} ·{" "}
            {numberFmt.format(b.seedsSown)} seeds
            {open
              ? ` · ${numberFmt.format(availableSeedlings(b))} in trays`
              : ` · ${numberFmt.format(b.transplanted)} transplanted`}
          </span>
        </div>
        <ChevronRight className="text-muted-foreground size-5 shrink-0" />
      </Link>
    </li>
  );
}

/** Open batches first (with age since sowing), then finished ones. */
export function NurseryBatchList({
  batches,
}: {
  batches: NurseryBatchListRow[];
}) {
  const open = batches.filter((b) => b.status === "open");
  const finished = batches.filter((b) => b.status !== "open");

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-muted-foreground text-sm font-medium">
          Open ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
            No open batches right now.
          </p>
        ) : (
          <ul className="divide-border divide-y rounded-lg border">
            {open.map((b) => (
              <BatchRow key={b.id} b={b} />
            ))}
          </ul>
        )}
      </section>
      {finished.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-medium">
            Finished ({finished.length})
          </h2>
          <ul className="divide-border divide-y rounded-lg border">
            {finished.map((b) => (
              <BatchRow key={b.id} b={b} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
