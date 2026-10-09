/**
 * Application-logging handler, plain module (NOT 'use server') per
 * DECISIONS §17 so the Phase-6 /api/sync route can dispatch to the same
 * code the Server Action runs. No revalidatePath here.
 *
 * Posting itself is the orchestrator-owned postApplication (post.ts); this
 * layer adds the guards (assigned greenhouse, org-owned refs, active cycle,
 * recipe type) and turns stock failures into messages that name the item.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { cropCycles, greenhouses, items, recipes, stores } from "@/db/schema";
import { todayLagos } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { assertGreenhouse, type Ctx } from "@/lib/guard";
import { formatQty } from "@/lib/units";
import { ACTIVE_CYCLE_STATUSES, type CycleStatus } from "@/modules/cycles/status";
import { fefoCandidates } from "@/modules/stock/movements";
import { allocateFefo, isExpired, roundQty } from "@/modules/stock/logic";
import { postApplication } from "./post";
import { lagosLocalToDate, type ApplicationCreateInput } from "./schema";

/** Allow small clock skew between the phone and the server. */
const FUTURE_SKEW_MS = 10 * 60_000;

const STOCK_CODES = new Set(["NO_STOCK", "INSUFFICIENT_STOCK", "EXPIRED_BATCH"]);

function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  if ((e as { code?: unknown }).code === "23505") return true;
  return (e as { cause?: { code?: string } }).cause?.code === "23505";
}

/** FKs don't check the organisation — verify every referenced row is ours. */
async function assertRefs(tx: Tx, ctx: Ctx, input: ApplicationCreateInput) {
  const [gh] = await tx
    .select({ id: greenhouses.id, isActive: greenhouses.isActive })
    .from(greenhouses)
    .where(
      and(
        eq(greenhouses.id, input.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    );
  if (!gh) throw new DomainError("NOT_FOUND", "Greenhouse not found.");
  if (!gh.isActive) {
    throw new DomainError("INACTIVE", "This greenhouse is no longer active.");
  }

  const [cycle] = await tx
    .select({
      id: cropCycles.id,
      greenhouseId: cropCycles.greenhouseId,
      status: cropCycles.status,
    })
    .from(cropCycles)
    .where(
      and(
        eq(cropCycles.id, input.cropCycleId),
        eq(cropCycles.organisationId, ctx.orgId),
      ),
    );
  if (!cycle) throw new DomainError("NOT_FOUND", "Crop cycle not found.");
  if (cycle.greenhouseId !== input.greenhouseId) {
    throw new DomainError(
      "CYCLE_MISMATCH",
      "That cycle is not in the selected greenhouse.",
    );
  }
  if (!ACTIVE_CYCLE_STATUSES.includes(cycle.status as CycleStatus)) {
    throw new DomainError(
      "CYCLE_NOT_ACTIVE",
      "Applications can only be logged on active crop cycles.",
    );
  }

  const [store] = await tx
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.id, input.storeId), eq(stores.organisationId, ctx.orgId)));
  if (!store) throw new DomainError("NOT_FOUND", "Store not found.");

  if (input.recipeId) {
    const [recipe] = await tx
      .select({ id: recipes.id, type: recipes.type })
      .from(recipes)
      .where(
        and(eq(recipes.id, input.recipeId), eq(recipes.organisationId, ctx.orgId)),
      );
    if (!recipe) throw new DomainError("NOT_FOUND", "Recipe not found.");
    if (recipe.type !== input.type) {
      throw new DomainError(
        "RECIPE_TYPE_MISMATCH",
        "That recipe is for a different application type.",
      );
    }
  }
}

/**
 * After a stock failure rolled the posting back, find which line could not
 * be covered and say so by name. Read-only (no locks); falls back to the
 * engine's own message if every line now looks coverable (a race).
 */
async function describeShortage(
  ctx: Ctx,
  input: ApplicationCreateInput,
  fallback: DomainError,
): Promise<DomainError> {
  return db.transaction(async (tx) => {
    const ids = input.lines.map((l) => l.itemId);
    const [itemRows, [store]] = await Promise.all([
      tx
        .select({ id: items.id, name: items.name, baseUnit: items.baseUnit })
        .from(items)
        .where(and(eq(items.organisationId, ctx.orgId), inArray(items.id, ids))),
      tx
        .select({ name: stores.name })
        .from(stores)
        .where(
          and(eq(stores.id, input.storeId), eq(stores.organisationId, ctx.orgId)),
        ),
    ]);
    const byId = new Map(itemRows.map((i) => [i.id, i]));
    const storeName = store?.name ?? "the selected store";
    const today = todayLagos();

    for (const line of input.lines) {
      const item = byId.get(line.itemId);
      if (!item) continue;
      const candidates = await fefoCandidates(tx, ctx, line.itemId, input.storeId);
      const plan = allocateFefo(candidates, line.quantity, {
        includeExpired: false,
        today,
      });
      const need = formatQty(roundQty(line.quantity), item.baseUnit);
      if (plan.allocations.length === 0) {
        const expiredOnly = candidates.some(
          (c) => c.onHand > 0 && isExpired(c.expiryDate, today),
        );
        return expiredOnly
          ? new DomainError(
              "EXPIRED_BATCH",
              `Only expired ${item.name} is left in ${storeName}. Receive fresh stock, or ask a manager to issue the expired batch from the store with an override.`,
            )
          : new DomainError(
              "NO_STOCK",
              `There is no ${item.name} in ${storeName}. Receive stock or pick another store.`,
            );
      }
      if (plan.shortfall > 0) {
        const have = formatQty(
          roundQty(line.quantity - plan.shortfall),
          item.baseUnit,
        );
        return new DomainError(
          "INSUFFICIENT_STOCK",
          `Not enough ${item.name} in ${storeName}: this needs ${need} but only ${have} is usable.`,
        );
      }
    }
    return fallback;
  });
}

/** (input, ctx) handler: own transaction + error mapping. */
export async function logApplicationHandler(
  input: ApplicationCreateInput,
  ctx: Ctx,
): Promise<{
  id: string;
  greenhouseId: string;
  cropCycleId: string;
  entrySafeAt: string | null;
  harvestSafeDate: string | null;
}> {
  assertGreenhouse(ctx, input.greenhouseId);

  const appliedAt = lagosLocalToDate(input.appliedAt);
  if (!appliedAt) {
    throw new DomainError("BAD_DATE", "Enter a valid date and time.");
  }
  if (appliedAt.getTime() > Date.now() + FUTURE_SKEW_MS) {
    throw new DomainError("BAD_DATE", "The application time cannot be in the future.");
  }

  try {
    const result = await db.transaction(async (tx) => {
      await assertRefs(tx, ctx, input);
      return postApplication(tx, ctx, {
        id: input.clientId,
        greenhouseId: input.greenhouseId,
        cropCycleId: input.cropCycleId,
        type: input.type,
        recipeId: input.recipeId ?? null,
        lines: input.lines.map((l) => ({
          itemId: l.itemId,
          quantity: roundQty(l.quantity),
        })),
        waterVolumeLitres: input.waterVolumeLitres,
        storeId: input.storeId,
        appliedAt,
        notes: input.notes && input.notes.length > 0 ? input.notes : null,
      });
    });
    return {
      id: result.applicationId,
      greenhouseId: input.greenhouseId,
      cropCycleId: input.cropCycleId,
      entrySafeAt: result.entrySafeAt ? result.entrySafeAt.toISOString() : null,
      harvestSafeDate: result.harvestSafeDate,
    };
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new DomainError("DUPLICATE", "This application was already recorded.");
    }
    if (e instanceof DomainError && STOCK_CODES.has(e.code)) {
      throw await describeShortage(ctx, input, e);
    }
    throw e;
  }
}
