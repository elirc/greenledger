import Link from "next/link";
import { ChevronRight, Sprout } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { GREENHOUSE_TYPE_LABELS } from "@/modules/farm/schema";
import type { GreenhouseCardRow } from "../queries";
import { CycleStatusBadge } from "./cycle-status-badge";
import { SafetyChips } from "./safety-chips";

const numberFmt = new Intl.NumberFormat("en-NG");

export function GreenhouseCard({
  greenhouse: gh,
  now,
  today,
}: {
  greenhouse: GreenhouseCardRow;
  now: string;
  today: string;
}) {
  return (
    <Link
      href={`/greenhouses/${gh.id}`}
      className="bg-card hover:bg-muted/40 flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{gh.name}</span>
            {!gh.isActive ? (
              <StatusBadge variant="neutral">Inactive</StatusBadge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">
            {GREENHOUSE_TYPE_LABELS[gh.type]} ·{" "}
            {numberFmt.format(gh.areaM2)} m²
          </p>
        </div>
        <ChevronRight className="text-muted-foreground mt-1 size-5 shrink-0" />
      </div>

      {gh.activeCycles.length === 0 ? (
        <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
          <Sprout className="size-4" aria-hidden /> Empty — no active cycle
        </div>
      ) : (
        <ul className="space-y-2">
          {gh.activeCycles.map((c) => (
            <li
              key={c.id}
              className="bg-muted/40 flex items-center justify-between gap-2 rounded-lg px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {c.cropName} · {c.varietyName}
                </p>
                <p className="text-muted-foreground text-sm tabular-nums">
                  {numberFmt.format(c.plantsAlive)} plants alive
                </p>
              </div>
              <CycleStatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      )}

      <SafetyChips
        entrySafeAt={gh.entrySafeAt}
        harvestSafeDate={gh.harvestSafeDate}
        now={now}
        today={today}
      />
    </Link>
  );
}
