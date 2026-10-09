/**
 * Offline-sync idempotency (ARCHITECTURE §6, DECISIONS §3/§17): every OpKind
 * in the registry, replayed twice through the sync route's dispatch function
 * (applySyncOp — no HTTP, ctx built directly per ARCHITECTURE §14), creates
 * exactly ONE business effect; the second call answers 'duplicate'. A
 * failing op records sync_ops status 'failed' with its error and writes
 * nothing; replaying it never re-applies.
 *
 * Orchestrator-only (shared test DB): `pnpm test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  applications,
  auditLog,
  climateReadings,
  cropCycles,
  harvests,
  inventoryMovements,
  plantLosses,
  scoutingLogs,
  syncOps,
  tasks,
} from "@/db/schema";
import { applySyncOp } from "@/app/api/sync/route";
import { addDays, todayLagos } from "@/lib/dates";
import type { Ctx } from "@/lib/guard";
import { newId } from "@/lib/ids";
import { dateToLagosLocal } from "@/modules/applications/schema";
import { SYNC_OPS } from "@/modules/sync/registry";
import { closeTestDb, getTestDb } from "../helpers/db";
import { createTestOrg, type TestOrg } from "../factories";

const HOUR = 3600_000;

let org: TestOrg;
let ctx: Ctx;
let gh: string;
let cycleId: string;
let inputStore: string;
let packhouse: string;
let itemId: string;

async function countWhere(
  table:
    | typeof plantLosses
    | typeof applications
    | typeof harvests
    | typeof climateReadings
    | typeof scoutingLogs,
  id: string,
): Promise<number> {
  const rows = await getTestDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(and(eq(table.id, id), eq(table.organisationId, org.orgId)));
  return rows[0].n;
}

async function movementCount(): Promise<number> {
  const rows = await getTestDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.organisationId, org.orgId));
  return rows[0].n;
}

async function syncRow(id: string) {
  const [row] = await getTestDb()
    .select({ status: syncOps.status, error: syncOps.error, kind: syncOps.kind })
    .from(syncOps)
    .where(eq(syncOps.id, id));
  return row;
}

/** Apply the same op twice; assert applied → duplicate and one sync_ops row. */
async function replayTwice<P extends { clientId: string }>(
  kind: string,
  payload: P,
  as: Ctx = ctx,
) {
  const op = { id: payload.clientId, kind, payload };
  const first = await applySyncOp(as, op);
  const second = await applySyncOp(as, op);
  expect(first).toMatchObject({ id: op.id, status: "applied" });
  expect(second).toMatchObject({ id: op.id, status: "duplicate" });
  const row = await syncRow(op.id);
  expect(row).toMatchObject({ status: "applied", kind });
  return { first, second };
}

beforeAll(async () => {
  if (!/test/i.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("app db is not pointed at a test database");
  }
  const tdb = getTestDb();
  // inventory: true — the baseline NPK item has 100 kg in the Input Store.
  org = await createTestOrg(tdb, { name: "Sync Farm", inventory: true });
  ctx = org.ctx.manager;
  gh = org.greenhouseIds[0];
  inputStore = org.storeIds[0];
  packhouse = org.storeIds[2];
  itemId = org.itemId!;

  const [cycle] = await tdb
    .insert(cropCycles)
    .values({
      organisationId: org.orgId,
      greenhouseId: gh,
      varietyId: org.varietyId,
      code: `GH1-SYNC-${newId().slice(0, 8)}`,
      transplantDate: addDays(todayLagos(), -80),
      plantsTransplanted: 1000,
      plantsAlive: 1000,
      status: "growing",
    })
    .returning({ id: cropCycles.id });
  cycleId = cycle.id;
});

afterAll(async () => {
  await closeTestDb();
});

describe("sync registry", () => {
  it("covers every offline-capable OpKind (ARCHITECTURE §6)", () => {
    expect(Object.keys(SYNC_OPS).sort()).toEqual(
      [
        "application.create",
        "harvest.create",
        "plantLoss.create",
        "reading.create",
        "scouting.create",
        "stock.issue",
        "task.complete",
      ].sort(),
    );
  });
});

describe("replaying an op twice creates exactly one business row", () => {
  it("plantLoss.create", async () => {
    const clientId = newId();
    await replayTwice("plantLoss.create", {
      clientId,
      cropCycleId: cycleId,
      date: todayLagos(),
      count: 3,
      cause: "pest",
      notes: "sync replay",
    });
    expect(await countWhere(plantLosses, clientId)).toBe(1);
    const [c] = await getTestDb()
      .select({ plantsAlive: cropCycles.plantsAlive })
      .from(cropCycles)
      .where(eq(cropCycles.id, cycleId));
    // Decremented once, not twice.
    expect(c.plantsAlive).toBe(997);
  });

  it("application.create", async () => {
    const clientId = newId();
    const before = await movementCount();
    await replayTwice("application.create", {
      clientId,
      greenhouseId: gh,
      cropCycleId: cycleId,
      type: "fertigation",
      waterVolumeLitres: 500,
      lines: [{ itemId, quantity: 2 }],
      storeId: inputStore,
      appliedAt: dateToLagosLocal(new Date(Date.now() - 2 * HOUR)),
      notes: "",
    });
    expect(await countWhere(applications, clientId)).toBe(1);
    // One FEFO issue movement — the replay drew no extra stock.
    expect((await movementCount()) - before).toBe(1);
  });

  it("harvest.create", async () => {
    const clientId = newId();
    await replayTwice("harvest.create", {
      clientId,
      greenhouseId: gh,
      cropCycleId: cycleId,
      harvestedAt: dateToLagosLocal(new Date(Date.now() - HOUR)),
      lines: [
        { grade: "a", crates: 4, kg: 80 },
        { grade: "b", crates: 1, kg: 15 },
      ],
      storeId: packhouse,
      notes: "",
    });
    expect(await countWhere(harvests, clientId)).toBe(1);
  });

  it("reading.create", async () => {
    const clientId = newId();
    await replayTwice("reading.create", {
      clientId,
      greenhouseId: gh,
      recordedAt: dateToLagosLocal(new Date(Date.now() - HOUR)),
      temperatureC: 29.5,
      humidityPct: 70,
    });
    expect(await countWhere(climateReadings, clientId)).toBe(1);
  });

  it("stock.issue", async () => {
    const clientId = newId();
    const before = await movementCount();
    await replayTwice(
      "stock.issue",
      {
        clientId,
        itemId,
        storeId: inputStore,
        quantity: 1,
        greenhouseId: gh,
        cropCycleId: cycleId,
      },
      org.ctx.storekeeper,
    );
    const mv = await getTestDb()
      .select({ id: inventoryMovements.id, quantity: inventoryMovements.quantity })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.id, clientId),
          eq(inventoryMovements.organisationId, org.orgId),
        ),
      );
    expect(mv).toHaveLength(1);
    expect(Number(mv[0].quantity)).toBe(-1);
    expect((await movementCount()) - before).toBe(1);
  });

  it("scouting.create (no photo)", async () => {
    const clientId = newId();
    await replayTwice(
      "scouting.create",
      {
        clientId,
        cropCycleId: cycleId,
        date: todayLagos(),
        pestOrDisease: "Whitefly",
        severity: "low",
        actionTaken: "",
      },
      org.ctx.worker,
    );
    expect(await countWhere(scoutingLogs, clientId)).toBe(1);
    const [log] = await getTestDb()
      .select({ photoFileId: scoutingLogs.photoFileId })
      .from(scoutingLogs)
      .where(eq(scoutingLogs.id, clientId));
    expect(log.photoFileId).toBeNull();
  });

  it("task.complete", async () => {
    const clientId = newId();
    await replayTwice(
      "task.complete",
      { clientId, taskId: org.taskId },
      org.ctx.worker,
    );
    const [task] = await getTestDb()
      .select({ status: tasks.status, completedBy: tasks.completedBy })
      .from(tasks)
      .where(eq(tasks.id, org.taskId));
    expect(task).toMatchObject({ status: "done", completedBy: org.users.worker.id });
    const audits = await getTestDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organisationId, org.orgId),
          eq(auditLog.action, "tasks.complete"),
          eq(auditLog.entityId, org.taskId),
        ),
      );
    expect(audits[0].n).toBe(1);
  });
});

describe("failing ops", () => {
  it("records sync_ops 'failed' with the error and creates nothing", async () => {
    const clientId = newId();
    const before = await movementCount();
    const op = {
      id: clientId,
      kind: "stock.issue",
      payload: {
        clientId,
        itemId,
        storeId: inputStore,
        quantity: 100_000,
      },
    };
    const first = await applySyncOp(ctx, op);
    expect(first).toMatchObject({ id: clientId, status: "rejected" });
    expect(["INSUFFICIENT_STOCK", "NO_STOCK"]).toContain(first.code);

    const row = await syncRow(clientId);
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/INSUFFICIENT_STOCK|NO_STOCK/);
    expect(await movementCount()).toBe(before);

    // A replay of a failed op never re-applies.
    const again = await applySyncOp(ctx, op);
    expect(again).toMatchObject({ status: "rejected", code: "PRIOR_FAILURE" });
    expect(await movementCount()).toBe(before);
  });

  it("enforces the action's roles (worker cannot issue stock via sync)", async () => {
    const clientId = newId();
    const before = await movementCount();
    const res = await applySyncOp(org.ctx.worker, {
      id: clientId,
      kind: "stock.issue",
      payload: { clientId, itemId, storeId: inputStore, quantity: 1 },
    });
    expect(res).toMatchObject({ status: "rejected", code: "FORBIDDEN" });
    expect((await syncRow(clientId)).status).toBe("failed");
    expect(await movementCount()).toBe(before);
  });

  it("rejects an invalid payload without claiming the op id", async () => {
    const clientId = newId();
    const res = await applySyncOp(ctx, {
      id: clientId,
      kind: "plantLoss.create",
      payload: { clientId, cropCycleId: cycleId, count: -1 },
    });
    expect(res).toMatchObject({ status: "rejected", code: "VALIDATION" });
    expect(await syncRow(clientId)).toBeUndefined();
  });
});
