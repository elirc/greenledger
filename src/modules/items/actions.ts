"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { itemBatches, items } from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import {
  itemCreateSchema,
  itemUpdateSchema,
  type ItemCreateInput,
} from "./schema";

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "cause" in e &&
    (e as { cause?: { code?: string } }).cause?.code === "23505"
  );
}

const emptyToNull = (s: string | undefined) =>
  s && s.length > 0 ? s : null;

/** Map validated input to column values; numerics go in as fixed strings. */
function toColumns(input: ItemCreateInput) {
  const isChem = input.category === "agrochemical";
  const isFert = input.category === "fertiliser";
  const pct = (n: number | undefined) =>
    isFert && n !== undefined ? n.toFixed(2) : null;
  return {
    name: input.name,
    category: input.category,
    baseUnit: input.baseUnit,
    reorderLevel: input.reorderLevel.toFixed(3),
    activeIngredient: isChem ? emptyToNull(input.activeIngredient) : null,
    phiDays: isChem ? (input.phiDays ?? null) : null,
    reiHours: isChem ? (input.reiHours ?? null) : null,
    nPct: pct(input.nPct),
    pPct: pct(input.pPct),
    kPct: pct(input.kPct),
    notes: emptyToNull(input.notes),
    isActive: input.isActive,
  };
}

const DUPLICATE_MSG = "An item with this name already exists.";

function revalidateItems(id: string) {
  revalidatePath("/store");
  revalidatePath(`/store/items/${id}`);
}

export const createItem = defineAction({
  name: "items.create",
  schema: itemCreateSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) => {
    try {
      const result = await db.transaction(async (tx) => {
        const values = toColumns(input);
        const [row] = await tx
          .insert(items)
          .values({ organisationId: ctx.orgId, ...values })
          .returning({ id: items.id });
        await writeAudit(tx, ctx, {
          action: "items.create",
          entityType: "item",
          entityId: row.id,
          after: values,
        });
        return { id: row.id };
      });
      revalidateItems(result.id);
      return result;
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", DUPLICATE_MSG);
      throw e;
    }
  },
});

export const updateItem = defineAction({
  name: "items.update",
  schema: itemUpdateSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) => {
    try {
      const result = await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(items)
          .where(
            and(eq(items.id, input.id), eq(items.organisationId, ctx.orgId)),
          )
          .for("update");
        if (!before) throw new DomainError("NOT_FOUND", "Item not found.");

        // Quantities are stored in the base unit: changing it once batches
        // exist would silently reinterpret every recorded quantity.
        if (before.baseUnit !== input.baseUnit) {
          const [batch] = await tx
            .select({ id: itemBatches.id })
            .from(itemBatches)
            .where(
              and(
                eq(itemBatches.organisationId, ctx.orgId),
                eq(itemBatches.itemId, input.id),
              ),
            )
            .limit(1);
          if (batch) {
            throw new DomainError(
              "UNIT_LOCKED",
              "This item already has stock batches, so its base unit cannot change.",
            );
          }
        }

        const values = toColumns(input);
        await tx
          .update(items)
          .set(values)
          .where(
            and(eq(items.id, input.id), eq(items.organisationId, ctx.orgId)),
          );
        await writeAudit(tx, ctx, {
          action: "items.update",
          entityType: "item",
          entityId: input.id,
          before: {
            name: before.name,
            category: before.category,
            baseUnit: before.baseUnit,
            reorderLevel: before.reorderLevel,
            activeIngredient: before.activeIngredient,
            phiDays: before.phiDays,
            reiHours: before.reiHours,
            nPct: before.nPct,
            pPct: before.pPct,
            kPct: before.kPct,
            isActive: before.isActive,
          },
          after: values,
        });
        return { id: input.id };
      });
      revalidateItems(result.id);
      return result;
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", DUPLICATE_MSG);
      throw e;
    }
  },
});
