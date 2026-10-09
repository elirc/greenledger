import Link from "next/link";
import { Lock } from "lucide-react";

/**
 * Amber read-only lockout banner (trial ended / payment overdue /
 * cancelled). Mutations are already blocked server-side by assertWritable;
 * this only tells the user why. Owners get the renew link; others are told
 * to ask the owner.
 */
export function ReadOnlyBanner({ isOwner }: { isOwner: boolean }) {
  return (
    <div
      role="status"
      className="border-status-warning/30 bg-status-warning/15 text-status-warning mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-3 text-sm"
    >
      <Lock className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 font-medium">
        Trial ended — GreenLedger is read-only. Renew to continue.
      </span>
      {isOwner ? (
        <Link
          href="/settings/billing"
          className="border-status-warning/40 hover:bg-status-warning/10 inline-flex min-h-11 items-center rounded-md border px-4 font-semibold"
        >
          Renew
        </Link>
      ) : (
        <span className="text-xs">Ask the farm owner to renew.</span>
      )}
    </div>
  );
}
