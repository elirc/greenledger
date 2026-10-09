import Link from "next/link";
import { CalendarCheck2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { TaskCalendar } from "@/modules/tasks/components/task-calendar";
import type { TaskViewer } from "@/modules/tasks/components/task-card";
import { TaskFilters } from "@/modules/tasks/components/task-filters";
import { TaskList } from "@/modules/tasks/components/task-list";
import { monthGrid, monthOf, shiftMonth, tasksHref } from "@/modules/tasks/logic";
import {
  listTaskGreenhouseOptions,
  listTasks,
  listTasksDueBetween,
} from "@/modules/tasks/queries";
import { taskListParamsSchema } from "@/modules/tasks/schema";

export const metadata = { title: "Tasks" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember();
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]);
  const params = taskListParamsSchema.parse({
    view: one("view"),
    scope: one("scope"),
    gh: one("gh"),
    month: one("month"),
  });

  const canManage = ctx.role === "owner" || ctx.role === "manager";
  const scope = canManage ? (params.scope ?? "all") : "mine";
  const today = todayLagos();
  const greenhouses = await listTaskGreenhouseOptions(ctx);
  const gh = greenhouses.some((g) => g.id === params.gh) ? params.gh : undefined;
  const filterOpts = { scope, greenhouseId: gh };

  const viewer: TaskViewer = {
    userId: ctx.userId,
    role: ctx.role,
    assignedGreenhouseIds: ctx.assignedGreenhouseIds,
    canManage,
  };
  const hrefBase = { scope: canManage ? scope : undefined, gh } as const;

  const header = (
    <PageHeader
      title="Tasks"
      description={canManage ? "Plan, assign and track farm work." : "Your work for the farm."}
      action={
        canManage ? (
          <Button asChild className="h-11">
            <Link href="/tasks/new">
              <Plus className="size-4" /> New task
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  const filters = (
    <TaskFilters
      view={params.view}
      scope={scope}
      greenhouseId={gh}
      month={params.month}
      canSeeAll={canManage}
      greenhouses={greenhouses}
    />
  );

  if (params.view === "calendar") {
    const month = params.month ?? monthOf(today);
    const grid = monthGrid(month);
    const tasks = await listTasksDueBetween(
      ctx,
      { from: grid.from, to: grid.to },
      filterOpts,
    );
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {header}
        {filters}
        <TaskCalendar
          month={month}
          tasks={tasks}
          viewer={viewer}
          today={today}
          prevHref={tasksHref({ ...hrefBase, view: "calendar", month: shiftMonth(month, -1) })}
          nextHref={tasksHref({ ...hrefBase, view: "calendar", month: shiftMonth(month, 1) })}
          todayHref={tasksHref({ ...hrefBase, view: "calendar" })}
        />
      </div>
    );
  }

  const { open, closed } = await listTasks(ctx, filterOpts);
  const filtered = Boolean(gh) || (canManage && scope === "mine");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {header}
      {filters}
      {open.length === 0 && closed.length === 0 ? (
        <EmptyState
          icon={CalendarCheck2}
          title={filtered ? "No tasks match these filters" : "No tasks yet"}
          description={
            canManage
              ? "Create tasks for spraying, cleaning, repairs and anything else the team must do."
              : "Tasks assigned to you or your greenhouses will show up here."
          }
        >
          {canManage && !filtered ? (
            <Button asChild className="h-11">
              <Link href="/tasks/new">Create the first task</Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <TaskList open={open} closed={closed} viewer={viewer} today={today} />
      )}
    </div>
  );
}
