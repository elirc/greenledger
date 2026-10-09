/**
 * Tenancy isolation — the query-layer contract:
 *   every exported query takes `ctx` first and filters by `ctx.orgId`.
 *
 * Data-driven: to cover a new module, add ONE line to QUERY_MODULES.
 * Per-function argument shapes can be supplied in ARG_OVERRIDES when the
 * default heuristic (see `probeArgs`) does not fit.
 *
 * Orchestrator-only (shared test DB): `pnpm test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as applicationsQueries from "@/modules/applications/queries";
import * as cropsQueries from "@/modules/crops/queries";
import * as customersQueries from "@/modules/customers/queries";
import * as forecastQueries from "@/modules/forecast/queries";
import * as harvestQueries from "@/modules/harvest/queries";
import * as produceQueries from "@/modules/produce/queries";
import * as salesQueries from "@/modules/sales/queries";
import * as cyclesQueries from "@/modules/cycles/queries";
import * as farmQueries from "@/modules/farm/queries";
import * as greenhouseStatusQueries from "@/modules/greenhouse-status/queries";
import * as recipesQueries from "@/modules/recipes/queries";
import * as lossesQueries from "@/modules/losses/queries";
import * as nurseryQueries from "@/modules/nursery/queries";
import * as scoutingQueries from "@/modules/scouting/queries";
import * as tasksQueries from "@/modules/tasks/queries";
import * as itemsQueries from "@/modules/items/queries";
import * as receiptsQueries from "@/modules/receipts/queries";
import * as stockAggQueries from "@/modules/stock/stock-queries";
import * as stockQueries from "@/modules/stock/queries";
import * as suppliersQueries from "@/modules/suppliers/queries";
import * as usersQueries from "@/modules/users/queries";
import { requireMember } from "@/lib/guard";
import { AuthError, DomainError } from "@/lib/errors";
import { ROLES } from "@/lib/permissions";
import { closeTestDb, getTestDb, truncateAll } from "../helpers/db";
import { makeCtx } from "../helpers/ctx";
import { createTestOrg, type TestOrg } from "../factories";

type AnyFn = (...args: unknown[]) => unknown;

// ── Registry ────────────────────────────────────────────────────────────
// One line per query module. Later phases: add e.g. `store: storeQueries`.
const QUERY_MODULES: Record<string, Record<string, unknown>> = {
  applications: applicationsQueries,
  crops: cropsQueries,
  cycles: cyclesQueries,
  farm: farmQueries,
  greenhouseStatus: greenhouseStatusQueries,
  recipes: recipesQueries,
  customers: customersQueries,
  forecast: forecastQueries,
  harvest: harvestQueries,
  produce: produceQueries,
  sales: salesQueries,
  losses: lossesQueries,
  nursery: nurseryQueries,
  scouting: scoutingQueries,
  tasks: tasksQueries,
  items: itemsQueries,
  receipts: receiptsQueries,
  stock: stockQueries,
  stockAgg: stockAggQueries,
  suppliers: suppliersQueries,
  users: usersQueries,
};

/**
 * Optional: `"module.fnName": (A, B) => argument lists (excluding ctx)`.
 * Each returned list is one call `fn(ctxA, ...args)`; results must not carry
 * any org-B id. Use B's ids in the args to probe cross-tenant lookups.
 */
const ARG_OVERRIDES: Record<string, (a: TestOrg, b: TestOrg) => unknown[][]> =
  {
    // 2nd arg is an enum filter, not an id — probing it with ~100 uuid calls
    // just burns 30s on invalid-enum rejections.
    "applications.listRecipeOptions": () => [["fertigation"], ["spray"], []],
    "recipes.listRecipeItemOptions": () => [[]],
  };

/** Modules whose functions never return ids (skip the positive control). */
// nursery/losses/scouting lists are keyed by cycle children the factory
// doesn't create; their cross-tenant probes still run above.
const NO_POSITIVE_CONTROL = new Set<string>([
  "nursery",
  "losses",
  "scouting",
  // no recipes/applications rows in the factory; cross-tenant probes still run
  "recipes",
  "applications",
  // listGreenhouseSafety(ctx, opts?) has fn.length 2 so the control skips it;
  // greenhouse-id leakage is positively controlled via the farm module.
  "greenhouseStatus",
  // no harvest/produce/sales/customer rows in the factory; probes still run
  "harvest",
  "produce",
  "sales",
  "customers",
  "forecast",
]);

// ── Helpers ─────────────────────────────────────────────────────────────

function queryFns(mod: Record<string, unknown>): [string, AnyFn][] {
  return Object.entries(mod).filter(
    (e): e is [string, AnyFn] => typeof e[1] === "function",
  );
}

/** Every string anywhere inside a (JSON-ish) value. */
function collectStrings(value: unknown, out: string[] = [], seen = new Set<unknown>()): string[] {
  if (value === null || value === undefined) return out;
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (typeof value !== "object") return out;
  if (value instanceof Date) return out;
  if (seen.has(value)) return out;
  seen.add(value);
  if (value instanceof Map) {
    for (const [k, v] of value) {
      collectStrings(k, out, seen);
      collectStrings(v, out, seen);
    }
    return out;
  }
  if (Array.isArray(value) || value instanceof Set) {
    for (const v of value) collectStrings(v, out, seen);
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    out.push(k);
    collectStrings(v, out, seen);
  }
  return out;
}

function leakedIds(result: unknown, forbidden: Set<string>): string[] {
  return [...new Set(collectStrings(result).filter((s) => forbidden.has(s)))];
}

/** One representative id of every kind org B owns — used as lookup probes. */
function probeIdsOf(b: TestOrg): string[] {
  return [
    b.orgId,
    b.siteId,
    b.greenhouseIds[0],
    b.zoneIds[0],
    b.storeIds[0],
    b.assignmentIds[0],
    b.users.owner.id,
    b.users.worker.id,
    b.users.owner.memberId,
    b.users.worker.memberId,
  ];
}

function probeArgs(key: string, fn: AnyFn, a: TestOrg, b: TestOrg): unknown[][] {
  const override = ARG_OVERRIDES[key];
  if (override) return override(a, b);
  // fn(ctx) — list-style query.
  if (fn.length <= 1) return [[]];
  // fn(ctx, id, ...) — lookup-style query: ask org A's ctx for org B's rows.
  return probeIdsOf(b).map((id) => [id]);
}

function isExpectedRejection(err: unknown): boolean {
  return err instanceof AuthError || err instanceof DomainError;
}

// ── Fixtures ────────────────────────────────────────────────────────────

let A: TestOrg;
let B: TestOrg;
let bIds: Set<string>;
let aIds: Set<string>;

beforeAll(async () => {
  await truncateAll();
  const db = getTestDb();
  A = await createTestOrg(db, { name: "Tenancy Org A" });
  B = await createTestOrg(db, { name: "Tenancy Org B" });
  aIds = new Set(A.allIds);
  bIds = new Set(B.allIds);
});

afterAll(async () => {
  await closeTestDb();
});

// ── Tests ───────────────────────────────────────────────────────────────

describe("tenancy registry", () => {
  it.each(Object.entries(QUERY_MODULES))(
    "%s/queries exports at least one ctx-first query function",
    (_name, mod) => {
      const fns = queryFns(mod);
      expect(fns.length).toBeGreaterThan(0);
      for (const [fnName, fn] of fns) {
        // Every exported query takes ctx as its first parameter.
        expect(fn.length, `${fnName} must take ctx as first arg`).toBeGreaterThanOrEqual(1);
      }
    },
  );
});

for (const [modName, mod] of Object.entries(QUERY_MODULES)) {
  describe(`${modName}/queries — org A ctx never sees org B rows`, () => {
    for (const [fnName, fn] of queryFns(mod)) {
      const key = `${modName}.${fnName}`;

      it(`${key} (every role)`, async () => {
        for (const role of ROLES) {
          const ctx = A.ctx[role];
          for (const args of probeArgs(key, fn, A, B)) {
            let result: unknown;
            try {
              result = await fn(ctx, ...args);
            } catch (err) {
              // A lookup for B's id may reject (not found / forbidden): no leak.
              // A plain list call for one's own org may only reject for auth/domain reasons.
              if (args.length > 0 || isExpectedRejection(err)) continue;
              throw err;
            }
            expect(
              leakedIds(result, bIds),
              `${key} as ${role} with args ${JSON.stringify(args)} leaked org-B ids`,
            ).toEqual([]);
          }
        }
      });
    }

    // Guards against a vacuous pass: the same queries run as org B DO return
    // B's ids, so the leak scan above is actually able to see them.
    it.skipIf(NO_POSITIVE_CONTROL.has(modName))(
      `${modName}: positive control — org B ctx sees its own rows`,
      async () => {
        let found = 0;
        for (const [, fn] of queryFns(mod)) {
          if (fn.length > 1) continue;
          try {
            const result = await fn(B.ctx.owner);
            found += leakedIds(result, bIds).length;
            // ...and B's own listing never contains A's ids either.
            expect(leakedIds(result, aIds)).toEqual([]);
          } catch (err) {
            if (!isExpectedRejection(err)) throw err;
          }
        }
        expect(found, `${modName}: no list query returned any org-B id`).toBeGreaterThan(0);
      },
    );
  });
}

describe("forged contexts cannot widen scope", () => {
  // A ctx for an organisation that does not exist. If any query ignored
  // ctx.orgId (or fell back to "all rows"), A's or B's ids would appear.
  const ghostOrgId = "00000000-0000-4000-8000-00000000dead";
  const ghostUserId = "00000000-0000-4000-8000-00000000beef";

  for (const [modName, mod] of Object.entries(QUERY_MODULES)) {
    for (const [fnName, fn] of queryFns(mod)) {
      const key = `${modName}.${fnName}`;
      it(`${key} with a ghost-org ctx returns nothing from real orgs`, async () => {
        const realIds = new Set([...aIds, ...bIds]);
        for (const role of ROLES) {
          const ghost = makeCtx({
            role,
            orgId: ghostOrgId,
            userId: ghostUserId,
            assignedGreenhouseIds: role === "worker" ? [] : null,
          });
          const argLists = fn.length <= 1 && !ARG_OVERRIDES[key]
            ? [[]]
            : [...probeArgs(key, fn, A, B), ...probeArgs(key, fn, B, A)];
          for (const args of argLists) {
            let result: unknown;
            try {
              result = await fn(ghost, ...args);
            } catch (err) {
              if (args.length > 0 || isExpectedRejection(err)) continue;
              throw err;
            }
            expect(
              leakedIds(result, realIds),
              `${key} as ghost ${role} with args ${JSON.stringify(args)}`,
            ).toEqual([]);
          }
        }
      });

      it(`${key}: B's owner forging org A's orgId sees only org A`, async () => {
        // The query layer must key on ctx.orgId, not on ctx.userId's memberships.
        const forged = makeCtx({
          role: "owner",
          orgId: A.orgId,
          userId: B.users.owner.id,
          org: { name: A.name, status: "active" },
        });
        for (const args of probeArgs(key, fn, A, B)) {
          let result: unknown;
          try {
            result = await fn(forged, ...args);
          } catch (err) {
            if (args.length > 0 || isExpectedRejection(err)) continue;
            throw err;
          }
          // B's owner's own user id is in the ctx itself; anything else of B's is a leak.
          const bOnly = new Set([...bIds].filter((id) => id !== B.users.owner.id));
          expect(leakedIds(result, bOnly), `${key} forged`).toEqual([]);
        }
      });
    }
  }

  it("requireMember cannot be satisfied without a real session", async () => {
    // Outside a request there are no headers/cookies: the guard must reject,
    // never fall back to some default org.
    await expect(requireMember()).rejects.toBeDefined();
  });
});
