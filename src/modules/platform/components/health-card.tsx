import { Activity } from "lucide-react";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { formatLagos } from "@/lib/dates";
import type { getSystemHealth } from "../queries";

type Health = Awaited<ReturnType<typeof getSystemHealth>>;

/** DB round-trip, last webhook and last pg-boss runs per queue (when readable). */
export function HealthCard({ health }: { health: Health }) {
  return (
    <SectionCard
      title="System health"
      action={
        <StatusBadge variant={health.dbOk ? "success" : "danger"}>
          <Activity className="size-3.5" />
          {health.dbOk ? "DB ok" : "DB down"}
        </StatusBadge>
      }
    >
      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Database round-trip</dt>
          <dd className="tabular-nums">{health.dbOk ? `${health.dbLatencyMs} ms` : health.dbError}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Last webhook</dt>
          <dd className="text-right">
            {health.lastWebhook
              ? `${health.lastWebhook.eventType} · ${formatLagos(health.lastWebhook.createdAt)}${health.lastWebhook.error ? " (error)" : ""}`
              : "None yet"}
          </dd>
        </div>
      </dl>
      {health.jobs ? (
        <div className="mt-3">
          <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
            Background jobs
          </p>
          {health.jobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No job runs recorded yet.</p>
          ) : (
            <ul className="divide-border divide-y rounded-lg border text-sm">
              {health.jobs.map((j) => (
                <li key={j.name} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="font-mono text-xs">{j.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {j.lastCompletedAt ? `ok ${formatLagos(j.lastCompletedAt)}` : "never completed"}
                    {j.lastFailedAt ? ` · failed ${formatLagos(j.lastFailedAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}
