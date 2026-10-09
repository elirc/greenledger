/**
 * Stock-issue handler, plain module (NOT 'use server') per DECISIONS §17 so
 * the /api/sync route ("stock.issue") can dispatch to the same code the
 * Server Action runs. No revalidatePath here — actions.ts revalidates.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { cropCycles, greenhouses, itemBatches, stores } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { todayLagos } from "@/lib/dates";
import { AuthError, DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import type { Role } from "@/lib/permissions";
import { isExpired } from "./logic";
import {
  assertBatchNotExpired,
  issueFefo,
  lockBatch,
  postMovement,
} from "./movements";
import type { IssueStockInput } from "./schema";

export const STOCK_ROLES: Role[] = ["owner", "manager", "storekeeper"];
/** Spec capability matrix: expired-issue overrides are owner/manager only. */
export const OVERRIDE_ROLES: Role[] = ["owner", "manager"];

export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "cause" in e &&
    (e as { cause?: { code?: string } }).cause?.code === "23505"
  );
}

/** FKs don't check the organisation — verify every referenced row is ours. */
export async function assertRefs(
  tx: Tx,
  ctx: Ctx,
  refs: {
    storeIds?: string[];
    greenhouseId?: string;
    cropCycleId?: string;
  },
): Promise<void> {
  if (refs.storeIds?.length) {
    const ids = [...new Set(refs.storeIds)];
    const rows = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.organisationId, ctx.orgId), inArray(stores.id, ids)));
    if (rows.length !== ids.length) {
      throw new DomainError("NOT_FOUND", "Store not found.");
    }
  }
  if (refs.greenhouseId) {
    const [gh] = await tx
      .select({ id: greenhouses.id })
      .from(greenhouses)
      .where(
        and(
          eq(greenhouses.organisationId, ctx.orgId),
          eq(greenhouses.id, refs.greenhouseId),
        ),
      );
    if (!gh) throw new DomainError("NOT_FOUND", "Greenhouse not found.");
  }
  if (refs.cropCycleId) {
    const [cycle] = await tx
      .select({ id: cropCycles.id, greenhouseId: cropCycles.greenhouseId })
      .from(cropCycles)
      .where(
        and(
          eq(cropCycles.organisationId, ctx.orgId),
          eq(cropCycles.id, refs.cropCycleId),
        ),
      );
    if (!cycle) throw new DomainError("NOT_FOUND", "Crop cycle not found.");
    if (refs.greenhouseId && cycle.greenhouseId !== refs.greenhouseId) {
      throw new DomainError(
        "CYCLE_MISMATCH",
        "That crop cycle belongs to a different greenhouse.",
      );
    }
  }
}

/** Lock a batch and check it belongs to the item the user picked. */
export async function lockItemBatch(
  tx: Tx,
  ctx: Ctx,
  batchId: string,
  itemId: string,
) {
  const batch = await lockBatch(tx, ctx, batchId);
  if (!batch) throw new DomainError("NOT_FOUND", "Batch not found.");
  if (batch.itemId !== itemId) {
    throw new DomainError("BATCH_MISMATCH", "That batch is for a different item.");
  }
  return batch;
}

export interface IssueStockResult {
  movementId: string;
  allocations: { batchId: string; quantity: number }[];
  expiredOverride: boolean;
}

/**
 * Issue stock to a greenhouse / crop cycle. FEFO auto-pick (may split
 * across batches) unless a batch is chosen. Expired stock needs an
 * owner/manager override with a reason (movement.reason + audit).
 * `clientId` becomes the first movement row's id, so a replay that slips
 * past sync_ops still hits a PK conflict → DUPLICATE.
 *
 * Role gate lives here too: the sync route has no per-op roles.
 */
export async function issueStockHandler(
  input: IssueStockInput,
  ctx: Ctx,
): Promise<IssueStockResult> {
  if (!STOCK_ROLES.includes(ctx.role)) throw new AuthError("FORBIDDEN");
  if (input.override && !OVERRIDE_ROLES.includes(ctx.role)) {
    throw new DomainError(
      "FORBIDDEN_OVERRIDE",
      "Only an owner or farm manager can issue expired stock.",
    );
  }
  try {
    return await db.transaction(async (tx) => {
      await assertRefs(tx, ctx, {
        storeIds: [input.storeId],
        greenhouseId: input.greenhouseId,
        cropCycleId: input.cropCycleId,
      });
      const overrideReason = input.override?.reason ?? null;
      let allocations: { batchId: string; quantity: number }[];
      let firstMovementId: string;
      let expiredUsed = false;

      if (input.batchId) {
        const batch = await lockItemBatch(tx, ctx, input.batchId, input.itemId);
        assertBatchNotExpired(batch, input.override);
        expiredUsed = isExpired(batch.expiryDate, todayLagos());
        const mv = await postMovement(tx, ctx, {
          id: input.clientId,
          batchId: batch.id,
          storeId: input.storeId,
          type: "issue",
          quantity: input.quantity,
          greenhouseId: input.greenhouseId,
          cropCycleId: input.cropCycleId,
          reason: expiredUsed ? overrideReason : null,
        });
        allocations = [{ batchId: batch.id, quantity: input.quantity }];
        firstMovementId = mv.id;
      } else {
        const result = await issueFefo(tx, ctx, {
          itemId: input.itemId,
          storeId: input.storeId,
          quantity: input.quantity,
          greenhouseId: input.greenhouseId,
          cropCycleId: input.cropCycleId,
          allowExpired: Boolean(input.override),
          reason: overrideReason,
          firstMovementId: input.clientId,
        });
        allocations = result.allocations;
        firstMovementId = result.movements[0].id;
        if (input.override) {
          const used = await tx
            .select({ expiryDate: itemBatches.expiryDate })
            .from(itemBatches)
            .where(
              and(
                eq(itemBatches.organisationId, ctx.orgId),
                inArray(
                  itemBatches.id,
                  allocations.map((a) => a.batchId),
                ),
              ),
            );
          const today = todayLagos();
          expiredUsed = used.some((b) => isExpired(b.expiryDate, today));
        }
      }

      await writeAudit(tx, ctx, {
        action: expiredUsed ? "store.issueStock.override" : "store.issueStock",
        entityType: "inventory_movement",
        entityId: firstMovementId,
        after: {
          itemId: input.itemId,
          storeId: input.storeId,
          quantity: input.quantity,
          greenhouseId: input.greenhouseId ?? null,
          cropCycleId: input.cropCycleId ?? null,
          allocations,
          expiredOverride: expiredUsed,
        },
        reason: expiredUsed ? (overrideReason ?? undefined) : undefined,
      });
      return {
        movementId: firstMovementId,
        allocations,
        expiredOverride: expiredUsed,
      };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new DomainError("DUPLICATE", "This issue was already recorded.");
    }
    throw e;
  }
}
