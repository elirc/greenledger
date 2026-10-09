import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "../../db";
import { crops, produceLots, produceMovements } from "../../db/schema";
import { BEST_BEFORE_WARN_DAYS } from "../../lib/alerts";
import { addDays, formatLagosDate, todayLagos } from "../../lib/dates";
import { notifyRole } from "../../lib/notify";

/**
 * scan.bestBefore (ARCHITECTURE §8, daily 05:40 Lagos).
 *
 * Produce lots WITH STOCK (Σ produce_movements.kg > 0) whose best_before_date
 * is within BEST_BEFORE_WARN_DAYS or already past → notifyRole(owner +
 * manager + storekeeper), dedup `bb:<lotId>:<bucket>` (bucket soon | past).
 *
 * Boundary (DECISIONS §16): db + pure libs only.
 */

export type BestBeforeBucket = "soon" | "past";

export const bestBeforeDedupKey = (lotId: string, bucket: BestBeforeBucket) =>
  `bb:${lotId}:${bucket}`;

const fmtDate = (d: string) => formatLagosDate(`${d}T12:00:00Z`);
const GRADE_LABEL: Record<string, string> = { a: "A", b: "B", c: "C", reject: "Reject" };

export function bestBeforeBucket(bestBefore: string, today: string): BestBeforeBucket | null {
  if (bestBefore < today) return "past";
  if (bestBefore <= addDays(today, BEST_BEFORE_WARN_DAYS)) return "soon";
  return null;
}

export interface BestBeforeScanResult {
  lots: number;
  notifications: number;
}

export async function runBestBeforeScan(
  today: string = todayLagos(),
): Promise<BestBeforeScanResult> {
  const horizon = addDays(today, BEST_BEFORE_WARN_DAYS);
  const rows = await db
    .select({
      lotId: produceLots.id,
      organisationId: produceLots.organisationId,
      grade: produceLots.grade,
      bestBeforeDate: produceLots.bestBeforeDate,
      cropName: crops.name,
      onHandKg: sql<string>`sum(${produceMovements.kg})`,
    })
    .from(produceLots)
    .innerJoin(
      crops,
      and(eq(crops.id, produceLots.cropId), eq(crops.organisationId, produceLots.organisationId)),
    )
    .innerJoin(
      produceMovements,
      and(
        eq(produceMovements.produceLotId, produceLots.id),
        eq(produceMovements.organisationId, produceLots.organisationId),
      ),
    )
    .where(lte(produceLots.bestBeforeDate, horizon))
    .groupBy(
      produceLots.id,
      produceLots.organisationId,
      produceLots.grade,
      produceLots.bestBeforeDate,
      crops.name,
    )
    .having(sql`sum(${produceMovements.kg}) > 0`)
    .orderBy(asc(produceLots.organisationId), asc(produceLots.bestBeforeDate));

  const result: BestBeforeScanResult = { lots: rows.length, notifications: 0 };

  const byOrg = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byOrg.get(r.organisationId) ?? [];
    list.push(r);
    byOrg.set(r.organisationId, list);
  }

  for (const [orgId, list] of byOrg) {
    try {
      await db.transaction(async (tx) => {
        for (const lot of list) {
          const bucket = bestBeforeBucket(lot.bestBeforeDate, today);
          if (!bucket) continue;
          const label = `${lot.cropName} grade ${GRADE_LABEL[lot.grade] ?? lot.grade}`;
          const kg = String(Number(lot.onHandKg));
          result.notifications += await notifyRole(
            tx,
            orgId,
            ["owner", "manager", "storekeeper"],
            {
              type: "produce_best_before",
              title: bucket === "past" ? `Past best-before: ${label}` : `Sell soon: ${label}`,
              body:
                bucket === "past"
                  ? `${kg} kg passed its best-before date (${fmtDate(lot.bestBeforeDate)}). Sell, downgrade or record it as waste.`
                  : `${kg} kg reaches its best-before date on ${fmtDate(lot.bestBeforeDate)}.`,
              entityType: "produce_lot",
              entityId: lot.lotId,
              dedupKey: bestBeforeDedupKey(lot.lotId, bucket),
            },
          );
        }
      });
    } catch (err) {
      console.error(`[worker] scan.bestBefore failed for org ${orgId}:`, err);
    }
  }
  return result;
}

export async function bestBeforeScanHandler(
  jobs: Job<Record<string, unknown>>[],
): Promise<void> {
  const res = await runBestBeforeScan();
  console.log(
    `[worker] scan.bestBefore: ${jobs.length} job(s) — ${res.lots} lot(s) in window, ${res.notifications} notification(s)`,
  );
}
