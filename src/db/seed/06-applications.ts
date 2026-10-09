import { and, eq, inArray, sql } from "drizzle-orm";
import {
  applicationItems,
  applications,
  cropCycles,
  greenhouses,
  inventoryMovements,
  items,
  recipeLines,
  recipes,
} from "../schema";
import type { Tx } from "../index";
import type { Ctx } from "../../lib/guard";
import { writeAudit } from "../../lib/audit";
import { addDays, lagosDateOf } from "../../lib/dates";
import type { Role } from "../../lib/permissions";
import { scaleRecipe } from "../../modules/applications/logic";
import { postApplication } from "../../modules/applications/post";
import { isExpired, roundQty } from "../../modules/stock/logic";
import { fefoCandidates, postMovement } from "../../modules/stock/movements";
import { DEMO_ORG, DEMO_USERS } from "./02-org";
import { DEMO_ITEMS } from "./04-items";
import { bump, type SeedState, type SeedStep } from "./state";

/**
 * Phase 4 seed: 3 recipes + 10 weeks of weekly fertigation and bi-weekly
 * rotating sprays for every ACTIVE cycle, all posted through the real
 * `postApplication` (FEFO issue movements, application_items with PHI/REI
 * snapshots, GREATEST-updated greenhouse safety columns, audit rows).
 *
 * Fully deterministic: no RNG; every date is derived from each cycle's
 * transplant date and `state.now`. All applications are in the past.
 *
 * Demo states this produces (seed day = D):
 * - GH2's final spray (imidacloprid PHI 14 d) lands D−3 → harvest blocked
 *   until D+11 (red "No harvest" chip; Phase 5 PHI-override demo).
 * - GH1/GH3/GH4 last sprays are PHI-7 sprays 8–10 days ago → safe to harvest.
 * - Every REI (≤ 24 h) has elapsed → all houses safe to enter.
 * - Fruit Feed draws MKP to ~21 kg (< reorder 25) — matches the seeded
 *   "Order CalNit and MKP" task.
 *
 * Stock sufficiency (04-items, non-expired batches only — FEFO skips expired
 * stock): worst-case draws stay inside every item's receipts, so no top-up
 * is expected. `ensureStock` still guards each line and, if an item would run
 * short, re-receives the difference via postMovement (type receive, reason
 * "seed top-up") and logs it.
 */

type Code = (typeof DEMO_ITEMS)[number]["code"];
type Line = readonly [code: Code, perThousandLitres: number];

function itemName(code: Code): string {
  const it = DEMO_ITEMS.find((i) => i.code === code);
  if (!it) throw new Error(`seed 06: unknown item code ${code}`);
  return it.name;
}

// ── Recipes ────────────────────────────────────────────────────────────

type RecipeKey = "veg" | "fruit" | "ipm";

const DEMO_RECIPES: ReadonlyArray<{
  key: RecipeKey;
  name: string;
  type: "fertigation" | "spray";
  description: string;
  lines: ReadonlyArray<Line>;
}> = [
  {
    key: "veg",
    name: "Veg Feed",
    type: "fertigation",
    description: "Vegetative-stage feed: balanced NPK with calcium and magnesium.",
    lines: [
      ["NPK20", 4],
      ["CAN", 3],
      ["MGS", 1],
      ["MAP", 0.5],
    ],
  },
  {
    key: "fruit",
    name: "Fruit Feed",
    type: "fertigation",
    description: "Flowering/fruiting feed: high K and Ca, MKP for set, Fe chelate.",
    lines: [
      ["CAN", 9],
      ["KNO", 6],
      ["MKP", 5.5],
      ["MGS", 1.5],
      ["FEC", 0.05],
    ],
  },
  {
    key: "ipm",
    name: "IPM Spray A",
    type: "spray",
    description: "Mites/leaf-miner knockdown with protectant fungicide. REI 24 h, PHI 7 d.",
    lines: [
      ["ABM", 0.5],
      ["MCZ", 2.5],
    ],
  },
];

// ── Spray rotation ─────────────────────────────────────────────────────

type Rotation = "R1" | "R2" | "R3" | "R4";

/** R1 uses the "IPM Spray A" recipe; the others are ad-hoc tank mixes. */
const ROTATIONS: Record<
  Rotation,
  { recipe: RecipeKey | null; note: string; lines: ReadonlyArray<Line> }
> = {
  R1: {
    recipe: "ipm",
    note: "IPM Spray A (abamectin + mancozeb).",
    lines: DEMO_RECIPES.find((r) => r.key === "ipm")!.lines,
  },
  R2: {
    recipe: null,
    note: "Rotation: lambda-cyhalothrin + copper oxychloride.",
    lines: [
      ["LCH", 0.5],
      ["COX", 2.5],
    ],
  },
  R3: {
    recipe: null,
    note: "Rotation: emamectin benzoate + metalaxyl-M/mancozeb (Tuta + blight).",
    lines: [
      ["EMB", 0.2],
      ["MTX", 1.5],
    ],
  },
  R4: {
    recipe: null,
    note: "Rotation: imidacloprid + wettable sulphur (whitefly + powdery mildew).",
    lines: [
      ["IMD", 0.5],
      ["SUL", 2.5],
    ],
  },
};

/**
 * Per active cycle (by greenhouse). Sprays are 14 days apart ending
 * `lastSprayDaysAgo`; fertigations 7 days apart ending `lastFertDaysAgo`.
 * Index order fixes the deterministic volume pattern.
 */
const CYCLE_PLANS: ReadonlyArray<{
  greenhouse: string;
  sprays: readonly [Rotation, Rotation, Rotation, Rotation, Rotation];
  lastSprayDaysAgo: number;
  lastFertDaysAgo: number;
}> = [
  { greenhouse: "GH1", sprays: ["R1", "R2", "R4", "R3", "R1"], lastSprayDaysAgo: 9, lastFertDaysAgo: 2 },
  // Final spray = R4 (imidacloprid, PHI 14) three days ago → PHI still active.
  { greenhouse: "GH2", sprays: ["R1", "R2", "R3", "R1", "R4"], lastSprayDaysAgo: 3, lastFertDaysAgo: 3 },
  { greenhouse: "GH3", sprays: ["R2", "R4", "R1", "R3", "R1"], lastSprayDaysAgo: 10, lastFertDaysAgo: 4 },
  { greenhouse: "GH4", sprays: ["R4", "R1", "R3", "R2", "R1"], lastSprayDaysAgo: 8, lastFertDaysAgo: 5 },
];

const FERT_WEEKS = 10;
/** Weeks 0..VEG_WEEKS-1 get Veg Feed, the rest Fruit Feed. */
const VEG_WEEKS = 4;

/** 400–800 L in 50 L steps, deterministic per (cycle, week). */
const fertVolume = (c: number, w: number) => 400 + 50 * ((3 * c + 5 * w) % 9);
const sprayVolume = (c: number, k: number) => 400 + 50 * ((5 * c + 3 * k) % 9);

// ── Helpers ────────────────────────────────────────────────────────────

/** A member's request context, built directly (no session in a script). */
function memberCtx(state: SeedState, role: Role): Ctx {
  const u = DEMO_USERS.find((x) => x.role === role)!;
  const userId = state.userIds[role];
  return {
    userId,
    orgId: state.orgId,
    role,
    user: { id: userId, name: u.name, phoneNumber: u.phoneNumber, isPlatformAdmin: false },
    org: { id: state.orgId, name: DEMO_ORG.name, status: "trial" },
    assignedGreenhouseIds: null,
    canSeeMoney: role !== "worker",
  };
}

/** Whole days from a to b (both yyyy-MM-dd). */
function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

/** hh:00 Lagos (UTC+1, no DST) on a Lagos calendar day. */
function lagosAt(date: string, hourLagos: number): Date {
  return new Date(`${date}T${String(hourLagos - 1).padStart(2, "0")}:00:00Z`);
}

interface TopUp {
  item: string;
  quantity: number;
}

/**
 * Make sure the store can cover `qty` of the item from NON-expired batches
 * (issueFefo skips expired stock). If not, re-receive the shortfall into the
 * latest-expiring usable batch through the movement engine.
 */
async function ensureStock(
  tx: Tx,
  ctx: Ctx,
  opts: {
    itemId: string;
    itemLabel: string;
    storeId: string;
    qty: number;
    today: string;
    at: Date;
  },
): Promise<TopUp | null> {
  const candidates = await fefoCandidates(tx, ctx, opts.itemId, opts.storeId);
  const usable = candidates.filter((c) => !isExpired(c.expiryDate, opts.today));
  const available = roundQty(
    usable.reduce((s, c) => s + Math.max(0, c.onHand), 0),
  );
  if (available >= opts.qty) return null;

  const target = [...usable].sort((a, b) => {
    if (a.expiryDate === b.expiryDate) return 0;
    if (a.expiryDate === null) return 1;
    if (b.expiryDate === null) return -1;
    return a.expiryDate < b.expiryDate ? -1 : 1;
  }).at(-1);
  if (!target) {
    throw new Error(`seed 06: no unexpired batch of ${opts.itemLabel} to top up`);
  }
  const quantity = Math.ceil(opts.qty - available);
  const mv = await postMovement(tx, ctx, {
    batchId: target.id,
    storeId: opts.storeId,
    type: "receive",
    quantity,
    reason: "seed top-up",
    performedAt: new Date(opts.at.getTime() - 3600_000),
  });
  await writeAudit(tx, ctx, {
    action: "stock.receive",
    entityType: "inventory_movement",
    entityId: mv.id,
    reason: "seed top-up",
    after: { item: opts.itemLabel, quantity },
  });
  return { item: opts.itemLabel, quantity };
}

interface PlannedApplication {
  greenhouse: string;
  greenhouseId: string;
  cropCycleId: string;
  type: "fertigation" | "spray";
  recipeKey: RecipeKey | null;
  lines: ReadonlyArray<Line>;
  volume: number;
  appliedAt: Date;
  notes: string;
}

// ── Step ───────────────────────────────────────────────────────────────

export const applicationsStep: SeedStep = {
  name: "applications (recipes, weekly fertigation, rotating sprays → safety windows)",
  async run(state) {
    const { db, orgId } = state;
    const manager = memberCtx(state, "manager");
    const today = lagosDateOf(state.now);
    const storeId = state.storeIds["Input Store"];
    if (!storeId) throw new Error("seed 06: Input Store missing");

    // Item ids by catalogue code.
    const itemRows = await db
      .select({ id: items.id, name: items.name })
      .from(items)
      .where(eq(items.organisationId, orgId));
    const idByName = new Map(itemRows.map((r) => [r.name, r.id]));
    const itemId = (code: Code): string => {
      const id = idByName.get(itemName(code));
      if (!id) throw new Error(`seed 06: item ${code} not seeded`);
      return id;
    };

    // Recipes (direct insert — the recipe actions are defineActions).
    const recipeIdByKey = new Map<RecipeKey, string>();
    await db.transaction(async (tx) => {
      for (const r of DEMO_RECIPES) {
        const [row] = await tx
          .insert(recipes)
          .values({
            organisationId: orgId,
            name: r.name,
            type: r.type,
            description: r.description,
          })
          .returning({ id: recipes.id });
        await tx.insert(recipeLines).values(
          r.lines.map(([code, per]) => ({
            organisationId: orgId,
            recipeId: row.id,
            itemId: itemId(code),
            quantityPer1000L: per.toFixed(3),
          })),
        );
        await writeAudit(tx, manager, {
          action: "recipes.create",
          entityType: "recipe",
          entityId: row.id,
          after: { name: r.name, type: r.type, lines: r.lines.length },
        });
        recipeIdByKey.set(r.key, row.id);
        bump(state, "recipes");
        bump(state, "recipe_lines", r.lines.length);
        bump(state, "audit_log");
      }
    });

    // Active cycles (growing/harvesting) with their greenhouse names.
    const cycles = await db
      .select({
        id: cropCycles.id,
        greenhouseId: cropCycles.greenhouseId,
        greenhouse: greenhouses.name,
        transplantDate: cropCycles.transplantDate,
      })
      .from(cropCycles)
      .innerJoin(
        greenhouses,
        and(
          eq(greenhouses.id, cropCycles.greenhouseId),
          eq(greenhouses.organisationId, orgId),
        ),
      )
      .where(
        and(
          eq(cropCycles.organisationId, orgId),
          inArray(cropCycles.status, ["growing", "harvesting"]),
        ),
      );

    const planned: PlannedApplication[] = [];
    CYCLE_PLANS.forEach((plan, c) => {
      const cycle = cycles.find((x) => x.greenhouse === plan.greenhouse);
      if (!cycle || !cycle.transplantDate) {
        console.warn(`[seed] 06: no active transplanted cycle in ${plan.greenhouse} — skipped`);
        return;
      }
      const transplant = cycle.transplantDate;
      const sinceTransplant = daysBetween(transplant, today);

      // Weekly fertigation: offsets from transplant, last one lastFertDaysAgo.
      for (let w = 0; w < FERT_WEEKS; w++) {
        const offset =
          sinceTransplant - plan.lastFertDaysAgo - 7 * (FERT_WEEKS - 1 - w);
        if (offset < 1 || offset >= sinceTransplant) continue;
        const veg = w < VEG_WEEKS;
        planned.push({
          greenhouse: plan.greenhouse,
          greenhouseId: cycle.greenhouseId,
          cropCycleId: cycle.id,
          type: "fertigation",
          recipeKey: veg ? "veg" : "fruit",
          lines: DEMO_RECIPES.find((r) => r.key === (veg ? "veg" : "fruit"))!.lines,
          volume: fertVolume(c, w),
          appliedAt: lagosAt(addDays(transplant, offset), 8),
          notes: `Week ${w + 1} fertigation (${veg ? "Veg" : "Fruit"} Feed).`,
        });
      }

      // Bi-weekly sprays, rotating chemicals; evening application.
      plan.sprays.forEach((rot, k) => {
        const offset =
          sinceTransplant -
          plan.lastSprayDaysAgo -
          14 * (plan.sprays.length - 1 - k);
        if (offset < 1 || offset >= sinceTransplant) return;
        const r = ROTATIONS[rot];
        planned.push({
          greenhouse: plan.greenhouse,
          greenhouseId: cycle.greenhouseId,
          cropCycleId: cycle.id,
          type: "spray",
          recipeKey: r.recipe,
          lines: r.lines,
          volume: sprayVolume(c, k),
          appliedAt: lagosAt(addDays(transplant, offset), 17),
          notes: r.note,
        });
      });
    });

    planned.sort(
      (a, b) =>
        a.appliedAt.getTime() - b.appliedAt.getTime() ||
        a.greenhouse.localeCompare(b.greenhouse),
    );

    const topUps: TopUp[] = [];
    let posted = 0;
    for (const p of planned) {
      if (p.appliedAt.getTime() >= state.now.getTime()) continue; // past only
      const lines = scaleRecipe(
        p.lines.map(([code, per]) => ({ itemId: itemId(code), quantityPer1000l: per })),
        p.volume,
      );
      await db.transaction(async (tx) => {
        for (const l of lines) {
          const label = itemRows.find((r) => r.id === l.itemId)?.name ?? l.itemId;
          const t = await ensureStock(tx, manager, {
            itemId: l.itemId,
            itemLabel: label,
            storeId,
            qty: l.quantity,
            today,
            at: p.appliedAt,
          });
          if (t) topUps.push(t);
        }
        await postApplication(tx, manager, {
          greenhouseId: p.greenhouseId,
          cropCycleId: p.cropCycleId,
          type: p.type,
          recipeId: p.recipeKey ? recipeIdByKey.get(p.recipeKey)! : null,
          lines,
          waterVolumeLitres: p.volume,
          storeId,
          appliedAt: p.appliedAt,
          notes: p.notes,
        });
      });
      posted += 1;
    }
    bump(state, "applications", posted);
    bump(state, "audit_log", posted);

    // Row counts of what postApplication produced.
    const [{ n: aiCount }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(applicationItems)
      .where(eq(applicationItems.organisationId, orgId));
    const [{ n: mvCount }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(inventoryMovements)
      .innerJoin(
        applications,
        eq(applications.id, inventoryMovements.applicationId),
      )
      .where(eq(inventoryMovements.organisationId, orgId));
    bump(state, "application_items", aiCount);
    bump(state, "inventory_movements", mvCount + topUps.length);

    if (topUps.length > 0) {
      bump(state, "audit_log", topUps.length);
      console.warn("[seed] 06: stock topped up (seed top-up receives):");
      console.table(topUps);
    }
  },
};
