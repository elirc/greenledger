"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, List } from "lucide-react";
import { cn } from "cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { tasksHref } from "../logic";
import type { TaskScope } from "../schema";

const ALL = "__all";

type View = "list" | "calendar";

function Segment({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

/** View toggle (list/calendar), mine/all (owner/manager) and greenhouse filter. */
export function TaskFilters({
  view,
  scope,
  greenhouseId,
  month,
  canSeeAll,
  greenhouses,
}: {
  view: View;
  scope: TaskScope;
  greenhouseId?: string;
  month?: string;
  canSeeAll: boolean;
  greenhouses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const base = { view, scope: canSeeAll ? scope : undefined, gh: greenhouseId, month };

  return (
    <div className="space-y-2">
      <nav className="bg-muted flex gap-1 rounded-lg p-1" aria-label="View">
        <Segment href={tasksHref({ ...base, view: "list" })} active={view === "list"}>
          <List className="size-4" /> List
        </Segment>
        <Segment
          href={tasksHref({ ...base, view: "calendar" })}
          active={view === "calendar"}
        >
          <CalendarDays className="size-4" /> Calendar
        </Segment>
      </nav>
      <div className="flex flex-col gap-2 sm:flex-row">
        {canSeeAll ? (
          <nav className="bg-muted flex flex-1 gap-1 rounded-lg p-1" aria-label="Whose tasks">
            <Segment href={tasksHref({ ...base, scope: "all" })} active={scope === "all"}>
              All tasks
            </Segment>
            <Segment href={tasksHref({ ...base, scope: "mine" })} active={scope === "mine"}>
              Mine
            </Segment>
          </nav>
        ) : null}
        {greenhouses.length > 0 ? (
          <Select
            value={greenhouseId ?? ALL}
            onValueChange={(v) =>
              router.push(tasksHref({ ...base, gh: v === ALL ? undefined : v }))
            }
          >
            <SelectTrigger className="h-11 w-full sm:w-48" aria-label="Greenhouse">
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
    </div>
  );
}
