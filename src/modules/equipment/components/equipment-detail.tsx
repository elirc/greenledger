import Link from "next/link";
import { CalendarClock, Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { MoneyText } from "@/components/common/money-text";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { formatLagosDate } from "@/lib/dates";
import { dueBadge, EQUIPMENT_STATUS_VARIANTS } from "../logic";
import type { EquipmentDetail } from "../queries";
import { EQUIPMENT_STATUS_LABELS, equipmentCategoryLabel } from "../schema";

/** yyyy-MM-dd (Lagos calendar date) → "dd MMM yyyy". Noon UTC = same Lagos day. */
const fmtDate = (d: string) => formatLagosDate(`${d}T12:00:00Z`);

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export function EquipmentFacts({
  eq,
  showMoney,
}: {
  eq: EquipmentDetail;
  showMoney: boolean;
}) {
  return (
    <SectionCard
      title="Details"
      action={
        <StatusBadge variant={EQUIPMENT_STATUS_VARIANTS[eq.status]}>
          {EQUIPMENT_STATUS_LABELS[eq.status]}
        </StatusBadge>
      }
    >
      <dl className="divide-border divide-y">
        <Fact label="Category">{equipmentCategoryLabel(eq.category)}</Fact>
        <Fact label="Location">
          {[eq.siteName, eq.greenhouseName, eq.locationNote]
            .filter(Boolean)
            .join(" · ") || "—"}
        </Fact>
        <Fact label="Serial number">{eq.serialNumber ?? "—"}</Fact>
        <Fact label="Purchased">
          {eq.purchaseDate ? fmtDate(eq.purchaseDate) : "—"}
        </Fact>
        {showMoney ? (
          <Fact label="Cost">
            <MoneyText kobo={eq.costKobo} />
          </Fact>
        ) : null}
      </dl>
      {eq.notes ? (
        <p className="text-muted-foreground mt-2 text-sm whitespace-pre-line">
          {eq.notes}
        </p>
      ) : null}
    </SectionCard>
  );
}

export function ScheduleSection({
  eq,
  today,
}: {
  eq: EquipmentDetail;
  today: string;
}) {
  return (
    <SectionCard
      title="Maintenance schedules"
      action={
        <Button asChild variant="outline" className="h-11">
          <Link href={`/equipment/${eq.id}/schedules/new`}>
            <Plus className="size-4" /> Add
          </Link>
        </Button>
      }
    >
      {eq.schedules.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No schedules"
          description="Add a recurring service (e.g. every 90 days) to get reminders and auto-created tasks."
        />
      ) : (
        <ul className="divide-border -mx-2 divide-y">
          {eq.schedules.map((s) => {
            const badge = dueBadge(s.nextDueDate, today, s.isActive);
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 px-2 py-2"
              >
                <Link
                  href={`/equipment/${eq.id}/schedules/${s.id}`}
                  className="flex min-h-11 min-w-0 flex-1 flex-col justify-center"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground text-sm">
                    Every {s.intervalDays} d · next {fmtDate(s.nextDueDate)}
                    {s.lastDoneDate ? ` · last ${fmtDate(s.lastDoneDate)}` : ""}
                  </span>
                </Link>
                <span className="flex items-center gap-2">
                  <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
                  {s.isActive ? (
                    <Button asChild size="sm" className="h-11">
                      <Link href={`/equipment/${eq.id}/log?schedule=${s.id}`}>
                        Log work
                      </Link>
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

export function WorkHistory({
  eq,
  showMoney,
}: {
  eq: EquipmentDetail;
  showMoney: boolean;
}) {
  return (
    <SectionCard
      title="Work history"
      action={
        <Button asChild variant="outline" className="h-11">
          <Link href={`/equipment/${eq.id}/log`}>
            <Wrench className="size-4" /> Log work
          </Link>
        </Button>
      }
    >
      {eq.logs.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">
          No work logged yet.
        </p>
      ) : (
        <ul className="divide-border -mx-2 divide-y">
          {eq.logs.map((l) => (
            <li key={l.id} className="space-y-0.5 px-2 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{fmtDate(l.doneDate)}</span>
                {showMoney && l.costKobo ? (
                  <MoneyText kobo={l.costKobo} className="text-sm" />
                ) : null}
              </div>
              <p className="text-sm">{l.description}</p>
              <p className="text-muted-foreground text-xs">
                {[l.scheduleName ?? "Unscheduled", l.doneByName]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {l.notes ? (
                <p className="text-muted-foreground text-xs whitespace-pre-line">
                  {l.notes}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
