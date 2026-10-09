"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, SearchX } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatLagosDate } from "@/lib/dates";
// Type-only import: erased at build, so no server code reaches the client.
import type { CycleListRow } from "../queries";
import { ACTIVE_CYCLE_STATUSES } from "../status";
import { CycleStatusBadge } from "./cycle-status-badge";

const ALL = "all";
const numberFmt = new Intl.NumberFormat("en-NG");

type TabKey = "active" | "planned" | "closed";

function tabOf(row: CycleListRow): TabKey {
  if (row.status === "planned") return "planned";
  if (row.status === "closed") return "closed";
  return ACTIVE_CYCLE_STATUSES.includes(row.status) ? "active" : "closed";
}

function CycleCard({ row }: { row: CycleListRow }) {
  const status = row.status;
  return (
    <li>
      <Link
        href={`/cycles/${row.id}`}
        className="bg-card hover:bg-muted/40 flex items-center gap-3 rounded-xl border p-4"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{row.code}</span>
            <CycleStatusBadge status={status} />
          </div>
          <p className="truncate text-sm">
            {row.cropName} · {row.varietyName}
            <span className="text-muted-foreground"> — {row.greenhouseName}</span>
          </p>
          <dl className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
            {status === "planned" ? (
              <div className="col-span-2">
                <dt className="inline">Sow: </dt>
                <dd className="inline">
                  {row.sowDate ? formatLagosDate(row.sowDate) : "—"}
                </dd>
              </div>
            ) : (
              <>
                <div>
                  <dt className="inline">Alive: </dt>
                  <dd className="text-foreground inline font-medium tabular-nums">
                    {numberFmt.format(row.plantsAlive)}
                  </dd>
                </div>
                <div>
                  <dt className="inline">Planted: </dt>
                  <dd className="inline">
                    {row.transplantDate
                      ? formatLagosDate(row.transplantDate)
                      : "—"}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="inline">
                    {status === "closed" ? "Closed: " : "First harvest: "}
                  </dt>
                  <dd className="inline">
                    {status === "closed"
                      ? row.closedAt
                        ? formatLagosDate(row.closedAt)
                        : "—"
                      : row.expectedFirstHarvest
                        ? formatLagosDate(row.expectedFirstHarvest)
                        : "—"}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>
        <ChevronRight className="text-muted-foreground size-5 shrink-0" />
      </Link>
    </li>
  );
}

export function CycleList({
  rows,
  greenhouses,
  initialGreenhouseId,
}: {
  rows: CycleListRow[];
  greenhouses: { id: string; name: string }[];
  initialGreenhouseId?: string;
}) {
  const [greenhouseId, setGreenhouseId] = useState<string>(
    initialGreenhouseId &&
      greenhouses.some((g) => g.id === initialGreenhouseId)
      ? initialGreenhouseId
      : ALL,
  );

  const grouped = useMemo(() => {
    const out: Record<TabKey, CycleListRow[]> = {
      active: [],
      planned: [],
      closed: [],
    };
    for (const r of rows) {
      if (greenhouseId !== ALL && r.greenhouseId !== greenhouseId) continue;
      out[tabOf(r)].push(r);
    }
    return out;
  }, [rows, greenhouseId]);

  const tabs: { key: TabKey; label: string; empty: string }[] = [
    { key: "active", label: "Active", empty: "No active cycles" },
    { key: "planned", label: "Planned", empty: "No planned cycles" },
    { key: "closed", label: "Closed", empty: "No closed cycles" },
  ];

  return (
    <div className="space-y-3">
      {greenhouses.length > 1 ? (
        <Select value={greenhouseId} onValueChange={setGreenhouseId}>
          <SelectTrigger
            className="h-11 w-full sm:w-64"
            aria-label="Filter by greenhouse"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="min-h-11">
              All greenhouses
            </SelectItem>
            {greenhouses.map((g) => (
              <SelectItem key={g.id} value={g.id} className="min-h-11">
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Tabs defaultValue="active" className="gap-4">
        <TabsList className="h-11 w-full group-data-horizontal/tabs:h-11">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="min-h-10">
              {t.label} ({grouped[t.key].length})
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            {grouped[t.key].length === 0 ? (
              <EmptyState
                icon={SearchX}
                title={t.empty}
                description={
                  greenhouseId === ALL
                    ? undefined
                    : "Try another greenhouse or show all."
                }
              />
            ) : (
              <ul className="space-y-2">
                {grouped[t.key].map((r) => (
                  <CycleCard key={r.id} row={r} />
                ))}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
