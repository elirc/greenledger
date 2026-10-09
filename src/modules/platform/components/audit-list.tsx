import Link from "next/link";
import { formatLagos } from "@/lib/dates";
import type { listAuditLog } from "../queries";

type AuditRow = Awaited<ReturnType<typeof listAuditLog>>[number];

/** Compact, mobile-first audit rows (no table: readable at 360 px). */
export function AuditList({ rows, showOrg = true }: { rows: AuditRow[]; showOrg?: boolean }) {
  return (
    <ul className="divide-border divide-y rounded-lg border text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-0.5 px-4 py-2.5">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-mono text-xs font-medium">{r.action}</span>
            <span className="text-muted-foreground text-xs">{formatLagos(r.createdAt)}</span>
          </span>
          <span className="text-muted-foreground text-xs">
            {r.entityType}
            {r.entityId ? ` ${r.entityId.slice(0, 8)}` : ""} · {r.userName ?? "system"}
            {showOrg ? (
              <>
                {" · "}
                {r.orgId ? (
                  <Link href={`/platform/orgs/${r.orgId}`} className="underline-offset-4 hover:underline">
                    {r.orgName ?? r.orgId.slice(0, 8)}
                  </Link>
                ) : (
                  "platform"
                )}
              </>
            ) : null}
          </span>
          {r.reason ? <span className="text-xs italic">“{r.reason}”</span> : null}
        </li>
      ))}
    </ul>
  );
}
