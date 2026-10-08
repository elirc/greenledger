/**
 * THE transactional movement engine. Every input-stock change in the app goes
 * through these functions — never insert into inventory_movements directly.
 *
 * Invariants enforced here (spec rules):
 * - one database transaction with row locks on the parent item_batches rows;
 * - stock on hand = SUM(movements) can never go negative;
 * - movements are append-only; corrections are new `adjustment` rows;
 * - quantities are SIGNED by type (receive/transfer_in/return positive,
 *   issue/transfer_out negative, adjustment either).
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { inventoryMovements, itemBatches } from "@/db/schema";
import { DomainError } from "@/lib/errors";
import { todayLagos } from "@/lib/dates";
import { newId } from "@/lib/ids";
import type { Ctx } from "@/lib/guard";
import type { Tx } from "@/db";
import {
  allocateFefo,
  isExpired,
  roundQty,
  type FefoCandidate,
} from "./logic";

export type MovementType =
  | "receive"
  | "issue"
  | "transfer_in"
  | "transfer_out"
  | "adjustment"
  | "return";

const POSITIVE_TYPES: MovementType[] = ["receive", "transfer_in", "return"];
const NEGATIVE_TYPES: MovementType[] = ["issue", "transfer_out"];

/** Forms submit positive quantities; the type fixes the sign (DECISIONS §15.1). */
export function signedQty(type: MovementType, qty: number): number {
  const q = roundQty(Math.abs(qty));
  if (POSITIVE_TYPES.includes(type)) return q;
  if (NEGATIVE_TYPES.includes(type)) return -q;
  return roundQty(qty); // adjustment keeps the caller's sign
}

export interface MovementLinks {
  greenhouseId?: string | null;
  cropCycleId?: string | null;
  applicationId?: string | null;
  receiptLineId?: string | null;
  stockCountId?: string | null;
  transferId?: string | null;
  reason?: string | null;
  performedAt?: Date;
}

export interface MovementInput extends MovementLinks {
  /** Client-generated UUID for offline-created rows; defaults to a new id. */
  id?: string;
  batchId: string;
  storeId: string;
  type: MovementType;
  /** Positive from forms; adjustment may be signed. */
  quantity: number;
}

export type BatchRow = typeof itemBatches.$inferSelect;

/** SELECT ... FOR UPDATE on the batch row — the lock for all stock math. */
export async function lockBatch(
  tx: Tx,
  ctx: Ctx,
  batchId: string,
): Promise<BatchRow | null> {
  const rows = await tx
    .select()
    .from(itemBatches)
    .where(
      and(
        eq(itemBatches.id, batchId),
        eq(itemBatches.organisationId, ctx.orgId),
      ),
    )
    .for("update");
  return rows[0] ?? null;
}

export async function batchOnHand(
  tx: Tx,
  ctx: Ctx,
  batchId: string,
  storeId: string,
): Promise<number> {
  const [row] = await tx
    .select({
      onHand: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
    })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.organisationId, ctx.orgId),
        eq(inventoryMovements.itemBatchId, batchId),
        eq(inventoryMovements.storeId, storeId),
      ),
    );
  return roundQty(Number(row?.onHand ?? 0));
}

export function assertBatchNotExpired(
  batch: Pick<BatchRow, "expiryDate">,
  override?: { reason: string },
): void {
  if (isExpired(batch.expiryDate, todayLagos()) && !override) {
    throw new DomainError(
      "EXPIRED_BATCH",
      "This batch is expired. A manager override with a reason is required to issue it.",
    );
  }
}

/**
 * Post ONE movement. Caller provides an open transaction. Locks the batch,
 * re-checks on-hand for outbound types, inserts the signed row.
 */
export async function postMovement(
  tx: Tx,
  ctx: Ctx,
  input: MovementInput,
): Promise<typeof inventoryMovements.$inferSelect> {
  const qty = signedQty(input.type, input.quantity);
  if (qty === 0) throw new DomainError("ZERO_QTY", "Quantity cannot be zero.");
  if (input.type === "adjustment" && !input.reason) {
    throw new DomainError("REASON_REQUIRED", "Adjustments need a reason.");
  }

  const batch = await lockBatch(tx, ctx, input.batchId);
  if (!batch) throw new DomainError("NOT_FOUND", "Batch not found.");

  if (qty < 0) {
    const onHand = await batchOnHand(tx, ctx, input.batchId, input.storeId);
    if (onHand + qty < 0) {
      throw new DomainError(
        "INSUFFICIENT_STOCK",
        `Only ${onHand} available in this store for batch ${batch.batchNumber}.`,
      );
    }
  }

  const [row] = await tx
    .insert(inventoryMovements)
    .values({
      id: input.id ?? newId(),
      organisationId: ctx.orgId,
      itemId: batch.itemId,
      itemBatchId: input.batchId,
      storeId: input.storeId,
      type: input.type,
      quantity: qty.toFixed(3),
      greenhouseId: input.greenhouseId ?? null,
      cropCycleId: input.cropCycleId ?? null,
      applicationId: input.applicationId ?? null,
      receiptLineId: input.receiptLineId ?? null,
      stockCountId: input.stockCountId ?? null,
      transferId: input.transferId ?? null,
      reason: input.reason ?? null,
      performedBy: ctx.userId,
      ...(input.performedAt ? { performedAt: input.performedAt } : {}),
    })
    .returning();
  return row;
}

/** Per-batch on-hand candidates for an item in a store (no locks — preview). */
export async function fefoCandidates(
  tx: Tx,
  ctx: Ctx,
  itemId: string,
  storeId: string,
): Promise<FefoCandidate[]> {
  const rows = await tx
    .select({
      id: itemBatches.id,
      expiryDate: itemBatches.expiryDate,
      receivedAt: itemBatches.receivedAt,
      onHand: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
    })
    .from(itemBatches)
    .leftJoin(
      inventoryMovements,
      and(
        eq(inventoryMovements.itemBatchId, itemBatches.id),
        eq(inventoryMovements.storeId, storeId),
      ),
    )
    .where(
      and(
        eq(itemBatches.organisationId, ctx.orgId),
        eq(itemBatches.itemId, itemId),
      ),
    )
    .groupBy(itemBatches.id, itemBatches.expiryDate, itemBatches.receivedAt);
  return rows.map((r) => ({
    id: r.id,
    expiryDate: r.expiryDate,
    receivedAt: r.receivedAt,
    onHand: roundQty(Number(r.onHand)),
  }));
}

export interface IssueFefoInput extends MovementLinks {
  itemId: string;
  storeId: string;
  quantity: number;
  /** Manager override: also draw from expired batches. */
  allowExpired?: boolean;
  /** Client UUID used for the FIRST movement row (offline idempotency). */
  firstMovementId?: string;
}

/**
 * Issue `quantity`, splitting across batches earliest-expiry-first. Locks the
 * chosen batches in FEFO order (stable order = no deadlocks), re-checks each
 * on-hand after locking, then posts one `issue` movement per batch.
 */
export async function issueFefo(
  tx: Tx,
  ctx: Ctx,
  input: IssueFefoInput,
): Promise<{
  movements: (typeof inventoryMovements.$inferSelect)[];
  allocations: { batchId: string; quantity: number }[];
}> {
  const today = todayLagos();
  const candidates = await fefoCandidates(
    tx,
    ctx,
    input.itemId,
    input.storeId,
  );
  const plan = allocateFefo(candidates, input.quantity, {
    includeExpired: input.allowExpired ?? false,
    today,
  });
  if (plan.allocations.length === 0) {
    const expiredOnly = candidates.some(
      (c) => c.onHand > 0 && isExpired(c.expiryDate, today),
    );
    throw new DomainError(
      expiredOnly ? "EXPIRED_BATCH" : "NO_STOCK",
      expiredOnly
        ? "Only expired batches hold stock. A manager override is required."
        : "No stock of this item in the selected store.",
    );
  }
  if (plan.shortfall > 0) {
    throw new DomainError(
      "INSUFFICIENT_STOCK",
      `Short by ${plan.shortfall} — not enough stock in this store.`,
    );
  }

  // Lock in FEFO order, re-verify under lock, then post.
  const batchIds = plan.allocations.map((a) => a.batchId);
  await tx
    .select({ id: itemBatches.id })
    .from(itemBatches)
    .where(
      and(
        eq(itemBatches.organisationId, ctx.orgId),
        inArray(itemBatches.id, batchIds),
      ),
    )
    .for("update");

  const movements = [];
  let first = true;
  for (const alloc of plan.allocations) {
    const onHand = await batchOnHand(tx, ctx, alloc.batchId, input.storeId);
    if (onHand < alloc.quantity) {
      throw new DomainError(
        "INSUFFICIENT_STOCK",
        "Stock changed while posting — try again.",
      );
    }
    movements.push(
      await postMovement(tx, ctx, {
        id: first ? input.firstMovementId : undefined,
        batchId: alloc.batchId,
        storeId: input.storeId,
        type: "issue",
        quantity: alloc.quantity,
        greenhouseId: input.greenhouseId,
        cropCycleId: input.cropCycleId,
        applicationId: input.applicationId,
        reason: input.reason,
        performedAt: input.performedAt,
      }),
    );
    first = false;
  }
  return { movements, allocations: plan.allocations };
}

export interface TransferInput {
  batchId: string;
  fromStoreId: string;
  toStoreId: string;
  quantity: number;
  reason?: string | null;
}

/** Two movement rows (out negative, in positive) sharing one transferId. */
export async function postTransfer(
  tx: Tx,
  ctx: Ctx,
  input: TransferInput,
): Promise<{ transferId: string }> {
  if (input.fromStoreId === input.toStoreId) {
    throw new DomainError("SAME_STORE", "Choose two different stores.");
  }
  const transferId = newId();
  await postMovement(tx, ctx, {
    batchId: input.batchId,
    storeId: input.fromStoreId,
    type: "transfer_out",
    quantity: input.quantity,
    transferId,
    reason: input.reason,
  });
  await postMovement(tx, ctx, {
    batchId: input.batchId,
    storeId: input.toStoreId,
    type: "transfer_in",
    quantity: input.quantity,
    transferId,
    reason: input.reason,
  });
  return { transferId };
}
