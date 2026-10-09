"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APPLICATION_TYPES,
  APPLICATION_TYPE_LABELS,
  type ApplicationType,
} from "../schema";

const ALL = "__all";

export function applicationsHref(p: { gh?: string; type?: ApplicationType }) {
  const sp = new URLSearchParams();
  if (p.gh) sp.set("gh", p.gh);
  if (p.type) sp.set("type", p.type);
  const q = sp.toString();
  return q ? `/applications?${q}` : "/applications";
}

/** Type segment (All / Fertigation / Spray) + greenhouse select. */
export function ApplicationFilters({
  greenhouseId,
  type,
  greenhouses,
}: {
  greenhouseId?: string;
  type?: ApplicationType;
  greenhouses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const segments: { label: string; value?: ApplicationType }[] = [
    { label: "All" },
    ...APPLICATION_TYPES.map((t) => ({
      label: APPLICATION_TYPE_LABELS[t],
      value: t,
    })),
  ];

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <nav className="bg-muted flex flex-1 gap-1 rounded-lg p-1" aria-label="Type">
        {segments.map((s) => {
          const active = s.value === type;
          return (
            <Link
              key={s.label}
              href={applicationsHref({ gh: greenhouseId, type: s.value })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>
      {greenhouses.length > 1 ? (
        <Select
          value={greenhouseId ?? ALL}
          onValueChange={(v) =>
            router.push(
              applicationsHref({ gh: v === ALL ? undefined : v, type }),
            )
          }
        >
          <SelectTrigger className="h-11 w-full sm:w-52" aria-label="Greenhouse">
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
    </div>
  );
}
