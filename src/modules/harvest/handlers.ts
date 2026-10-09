/**
 * Harvest-entry handler, plain module (NOT 'use server') per DECISIONS §17 so
 * the Phase-6 /api/sync route can dispatch to the same code the Server
 * Action runs. No revalidatePath here.
 *
 * Posting itself is the orchestrator-owned postHarvest (produce/harvest-post),
 * which enforces the PHI gate (PHI_BLOCKED unless an override is passed).
 * This layer adds: the override role gate (FORBIDDEN_OVERRIDE, checked
 * before anything else), assigned-greenhouse check, org-owned refs, blank
 * grade rows skipped, and clientId replay → `{ duplicate: true }`.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { greenhouses, stores } from "@/db/schema";
import { DomainError } from "@/lib/errors";
import { assertGreenhouse, type Ctx } from "@/lib/guard";
import { lagosLocalToDate } from "@/modules/applications/schema";
import { postHarvest } from "@/modules/produce/harvest-post";
import { roundQty } from "@/modules/stock/logic";
import { PRODUCE_STORE_TYPES } from "./queries";
import type { HarvestCreateInput } from "./schema";

/** Allow small clock skew between the phone and the server. */
const FUTURE_SKEW_MS = 10 * 60_000;

function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  if ((e as { code?: unknown }).code === "23505") return true;
  return (e as { cause?: { code?: string } }).cause?.code === "23505";
}

export interface PostHarvestHandlerResult {
  /** true when this clientId was already posted (offline replay). */
  duplicate: boolean;
  harvestId: string;
  greenhouseId: string;
  cropCycleId: string;
  lotIds: string[];
  overrideUsed: boolean;
  totalKg: number;
}

/** FKs don't check the organisation — verify every referenced row is ours. */
async function assertRefs(tx: Tx, ctx: Ctx, input: HarvestCreateInput) {
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

  const [store] = await tx
    .select({ id: stores.id })
    .from(stores)
    .where(
      and(
        eq(stores.id, input.storeId),
        eq(stores.organisationId, ctx.orgId),
        inArray(stores.type, PRODUCE_STORE_TYPES),
      ),
    );
  if (!store) {
    throw new DomainError(
      "BAD_STORE",
      "Pick a packhouse or cold room for the harvested produce.",
    );
  }
}

/** (input, ctx) handler: own transaction + error mapping. */
export async function postHarvestHandler(
  input: HarvestCreateInput,
  ctx: Ctx,
): Promise<PostHarvestHandlerResult> {
  // Spec: only a manager (or owner) may override a pre-harvest interval.
  if (input.override && ctx.role !== "owner" && ctx.role !== "manager") {
    throw new DomainError(
      "FORBIDDEN_OVERRIDE",
      "Only a manager or owner can override a pre-harvest interval.",
    );
  }
  assertGreenhouse(ctx, input.greenhouseId);

  const harvestedAt = lagosLocalToDate(input.harvestedAt);
  if (!harvestedAt) {
    throw new DomainError("BAD_DATE", "Enter a valid date and time.");
  }
  if (harvestedAt.getTime() > Date.now() + FUTURE_SKEW_MS) {
    throw new DomainError("BAD_DATE", "The harvest time cannot be in the future.");
  }

  const lines = input.lines
    .filter((l) => l.kg !== undefined && roundQty(l.kg) > 0)
    .map((l) => ({
      grade: l.grade,
      crates: l.crates ?? 0,
      kg: roundQty(l.kg as number),
    }));
  if (lines.length === 0) {
    throw new DomainError("NO_LINES", "Enter the kg for at least one grade.");
  }
  const totalKg = roundQty(lines.reduce((a, l) => a + l.kg, 0));

  try {
    const result = await db.transaction(async (tx) => {
      await assertRefs(tx, ctx, input);
      return postHarvest(tx, ctx, {
        id: input.clientId,
        greenhouseId: input.greenhouseId,
        cropCycleId: input.cropCycleId,
        storeId: input.storeId,
        harvestedAt,
        lines,
        notes: input.notes && input.notes.length > 0 ? input.notes : null,
        override: input.override ? { reason: input.override.reason } : null,
      });
    });
    return {
      duplicate: false,
      harvestId: result.harvestId,
      greenhouseId: input.greenhouseId,
      cropCycleId: input.cropCycleId,
      lotIds: result.lotIds,
      overrideUsed: result.overrideUsed,
      totalKg,
    };
  } catch (e) {
    if (isUniqueViolation(e)) {
      // Replayed clientId: the harvest already exists — treat as success.
      return {
        duplicate: true,
        harvestId: input.clientId,
        greenhouseId: input.greenhouseId,
        cropCycleId: input.cropCycleId,
        lotIds: [],
        overrideUsed: false,
        totalKg,
      };
    }
    throw e;
  }
}
