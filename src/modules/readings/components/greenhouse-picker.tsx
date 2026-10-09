import Link from "next/link";
import { cn } from "cn";
import type { ReadingGreenhouse } from "../queries";

/** Greenhouse chips (links — no client JS); scrolls sideways on phones. */
export function GreenhousePicker({
  greenhouses,
  selectedId,
}: {
  greenhouses: ReadingGreenhouse[];
  selectedId: string;
}) {
  return (
    <nav
      aria-label="Greenhouse"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
    >
      {greenhouses.map((g) => {
        const active = g.id === selectedId;
        return (
          <Link
            key={g.id}
            href={`/readings?gh=${g.id}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm whitespace-nowrap",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted",
            )}
          >
            {g.name}
          </Link>
        );
      })}
    </nav>
  );
}
