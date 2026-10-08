import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  action,
  backHref,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Renders a ≥44px back link to the parent screen. */
  backHref?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-1">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Back"
            className="hover:bg-muted -ml-2 flex size-11 shrink-0 items-center justify-center rounded-md"
          >
            <ChevronLeft className="size-5" />
          </Link>
        ) : null}
        <div className="min-w-0 pt-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-muted-foreground mt-0.5 text-sm">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0 pt-1">{action}</div> : null}
    </div>
  );
}
