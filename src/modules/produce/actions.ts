"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { stores } from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import { postProduceMovement, postProduceTransfer } from "./movements";
import {
  produceTransferSchema,
  produceWasteSchema,
  wasteReasonText,
} from "./schema";

function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  if ((e as { code?: unknown }).code === "23505") return true;
  return (e as { cause?: { code?: string } }).cause?.code === "23505";
}

/** FKs don't check the organisation — every store must be ours. */
async function assertStores(tx: Tx, ctx: Ctx, ids: string[]) {
  const unique = [...new Set(ids)];
  const rows = await tx
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.organisationId, ctx.orgId), inArray(stores.id, unique)));
  if (rows.length !== unique.length) {
    throw new DomainError("NOT_FOUND", "Store not found.");
  }
}

function revalidateProduce() {
  revalidatePath("/produce", "layout");
  revalidatePath("/harvest", "layout");
  revalidatePath("/");
}

/** Write off produce from one lot in one store (spoiled, damaged, …). */
export const recordProduceWaste = defineAction({
  name: "produce.waste",
  schema: produceWasteSchema,
  roles: ["owner", "manager", "storekeeper"],
  handler: async (input, ctx) => {
    const wasteReason = wasteReasonText(input.reason, input.note);
    try {
      const movementId = await db.transaction(async (tx) => {
        await assertStores(tx, ctx, [input.storeId]);
        const mv = await postProduceMovement(tx, ctx, {
          id: input.clientId,
          lotId: input.lotId,
          storeId: input.storeId,
          type: "waste",
          kg: input.kg,
          wasteReason,
        });
        await writeAudit(tx, ctx, {
          action: "produce.waste",
          entityType: "produce_movement",
          entityId: mv.id,
          after: {
            lotId: input.lotId,
            storeId: input.storeId,
            kg: input.kg,
            wasteReason,
          },
          reason: wasteReason,
        });
        return mv.id;
      });
      revalidateProduce();
      return { duplicate: false, movementId, kg: input.kg };
    } catch (e) {
      if (isUniqueViolation(e)) {
        return { duplicate: true, movementId: input.clientId, kg: input.kg };
      }
      throw e;
    }
  },
});

/** Move kg of one lot between produce stores (packhouse ↔ cold room). */
export const transferProduce = defineAction({
  name: "produce.transfer",
  schema: produceTransferSchema,
  roles: ["owner", "manager", "storekeeper"],
  handler: async (input, ctx) => {
    const result = await db.transaction(async (tx) => {
      await assertStores(tx, ctx, [input.fromStoreId, input.toStoreId]);
      const { transferId } = await postProduceTransfer(tx, ctx, {
        lotId: input.lotId,
        fromStoreId: input.fromStoreId,
        toStoreId: input.toStoreId,
        kg: input.kg,
      });
      await writeAudit(tx, ctx, {
        action: "produce.transfer",
        entityType: "produce_lot",
        entityId: input.lotId,
        after: {
          transferId,
          fromStoreId: input.fromStoreId,
          toStoreId: input.toStoreId,
          kg: input.kg,
        },
      });
      return { transferId, kg: input.kg };
    });
    revalidateProduce();
    return result;
  },
});
