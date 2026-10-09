import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "../../db";
import {
  equipment,
  maintenanceSchedules,
  member,
  tasks,
} from "../../db/schema";
import { MAINTENANCE_WARN_DAYS } from "../../lib/alerts";
import { writeAudit } from "../../lib/audit";
import { addDays, formatLagosDate, todayLagos } from "../../lib/dates";
import { notifyRole } from "../../lib/notify";

/**
 * scan.maintenance (ARCHITECTURE §8, daily 05:45 Lagos).
 *
 * For each organisation: active schedules on non-retired equipment whose
 * next_due_date is overdue or within MAINTENANCE_WARN_DAYS →
 *  1. notifyRole(owner + manager), dedup key `maint:<scheduleId>:<nextDueDate>`
 *     (a schedule that moves on gets a fresh key; re-runs are no-ops);
 *  2. an unassigned task (greenhouse from the equipment, due = next due)
 *     unless an open/in-progress task already carries the marker
 *     `[auto:maint:<scheduleId>]` in its description.
 *
 * Boundary (DECISIONS §16): imports only db + pure libs (alerts, dates,
 * notify, audit) — never guard/auth or src/modules/*.
 */

const OPEN_TASK_STATUSES = ["open", "in_progress"] as const;

export const maintMarker = (scheduleId: string) => `[auto:maint:${scheduleId}]`;
export const maintDedupKey = (scheduleId: string, nextDueDate: string) =>
  `maint:${scheduleId}:${nextDueDate}`;

/** yyyy-MM-dd (Lagos calendar date) → "dd MMM yyyy". */
const fmtDate = (d: string) => formatLagosDate(`${d}T12:00:00Z`);

export interface MaintenanceScanResult {
  schedules: number;
  notifications: number;
  tasks: number;
}

/** The scan itself — exported so integration tests can call it directly. */
export async function runMaintenanceScan(
  today: string = todayLagos(),
): Promise<MaintenanceScanResult> {
  const horizon = addDays(today, MAINTENANCE_WARN_DAYS);
  const due = await db
    .select({
      scheduleId: maintenanceSchedules.id,
      organisationId: maintenanceSchedules.organisationId,
      name: maintenanceSchedules.name,
      nextDueDate: maintenanceSchedules.nextDueDate,
      equipmentId: equipment.id,
      equipmentName: equipment.name,
      greenhouseId: equipment.greenhouseId,
    })
    .from(maintenanceSchedules)
    .innerJoin(
      equipment,
      and(
        eq(equipment.id, maintenanceSchedules.equipmentId),
        eq(equipment.organisationId, maintenanceSchedules.organisationId),
      ),
    )
    .where(
      and(
        eq(maintenanceSchedules.isActive, true),
        lte(maintenanceSchedules.nextDueDate, horizon),
        ne(equipment.status, "retired"),
      ),
    )
    .orderBy(asc(maintenanceSchedules.organisationId), asc(maintenanceSchedules.nextDueDate));

  const byOrg = new Map<string, typeof due>();
  for (const row of due) {
    const list = byOrg.get(row.organisationId) ?? [];
    list.push(row);
    byOrg.set(row.organisationId, list);
  }

  const result: MaintenanceScanResult = { schedules: due.length, notifications: 0, tasks: 0 };

  for (const [orgId, rows] of byOrg) {
    try {
      await db.transaction(async (tx) => {
        // Tasks need a creator: the org's first owner (else first manager).
        const [creator] = await tx
          .select({ userId: member.userId })
          .from(member)
          .where(
            and(
              eq(member.organizationId, orgId),
              inArray(member.role, ["owner", "manager"]),
            ),
          )
          .orderBy(
            asc(sql`case when ${member.role} = 'owner' then 0 else 1 end`),
            asc(member.createdAt),
          )
          .limit(1);

        for (const s of rows) {
          const overdue = s.nextDueDate < today;
          const when = overdue
            ? `was due ${fmtDate(s.nextDueDate)}`
            : s.nextDueDate === today
              ? "is due today"
              : `is due ${fmtDate(s.nextDueDate)}`;

          result.notifications += await notifyRole(tx, orgId, ["owner", "manager"], {
            type: "maintenance_due",
            title: `${overdue ? "Overdue" : "Maintenance due"}: ${s.equipmentName}`,
            body: `${s.name} ${when}.`,
            entityType: "maintenance_schedule",
            entityId: s.scheduleId,
            dedupKey: maintDedupKey(s.scheduleId, s.nextDueDate),
          });

          if (!creator) continue;
          const marker = maintMarker(s.scheduleId);
          const [existing] = await tx
            .select({ id: tasks.id })
            .from(tasks)
            .where(
              and(
                eq(tasks.organisationId, orgId),
                inArray(tasks.status, [...OPEN_TASK_STATUSES]),
                sql`position(${marker} in coalesce(${tasks.description}, '')) > 0`,
              ),
            )
            .limit(1);
          if (existing) continue;

          const [task] = await tx
            .insert(tasks)
            .values({
              organisationId: orgId,
              title: `Maintenance: ${s.name} — ${s.equipmentName}`,
              description: `Scheduled maintenance for ${s.equipmentName} ${when}. Log the work on the equipment page to move the schedule on. ${marker}`,
              greenhouseId: s.greenhouseId,
              assignedTo: null,
              dueDate: s.nextDueDate,
              status: "open",
              createdBy: creator.userId,
            })
            .returning({ id: tasks.id });
          await writeAudit(tx, { orgId, userId: null }, {
            action: "tasks.create_auto_maintenance",
            entityType: "task",
            entityId: task.id,
            after: {
              scheduleId: s.scheduleId,
              equipmentId: s.equipmentId,
              dueDate: s.nextDueDate,
            },
          });
          result.tasks += 1;
        }
      });
    } catch (err) {
      // One organisation's failure must not stop the scan for the others.
      console.error(`[worker] scan.maintenance failed for org ${orgId}:`, err);
    }
  }
  return result;
}

/** pg-boss v12 hands each handler a batch; one scan covers the batch. */
export async function maintenanceScanHandler(
  jobs: Job<Record<string, unknown>>[],
): Promise<void> {
  const res = await runMaintenanceScan();
  console.log(
    `[worker] scan.maintenance: ${jobs.length} job(s) — ${res.schedules} due schedule(s), ${res.notifications} notification(s), ${res.tasks} task(s) created`,
  );
}
