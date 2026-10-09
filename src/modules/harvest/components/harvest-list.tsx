import Link from "next/link";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { formatLagos } from "@/lib/dates";
import type { HarvestLineView, HarvestSummary } from "../queries";
import { GRADE_SHORT } from "../schema";

const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 });

/** "A 120 kg · B 30 kg · Rej 4 kg" */
export function gradesSummary(lines: HarvestLineView[]): string {
  if (lines.length === 0) return "No grade lines";
  return lines.map((l) => `${GRADE_SHORT[l.grade]} ${kgFmt.format(l.kg)} kg`).join(" · ");
}

export function PhiOverrideBadge() {
  return (
    <StatusBadge variant="danger">
      <ShieldAlert className="size-3.5" aria-hidden />
      PHI override
    </StatusBadge>
  );
}

/** Harvest rows (date, cycle, grades summary, override badge) → detail. */
export function HarvestList({
  harvests,
  showGreenhouse = true,
}: {
  harvests: HarvestSummary[];
  showGreenhouse?: boolean;
}) {
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {harvests.map((h) => (
        <li key={h.id}>
          <Link
            href={`/harvest/${h.id}`}
            className="hover:bg-muted/50 flex min-h-14 w-full items-center gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {formatLagos(h.harvestedAt, "dd MMM yyyy HH:mm")}
                </span>
                <span className="text-sm tabular-nums">{kgFmt.format(h.totalKg)} kg</span>
                {h.phiOverride ? <PhiOverrideBadge /> : null}
              </div>
              <p className="text-sm">
                {showGreenhouse ? `${h.greenhouseName} · ` : ""}
                {h.cycleCode} · {h.cropName} {h.varietyName}
              </p>
              <p className="text-muted-foreground text-sm">{gradesSummary(h.lines)}</p>
            </div>
            <ChevronRight className="text-muted-foreground size-5 shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
