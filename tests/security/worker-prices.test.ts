/**
 * Worker price redaction — workers must NEVER receive cost/price/value data.
 *
 * Calls every exported function of every registered query module with a
 * WORKER ctx and asserts the returned JSON has no key matching MONEY_KEY with
 * a non-null value (ARCHITECTURE §3 "Worker price redaction").
 *
 * Registry-style: to cover a new module, add ONE line to QUERY_MODULES
 * (e.g. Phase 5: `sales: salesQueries`). Functions whose argument shapes the
 * default probe (see `probeArgs`) cannot satisfy get an ARG_OVERRIDES entry.
 *
 * Orchestrator-only (shared test DB): `pnpm test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  itemBatches,
  items,
  receiptLines,
  receipts,
  suppliers,
} from "@/db/schema";
import { addDays, todayLagos } from "@/lib/dates";
import type { Ctx } from "@/lib/guard";
import { postMovement } from "@/modules/stock/movements";
import * as applicationsQueries from "@/modules/applications/queries";
import * as billingQueries from "@/modules/billing/queries";
import * as cropsQueries from "@/modules/crops/queries";
import * as notificationsQueries from "@/modules/notifications/queries";
import * as customersQueries from "@/modules/customers/queries";
import * as dashboardQueries from "@/modules/dashboard/queries";
import * as equipmentQueries from "@/modules/equipment/queries";
import * as expensesQueries from "@/modules/expenses/queries";
import * as forecastQueries from "@/modules/forecast/queries";
import * as readingsQueries from "@/modules/readings/queries";
import * as reportsQueries from "@/modules/reports/queries";
import * as harvestQueries from "@/modules/harvest/queries";
import * as produceQueries from "@/modules/produce/queries";
import * as salesQueries from "@/modules/sales/queries";
import * as cyclesQueries from "@/modules/cycles/queries";
import * as greenhouseStatusQueries from "@/modules/greenhouse-status/queries";
import * as recipesQueries from "@/modules/recipes/queries";
import * as farmQueries from "@/modules/farm/queries";
import * as itemsQueries from "@/modules/items/queries";
import * as lossesQueries from "@/modules/losses/queries";
import * as nurseryQueries from "@/modules/nursery/queries";
import * as receiptsQueries from "@/modules/receipts/queries";
import * as scoutingQueries from "@/modules/scouting/queries";
import * as stockAggregateQueries from "@/modules/stock/stock-queries";
import * as suppliersQueries from "@/modules/suppliers/queries";
import * as tasksQueries from "@/modules/tasks/queries";
import * as usersQueries from "@/modules/users/queries";
import { closeTestDb, getTestDb, truncateAll } from "../helpers/db";
import { createTestOrg, type TestOrg } from "../factories";

type AnyFn = (...args: unknown[]) => unknown;

// ── Registry ────────────────────────────────────────────────────────────
// One line per query module. Phase 5: add `sales: salesQueries`, etc.
const QUERY_MODULES: Record<string, Record<string, unknown>> = {
  stockAggregates: stockAggregateQueries,
  items: itemsQueries,
  receipts: receiptsQueries,
  suppliers: suppliersQueries,
  users: usersQueries,
  farm: farmQueries,
  crops: cropsQueries,
  nursery: nurseryQueries,
  cycles: cyclesQueries,
  losses: lossesQueries,
  scouting: scoutingQueries,
  tasks: tasksQueries,
  applications: applicationsQueries,
  recipes: recipesQueries,
  greenhouseStatus: greenhouseStatusQueries,
  customers: customersQueries,
  dashboard: dashboardQueries,
  equipment: equipmentQueries,
  expenses: expensesQueries,
  forecast: forecastQueries,
  harvest: harvestQueries,
  produce: produceQueries,
  readings: readingsQueries,
  reports: reportsQueries,
  sales: salesQueries,
  billing: billingQueries,
  notifications: notificationsQueries,
};

/** Modules that hold money for managers — the positive control must see it. */
const MONEY_MODULES = ["stockAggregates", "items", "receipts"] as const;

/**
 * Optional: `"module.fnName": (org, fx) => argument lists (excluding ctx)`.
 * Each list is one call `fn(workerCtx, ...args)`.
 */
const ARG_OVERRIDES: Record<
  string,
  (org: TestOrg, fx: Fixture) => unknown[][]
> = {};

/** ARCHITECTURE §3 redaction pattern. */
const MONEY_KEY = /cost|price|amount|value|kobo/i;

// ── Helpers ─────────────────────────────────────────────────────────────

interface Fixture {
  itemIds: string[];
  batchIds: string[];
  supplierId: string;
  receiptId: string;
  receiptLineIds: string[];
}

function queryFns(mod: Record<string, unknown>): [string, AnyFn][] {
  return Object.entries(mod).filter(
    (e): e is [string, AnyFn] => typeof e[1] === "function",
  );
}

/** Paths of every key matching MONEY_KEY whose value is not null. */
function moneyLeaks(value: unknown, path = "$", out: string[] = []): string[] {
  if (value === null || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => moneyLeaks(v, `${path}[${i}]`, out));
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    if (MONEY_KEY.test(k) && v !== null) out.push(`${path}.${k}=${JSON.stringify(v)}`);
    moneyLeaks(v, `${path}.${k}`, out);
  }
  return out;
}

/** "The returned JSON": exactly what would cross the wire to a client. */
function asJson(result: unknown): unknown {
  return result === undefined ? null : JSON.parse(JSON.stringify(result));
}

function probeArgs(
  key: string,
  fn: AnyFn,
  org: TestOrg,
  fx: Fixture,
): unknown[][] {
  const override = ARG_OVERRIDES[key];
  if (override) return override(org, fx);
  if (fn.length <= 1) return [[]];
  // fn(ctx, id, ...) or fn(ctx, opts?) — try no extra args plus one call per
  // id of every kind the org owns; shapes that don't fit simply reject.
  const ids = [
    ...fx.itemIds,
    ...fx.batchIds,
    fx.supplierId,
    fx.receiptId,
    ...fx.receiptLineIds,
    ...org.storeIds,
    ...org.greenhouseIds,
    org.users.worker.memberId,
    org.users.owner.memberId,
  ];
  return [[], ...ids.map((id) => [id])];
}

async function callAll(
  key: string,
  fn: AnyFn,
  ctx: Ctx,
  argLists: unknown[][],
): Promise<{ results: { args: unknown[]; json: unknown }[]; errors: unknown[] }> {
  const results: { args: unknown[]; json: unknown }[] = [];
  const errors: unknown[] = [];
  for (const args of argLists) {
    try {
      results.push({ args, json: asJson(await fn(ctx, ...args)) });
    } catch (err) {
      // Not found / forbidden / wrong probe shape: nothing returned, no leak.
      errors.push(err);
    }
  }
  return { results, errors };
}

// ── Fixtures ────────────────────────────────────────────────────────────

let org: TestOrg;
let fx: Fixture;

beforeAll(async () => {
  if (!/test/i.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("app db is not pointed at a test database");
  }
  await truncateAll();
  const tdb = getTestDb();
  org = await createTestOrg(tdb, { name: "Redaction Farm" });
  const owner = org.ctx.owner;
  const today = todayLagos();

  const [supplier] = await tdb
    .insert(suppliers)
    .values({ organisationId: org.orgId, name: "Price Leak Agro" })
    .returning({ id: suppliers.id });

  const itemRows = await tdb
    .insert(items)
    .values([
      {
        organisationId: org.orgId,
        name: "NPK 20-20-20",
        category: "fertiliser" as const,
        baseUnit: "kg" as const,
        reorderLevel: "50",
        nPct: "20.00",
        pPct: "20.00",
        kPct: "20.00",
      },
      {
        organisationId: org.orgId,
        name: "Mancozeb 80WP",
        category: "agrochemical" as const,
        baseUnit: "kg" as const,
        reorderLevel: "2",
        activeIngredient: "mancozeb",
        phiDays: 7,
        reiHours: 24,
      },
    ])
    .returning({ id: items.id });

  const batchRows = await tdb
    .insert(itemBatches)
    .values([
      {
        organisationId: org.orgId,
        itemId: itemRows[0].id,
        supplierId: supplier.id,
        batchNumber: "NPK-001",
        expiryDate: addDays(today, 400),
        unitCostKobo: "120000.000000",
      },
      {
        organisationId: org.orgId,
        itemId: itemRows[1].id,
        supplierId: supplier.id,
        batchNumber: "MZ-001",
        expiryDate: addDays(today, 15),
        unitCostKobo: "650000.000000",
      },
    ])
    .returning({ id: itemBatches.id });

  const lines = [
    { batch: batchRows[0].id, item: itemRows[0].id, qty: 25, rate: 120000 },
    { batch: batchRows[1].id, item: itemRows[1].id, qty: 1, rate: 650000 },
  ];
  const [receipt] = await tdb
    .insert(receipts)
    .values({
      organisationId: org.orgId,
      supplierId: supplier.id,
      storeId: org.storeIds[0],
      reference: "INV-REDACT-1",
      receivedBy: org.users.storekeeper.id,
      totalCostKobo: lines.reduce((s, l) => s + l.qty * l.rate, 0),
    })
    .returning({ id: receipts.id });
  const lineRows = await tdb
    .insert(receiptLines)
    .values(
      lines.map((l) => ({
        organisationId: org.orgId,
        receiptId: receipt.id,
        itemId: l.item,
        itemBatchId: l.batch,
        quantity: l.qty.toFixed(3),
        unitCostKobo: l.rate.toFixed(6),
        lineCostKobo: l.qty * l.rate,
      })),
    )
    .returning({ id: receiptLines.id, itemBatchId: receiptLines.itemBatchId });

  // Stock arrives through the movement engine only.
  await db.transaction(async (tx) => {
    for (const l of lineRows) {
      const line = lines.find((x) => x.batch === l.itemBatchId)!;
      await postMovement(tx, owner, {
        batchId: l.itemBatchId,
        storeId: org.storeIds[0],
        type: "receive",
        quantity: line.qty,
        receiptLineId: l.id,
      });
    }
  });

  fx = {
    itemIds: itemRows.map((i) => i.id),
    batchIds: batchRows.map((b) => b.id),
    supplierId: supplier.id,
    receiptId: receipt.id,
    receiptLineIds: lineRows.map((l) => l.id),
  };
});

afterAll(async () => {
  await closeTestDb();
});

// ── Tests ───────────────────────────────────────────────────────────────

describe("redaction registry", () => {
  it.each(Object.entries(QUERY_MODULES))(
    "%s exports at least one ctx-first query function",
    (_name, mod) => {
      const fns = queryFns(mod);
      expect(fns.length).toBeGreaterThan(0);
      for (const [fnName, fn] of fns) {
        expect(fn.length, `${fnName} must take ctx first`).toBeGreaterThanOrEqual(1);
      }
    },
  );
});

for (const [modName, mod] of Object.entries(QUERY_MODULES)) {
  describe(`${modName} — worker ctx receives no money`, () => {
    for (const [fnName, fn] of queryFns(mod)) {
      const key = `${modName}.${fnName}`;
      it(key, async () => {
        const worker = org.ctx.worker;
        expect(worker.canSeeMoney).toBe(false);
        const { results } = await callAll(
          key,
          fn,
          worker,
          probeArgs(key, fn, org, fx),
        );
        for (const r of results) {
          expect(
            moneyLeaks(r.json),
            `${key} as worker with args ${JSON.stringify(r.args)} returned money`,
          ).toEqual([]);
        }
      });
    }
  });
}

describe("positive control — the scan can see money when allowed", () => {
  it("manager-visible modules return non-null money fields for an owner", async () => {
    // Guards against a vacuous pass: same calls, owner ctx, MUST hit money keys.
    let leaks = 0;
    for (const modName of MONEY_MODULES) {
      for (const [fnName, fn] of queryFns(QUERY_MODULES[modName])) {
        const key = `${modName}.${fnName}`;
        const { results } = await callAll(
          key,
          fn,
          org.ctx.owner,
          probeArgs(key, fn, org, fx),
        );
        for (const r of results) leaks += moneyLeaks(r.json).length;
      }
    }
    expect(leaks).toBeGreaterThan(0);
  });

  it("stock list shows value to an owner and hides it from a worker", async () => {
    const ownerRows = await stockAggregateQueries.listStockItems(org.ctx.owner);
    const npk = ownerRows.find((r) => r.id === fx.itemIds[0]);
    // 25 kg × 120,000 kobo/kg
    expect(npk?.stockValueKobo).toBe(3_000_000);

    const workerRows = await stockAggregateQueries.listStockItems(org.ctx.worker);
    expect(workerRows.find((r) => r.id === fx.itemIds[0])?.stockValueKobo).toBeNull();
    expect(workerRows.find((r) => r.id === fx.itemIds[0])?.onHand).toBe(25);
  });
});
