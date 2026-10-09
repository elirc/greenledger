"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { MoneyText } from "@/components/common/money-text";
import { QtyText } from "@/components/common/qty-text";
import { StatusBadge } from "@/components/common/status-badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatLagos, formatLagosDate } from "@/lib/dates";
import type { ApplicationDetail } from "../queries";
import { APPLICATION_TYPE_LABELS } from "../schema";

const volumeFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 });

function SafetyWindows({
  app,
  now,
  today,
}: {
  app: ApplicationDetail;
  /** ISO timestamp from the server so every viewer agrees. */
  now: string;
  /** yyyy-MM-dd Lagos date from the server. */
  today: string;
}) {
  if (app.type !== "spray") return null;
  if (!app.entrySafeAt && !app.harvestSafeDate) {
    return (
      <span className="text-muted-foreground text-xs">No PHI/REI on file</span>
    );
  }
  const entryActive =
    app.entrySafeAt !== null &&
    new Date(app.entrySafeAt).getTime() > new Date(now).getTime();
  const harvestActive =
    app.harvestSafeDate !== null && app.harvestSafeDate > today;
  return (
    <div className="flex flex-wrap gap-1.5">
      {app.entrySafeAt ? (
        <StatusBadge variant={entryActive ? "danger" : "neutral"}>
          Entry-safe {formatLagos(app.entrySafeAt, "dd MMM HH:mm")}
        </StatusBadge>
      ) : null}
      {app.harvestSafeDate ? (
        <StatusBadge variant={harvestActive ? "danger" : "neutral"}>
          Harvest-safe from {formatLagosDate(app.harvestSafeDate)}
        </StatusBadge>
      ) : null}
    </div>
  );
}

function TypeBadge({ type }: { type: ApplicationDetail["type"] }) {
  return (
    <StatusBadge variant={type === "spray" ? "warning" : "info"}>
      {APPLICATION_TYPE_LABELS[type]}
    </StatusBadge>
  );
}

/** Applications log: tap a row for the issued lines (item, qty, batch). */
export function ApplicationList({
  applications,
  canSeeMoney,
  now,
  today,
}: {
  applications: ApplicationDetail[];
  canSeeMoney: boolean;
  now: string;
  today: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = applications.find((a) => a.id === openId) ?? null;

  return (
    <>
      <ul className="divide-border divide-y rounded-lg border">
        {applications.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => setOpenId(a.id)}
              className="hover:bg-muted/50 flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {formatLagos(a.appliedAt, "dd MMM yyyy HH:mm")}
                  </span>
                  <TypeBadge type={a.type} />
                </div>
                <p className="text-sm">
                  {a.greenhouseName} · {a.cycleCode}
                </p>
                <p className="text-muted-foreground text-sm">
                  {a.recipeName ?? "Custom"} ·{" "}
                  {volumeFmt.format(a.waterVolumeLitres)} L ·{" "}
                  {a.operatorName ?? "Unknown operator"}
                </p>
                <SafetyWindows app={a} now={now} today={today} />
              </div>
              <ChevronRight className="text-muted-foreground size-5 shrink-0" />
            </button>
          </li>
        ))}
      </ul>

      <Sheet
        open={open !== null}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex flex-wrap items-center gap-2">
                  {APPLICATION_TYPE_LABELS[open.type]} ·{" "}
                  {formatLagos(open.appliedAt, "dd MMM yyyy HH:mm")}
                </SheetTitle>
                <SheetDescription>
                  {open.greenhouseName} · {open.cycleCode} ·{" "}
                  {open.recipeName ?? "Custom"} ·{" "}
                  {volumeFmt.format(open.waterVolumeLitres)} L
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Operator</dt>
                  <dd>{open.operatorName ?? "—"}</dd>
                  {open.type === "spray" ? (
                    <>
                      <dt className="text-muted-foreground">Entry-safe at</dt>
                      <dd>
                        {open.entrySafeAt
                          ? formatLagos(open.entrySafeAt, "dd MMM yyyy HH:mm")
                          : "No REI"}
                      </dd>
                      <dt className="text-muted-foreground">Harvest-safe from</dt>
                      <dd>
                        {open.harvestSafeDate
                          ? formatLagosDate(open.harvestSafeDate)
                          : "No PHI"}
                      </dd>
                    </>
                  ) : null}
                  {canSeeMoney ? (
                    <>
                      <dt className="text-muted-foreground">Input cost</dt>
                      <dd>
                        <MoneyText kobo={open.totalCostKobo} />
                      </dd>
                    </>
                  ) : null}
                </dl>
                {open.notes ? (
                  <p className="bg-muted/50 rounded-lg p-3 text-sm">
                    {open.notes}
                  </p>
                ) : null}

                <section className="space-y-2">
                  <h3 className="text-sm font-medium">Issued inputs</h3>
                  {open.lines.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No issued lines recorded.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Input</TableHead>
                            <TableHead>Batch</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            {canSeeMoney ? (
                              <TableHead className="text-right">Cost</TableHead>
                            ) : null}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {open.lines.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell className="whitespace-normal">
                                {l.itemName}
                                {open.type === "spray" &&
                                (l.phiDays !== null || l.reiHours !== null) ? (
                                  <span className="text-muted-foreground block text-xs">
                                    PHI {l.phiDays ?? 0} d · REI {l.reiHours ?? 0} h
                                  </span>
                                ) : null}
                              </TableCell>
                              <TableCell>{l.batchNumber}</TableCell>
                              <TableCell className="text-right">
                                <QtyText qty={l.quantity} unit={l.baseUnit} />
                              </TableCell>
                              {canSeeMoney ? (
                                <TableCell className="text-right">
                                  <MoneyText kobo={l.costKobo} />
                                </TableCell>
                              ) : null}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </section>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
