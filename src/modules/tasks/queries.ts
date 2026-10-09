import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import {
  cropCycles,
  greenhouses,
  member,
  tasks,
  user,
} from "@/db/schema";
import type { Ctx } from "@/lib/guard";
import { ROLES, type Role } from "@/lib/permissions";
import { compareOpenTasks } from "./logic";
import { OPEN_TASK_STATUSES, type TaskScope } from "./schema";

/**
 * Every query takes ctx and filters by ctx.orgId — no exceptions. No money.
 * Visibility: owner/manager see every task; workers see tasks assigned to
 * them or in their assigned greenhouses; storekeepers see tasks assigned to them.
 */

const CLOSED_LIMIT = 50;

function seesAll(ctx: Ctx): boolean {
  return ctx.role === "owner" || ctx.role === "manager";
}

function visibilityFilter(ctx: Ctx): SQL | undefined {
  if (seesAll(ctx)) return undefined;
  const mine = eq(tasks.assignedTo, ctx.userId);
  if (ctx.assignedGreenhouseIds && ctx.assignedGreenhouseIds.length > 0) {
    return or(mine, inArray(tasks.greenhouseId, ctx.assignedGreenhouseIds));
  }
  return mine;
}

interface TaskFilterOpts {
  /** Owner/manager only; others are always limited by visibility. */
  scope?: TaskScope;
  greenhouseId?: string;
}

function baseFilters(ctx: Ctx, opts?: TaskFilterOpts): SQL[] {
  const filters: SQL[] = [eq(tasks.organisationId, ctx.orgId)];
  const vis = visibilityFilter(ctx);
  if (vis) filters.push(vis);
  if (seesAll(ctx) && opts?.scope === "mine") {
    filters.push(eq(tasks.assignedTo, ctx.userId));
  }
  if (opts?.greenhouseId) filters.push(eq(tasks.greenhouseId, opts.greenhouseId));
  return filters;
}

const taskSelect = {
  id: tasks.id,
  title: tasks.title,
  description: tasks.description,
  status: tasks.status,
  dueDate: tasks.dueDate,
  completedAt: tasks.completedAt,
  updatedAt: tasks.updatedAt,
  greenhouseId: tasks.greenhouseId,
  greenhouseName: greenhouses.name,
  cropCycleId: tasks.cropCycleId,
  cycleCode: cropCycles.code,
  assignedTo: tasks.assignedTo,
  assigneeName: user.name,
};

function selectTasks() {
  return db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(greenhouses, eq(greenhouses.id, tasks.greenhouseId))
    .leftJoin(cropCycles, eq(cropCycles.id, tasks.cropCycleId))
    .leftJoin(user, eq(user.id, tasks.assignedTo));
}

type RawTask = Awaited<ReturnType<typeof selectTasks>>[number];

function toRow(ctx: Ctx, r: RawTask) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    dueDate: r.dueDate,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    greenhouseId: r.greenhouseId,
    greenhouseName: r.greenhouseName,
    cropCycleId: r.cropCycleId,
    cycleCode: r.cycleCode,
    assignedTo: r.assignedTo,
    assigneeName: r.assigneeName,
    isMine: r.assignedTo === ctx.userId,
  };
}

export type TaskRow = ReturnType<typeof toRow>;

/** List view: open tasks by due date + recently finished/cancelled tasks. */
export async function listTasks(ctx: Ctx, opts?: TaskFilterOpts) {
  const filters = baseFilters(ctx, opts);
  const [openRows, closedRows] = await Promise.all([
    selectTasks()
      .where(and(...filters, inArray(tasks.status, OPEN_TASK_STATUSES)))
      .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.title)),
    selectTasks()
      .where(and(...filters, inArray(tasks.status, ["done", "cancelled"])))
      .orderBy(
        sql`coalesce(${tasks.completedAt}, ${tasks.updatedAt}) desc`,
        desc(tasks.createdAt),
      )
      .limit(CLOSED_LIMIT),
  ]);
  return {
    open: openRows.map((r) => toRow(ctx, r)).sort(compareOpenTasks),
    closed: closedRows.map((r) => toRow(ctx, r)),
  };
}

/** Calendar view: tasks due within [from, to] (yyyy-MM-dd), cancelled excluded. */
export async function listTasksDueBetween(
  ctx: Ctx,
  range: { from: string; to: string },
  opts?: TaskFilterOpts,
) {
  const rows = await selectTasks()
    .where(
      and(
        ...baseFilters(ctx, opts),
        ne(tasks.status, "cancelled"),
        gte(tasks.dueDate, range.from),
        lte(tasks.dueDate, range.to),
      ),
    )
    .orderBy(asc(tasks.dueDate), asc(tasks.title));
  return rows.map((r) => toRow(ctx, r));
}

/** One task (visibility-scoped); null when missing or not visible. */
export async function getTask(ctx: Ctx, id: string) {
  const [row] = await selectTasks()
    .where(and(...baseFilters(ctx), eq(tasks.id, id)))
    .limit(1);
  return row ? toRow(ctx, row) : null;
}

function asRole(value: string): Role | null {
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : null;
}

/** Greenhouses for the list filter (workers: assigned only). */
export async function listTaskGreenhouseOptions(ctx: Ctx) {
  const filters: SQL[] = [
    eq(greenhouses.organisationId, ctx.orgId),
    eq(greenhouses.isActive, true),
  ];
  if (ctx.assignedGreenhouseIds) {
    if (ctx.assignedGreenhouseIds.length === 0) return [];
    filters.push(inArray(greenhouses.id, ctx.assignedGreenhouseIds));
  }
  return db
    .select({ id: greenhouses.id, name: greenhouses.name })
    .from(greenhouses)
    .where(and(...filters))
    .orderBy(asc(greenhouses.name));
}

/** Reference data for the create/edit form (owner/manager screens). */
export async function getTaskFormRefs(ctx: Ctx) {
  const [staffRows, ghRows, cycleRows] = await Promise.all([
    db
      .select({ userId: member.userId, role: member.role, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, ctx.orgId))
      .orderBy(asc(user.name)),
    listTaskGreenhouseOptions(ctx),
    db
      .select({
        id: cropCycles.id,
        code: cropCycles.code,
        greenhouseId: cropCycles.greenhouseId,
      })
      .from(cropCycles)
      .where(
        and(
          eq(cropCycles.organisationId, ctx.orgId),
          ne(cropCycles.status, "closed"),
        ),
      )
      .orderBy(asc(cropCycles.code)),
  ]);
  return {
    staff: staffRows.map((s) => ({ ...s, role: asRole(s.role) })),
    greenhouses: ghRows,
    cycles: cycleRows,
  };
}

export type TaskFormRefs = Awaited<ReturnType<typeof getTaskFormRefs>>;
