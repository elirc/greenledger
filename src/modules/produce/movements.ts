/**
 * THE produce movement engine — exact mirror of src/modules/stock/movements.ts
 * for harvested produce. Every produce-stock change goes through here; never
 * insert into produce_movements directly. FIFO: oldest harvested_at first
 * (spec: "Oldest stock is sold first").
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { produceLots, produceMovements } from "@/db/schema";
import { DomainError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import type { Ctx } from "@/lib/guard";
import type { Tx } from "@/db";
import { roundQty } from "@/modules/stock/logic";

export type ProduceMovementType =
  | "harvest_in"
  | "transfer_in"
  | "transfer_out"
  | "sale"
  | "waste"
  | "adjustment";

const POSITIVE: ProduceMovementType[] = ["harvest_in", "transfer_in"];
const NEGATIVE: ProduceMovementType[] = ["transfer_out", "sale", "waste"];

export function signedKg(type: ProduceMovementType, kg: number): number {
  const q = roundQty(Math.abs(kg));
  if (POSITIVE.includes(type)) return q;
  if (NEGATIVE.includes(type)) return -q;
  return roundQty(kg); // adjustment keeps caller's sign
}

export type LotRow = typeof produceLots.$inferSelect;

export async function lockLot(
  tx: Tx,
  ctx: Ctx,
  lotId: string,
): Promise<LotRow | null> {
  const rows = await tx
    .select()
    .from(produceLots)
    .where(
      and(eq(produceLots.id, lotId), eq(produceLots.organisationId, ctx.orgId)),
    )
    .for("update");
  return rows[0] ?? null;
}

export async function lotOnHand(
  tx: Tx,
  ctx: Ctx,
  lotId: string,
  storeId: string,
): Promise<number> {
  const [row] = await tx
    .select({ onHand: sql<string>`coalesce(sum(${produceMovements.kg}), 0)` })
    .from(produceMovements)
    .where(
      and(
        eq(produceMovements.organisationId, ctx.orgId),
        eq(produceMovements.produceLotId, lotId),
        eq(produceMovements.storeId, storeId),
      ),
    );
  return roundQty(Number(row?.onHand ?? 0));
}

export interface ProduceMovementInput {
  /** Client-generated UUID for offline rows; defaults to a new id. */
  id?: string;
  lotId: string;
  storeId: string;
  type: ProduceMovementType;
  /** Positive from forms; adjustment may be signed. */
  kg: number;
  saleLineId?: string | null;
  wasteReason?: string | null;
  transferId?: string | null;
  performedAt?: Date;
}

/** Post ONE produce movement with lot lock + non-negative guard. */
export async function postProduceMovement(
  tx: Tx,
  ctx: Ctx,
  input: ProduceMovementInput,
): Promise<typeof produceMovements.$inferSelect> {
  const kg = signedKg(input.type, input.kg);
  if (kg === 0) throw new DomainError("ZERO_QTY", "Weight cannot be zero.");
  if (input.type === "waste" && !input.wasteReason) {
    throw new DomainError("REASON_REQUIRED", "Waste needs a reason.");
  }
  if (input.type === "adjustment" && !input.wasteReason) {
    // adjustments reuse wasteReason as the generic reason field
    throw new DomainError("REASON_REQUIRED", "Adjustments need a reason.");
  }

  const lot = await lockLot(tx, ctx, input.lotId);
  if (!lot) throw new DomainError("NOT_FOUND", "Produce lot not found.");

  if (kg < 0) {
    const onHand = await lotOnHand(tx, ctx, input.lotId, input.storeId);
    if (onHand + kg < 0) {
      throw new DomainError(
        "INSUFFICIENT_STOCK",
        `Only ${onHand} kg of this lot is in the selected store.`,
      );
    }
  }

  const [row] = await tx
    .insert(produceMovements)
    .values({
      id: input.id ?? newId(),
      organisationId: ctx.orgId,
      produceLotId: input.lotId,
      storeId: input.storeId,
      type: input.type,
      kg: kg.toFixed(3),
      saleLineId: input.saleLineId ?? null,
      wasteReason: input.wasteReason ?? null,
      transferId: input.transferId ?? null,
      performedBy: ctx.userId,
      ...(input.performedAt ? { performedAt: input.performedAt } : {}),
    })
    .returning();
  return row;
}

export interface LotCandidate {
  id: string;
  harvestedAt: Date;
  bestBeforeDate: string;
  varietyId: string;
  onHand: number;
}

/** Lots of (crop, grade) with stock in a store, oldest harvest first. */
export async function fifoLotCandidates(
  tx: Tx,
  ctx: Ctx,
  args: { cropId: string; grade: "a" | "b" | "c" | "reject"; storeId: string },
): Promise<LotCandidate[]> {
  const rows = await tx
    .select({
      id: produceLots.id,
      harvestedAt: produceLots.harvestedAt,
      bestBeforeDate: produceLots.bestBeforeDate,
      varietyId: produceLots.varietyId,
      onHand: sql<string>`coalesce(sum(${produceMovements.kg}), 0)`,
    })
    .from(produceLots)
    .leftJoin(
      produceMovements,
      and(
        eq(produceMovements.produceLotId, produceLots.id),
        eq(produceMovements.storeId, args.storeId),
      ),
    )
    .where(
      and(
        eq(produceLots.organisationId, ctx.orgId),
        eq(produceLots.cropId, args.cropId),
        eq(produceLots.grade, args.grade),
      ),
    )
    .groupBy(
      produceLots.id,
      produceLots.harvestedAt,
      produceLots.bestBeforeDate,
      produceLots.varietyId,
    );
  return rows
    .map((r) => ({
      id: r.id,
      harvestedAt: r.harvestedAt,
      bestBeforeDate: r.bestBeforeDate,
      varietyId: r.varietyId,
      onHand: roundQty(Number(r.onHand)),
    }))
    .filter((r) => r.onHand > 0)
    .sort((a, b) => a.harvestedAt.getTime() - b.harvestedAt.getTime());
}

/**
 * FIFO-allocate a sale line's kg across lots (oldest first), locking the
 * chosen lots in order and posting negative `sale` movements.
 */
export async function allocateSale(
  tx: Tx,
  ctx: Ctx,
  args: {
    cropId: string;
    grade: "a" | "b" | "c" | "reject";
    storeId: string;
    kg: number;
    saleLineId: string;
    performedAt?: Date;
  },
): Promise<{ allocations: { lotId: string; kg: number }[] }> {
  const candidates = await fifoLotCandidates(tx, ctx, args);
  const plan: { lotId: string; kg: number }[] = [];
  let remaining = roundQty(args.kg);
  for (const c of candidates) {
    if (remaining <= 0) break;
    const take = roundQty(Math.min(c.onHand, remaining));
    if (take <= 0) continue;
    plan.push({ lotId: c.id, kg: take });
    remaining = roundQty(remaining - take);
  }
  if (plan.length === 0) {
    throw new DomainError("NO_STOCK", "No produce of that grade in this store.");
  }
  if (remaining > 0) {
    throw new DomainError(
      "INSUFFICIENT_STOCK",
      `Short by ${remaining} kg — not enough of that grade in this store.`,
    );
  }

  await tx
    .select({ id: produceLots.id })
    .from(produceLots)
    .where(
      and(
        eq(produceLots.organisationId, ctx.orgId),
        inArray(
          produceLots.id,
          plan.map((p) => p.lotId),
        ),
      ),
    )
    .for("update");

  for (const alloc of plan) {
    const onHand = await lotOnHand(tx, ctx, alloc.lotId, args.storeId);
    if (onHand < alloc.kg) {
      throw new DomainError(
        "INSUFFICIENT_STOCK",
        "Produce stock changed while posting — try again.",
      );
    }
    await postProduceMovement(tx, ctx, {
      lotId: alloc.lotId,
      storeId: args.storeId,
      type: "sale",
      kg: alloc.kg,
      saleLineId: args.saleLineId,
      performedAt: args.performedAt,
    });
  }
  return { allocations: plan };
}

/** Two rows (out/in) sharing a transferId — cold room ↔ packhouse moves. */
export async function postProduceTransfer(
  tx: Tx,
  ctx: Ctx,
  input: {
    lotId: string;
    fromStoreId: string;
    toStoreId: string;
    kg: number;
  },
): Promise<{ transferId: string }> {
  if (input.fromStoreId === input.toStoreId) {
    throw new DomainError("SAME_STORE", "Choose two different stores.");
  }
  const transferId = newId();
  await postProduceMovement(tx, ctx, {
    lotId: input.lotId,
    storeId: input.fromStoreId,
    type: "transfer_out",
    kg: input.kg,
    transferId,
  });
  await postProduceMovement(tx, ctx, {
    lotId: input.lotId,
    storeId: input.toStoreId,
    type: "transfer_in",
    kg: input.kg,
    transferId,
  });
  return { transferId };
}
