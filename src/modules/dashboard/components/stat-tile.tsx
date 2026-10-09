import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TileTone = "default" | "warning" | "danger";

const toneIcon: Record<TileTone, string> = {
  default: "bg-primary/10 text-primary",
  warning: "bg-status-warning/15 text-status-warning",
  danger: "bg-status-danger/12 text-status-danger",
};

/**
 * One dashboard stat tile. The header links to its screen (≥44px target);
 * `children` (breakdowns, secondary links) sit below it, outside the link,
 * so a tile can hold its own second link without nesting anchors.
 */
export function StatTile({
  href,
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
  children,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: TileTone;
  children?: ReactNode;
}) {
  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl border p-2">
      <Link
        href={href}
        className="hover:bg-muted/40 focus-visible:ring-ring/50 flex min-h-16 items-start gap-3 rounded-lg p-2 outline-none focus-visible:ring-3"
      >
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            toneIcon[tone],
          )}
        >
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          {hint ? (
            <p className="text-muted-foreground text-xs">{hint}</p>
          ) : null}
        </div>
        <ChevronRight
          className="text-muted-foreground mt-2 size-5 shrink-0"
          aria-hidden
        />
      </Link>
      {children ? <div className="px-2 pb-1">{children}</div> : null}
    </div>
  );
}

/** Small labelled number row inside a tile (e.g. produce age buckets). */
export function TileBreakdown({
  items,
}: {
  items: { label: string; value: ReactNode; tone?: TileTone }[];
}) {
  return (
    <dl className="grid grid-cols-3 gap-2 border-t pt-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-muted-foreground truncate text-xs">{i.label}</dt>
          <dd
            className={cn(
              "text-sm font-medium tabular-nums",
              i.tone === "danger" && "text-status-danger",
              i.tone === "warning" && "text-status-warning",
            )}
          >
            {i.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
