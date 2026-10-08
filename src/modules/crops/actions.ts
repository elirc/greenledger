"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { crops, varieties } from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import {
  DEFAULT_CROPS,
  cropCreateSchema,
  cropIdSchema,
  cropUpdateSchema,
  ensureCropsSchema,
  varietyCreateSchema,
  varietyUpdateSchema,
} from "./schema";

function pgCode(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const direct = (e as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (e as { cause?: { code?: unknown } }).cause;
  return typeof cause?.code === "string" ? cause.code : undefined;
}
const isUniqueViolation = (e: unknown) => pgCode(e) === "23505";
const isFkViolation = (e: unknown) => pgCode(e) === "23503";

const emptyToNull = (s: string | undefined) =>
  s && s.length > 0 ? s : null;

function revalidateCrops() {
  revalidatePath("/setup");
  revalidatePath("/settings/varieties");
}

// --------------------------------------------------------------------- crops

export const createCrop = defineAction({
  name: "crops.create",
  schema: cropCreateSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(crops)
          .values({
            organisationId: ctx.orgId,
            name: input.name,
            shelfLifeDays: input.shelfLifeDays,
          })
          .returning({ id: crops.id });
        await writeAudit(tx, ctx, {
          action: "crops.create",
          entityType: "crop",
          entityId: row.id,
          after: input,
        });
        revalidateCrops();
        return { id: row.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError("DUPLICATE", "A crop with this name already exists.");
      }
      throw e;
    }
  },
});

export const updateCrop = defineAction({
  name: "crops.update",
  schema: cropUpdateSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const before = await tx.query.crops.findFirst({
          where: and(eq(crops.id, input.id), eq(crops.organisationId, ctx.orgId)),
        });
        if (!before) throw new DomainError("NOT_FOUND", "Crop not found.");
        await tx
          .update(crops)
          .set({ name: input.name, shelfLifeDays: input.shelfLifeDays })
          .where(and(eq(crops.id, input.id), eq(crops.organisationId, ctx.orgId)));
        await writeAudit(tx, ctx, {
          action: "crops.update",
          entityType: "crop",
          entityId: input.id,
          before: { name: before.name, shelfLifeDays: before.shelfLifeDays },
          after: { name: input.name, shelfLifeDays: input.shelfLifeDays },
        });
        revalidateCrops();
        return { id: input.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError("DUPLICATE", "A crop with this name already exists.");
      }
      throw e;
    }
  },
});

export const deleteCrop = defineAction({
  name: "crops.delete",
  schema: cropIdSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const before = await tx.query.crops.findFirst({
          where: and(eq(crops.id, input.id), eq(crops.organisationId, ctx.orgId)),
        });
        if (!before) throw new DomainError("NOT_FOUND", "Crop not found.");
        await tx
          .delete(crops)
          .where(and(eq(crops.id, input.id), eq(crops.organisationId, ctx.orgId)));
        await writeAudit(tx, ctx, {
          action: "crops.delete",
          entityType: "crop",
          entityId: input.id,
          before: { name: before.name, shelfLifeDays: before.shelfLifeDays },
        });
        revalidateCrops();
        return { id: input.id };
      });
    } catch (e) {
      if (isFkViolation(e)) {
        throw new DomainError(
          "IN_USE",
          "This crop has varieties or records. Remove those first.",
        );
      }
      throw e;
    }
  },
});

/**
 * Wizard step 4: create the picked default crops (tomato 7 days, pepper 10
 * days shelf life) when the org does not have them yet. Idempotent.
 */
export const ensureDefaultCrops = defineAction({
  name: "crops.ensureDefaults",
  schema: ensureCropsSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: crops.id, name: crops.name })
        .from(crops)
        .where(eq(crops.organisationId, ctx.orgId));
      const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c.id]));
      const created: string[] = [];
      for (const key of input.crops) {
        const def = DEFAULT_CROPS[key];
        if (byName.has(def.name.toLowerCase())) continue;
        const [row] = await tx
          .insert(crops)
          .values({
            organisationId: ctx.orgId,
            name: def.name,
            shelfLifeDays: def.shelfLifeDays,
          })
          .onConflictDoNothing()
          .returning({ id: crops.id });
        if (!row) continue; // created concurrently
        created.push(row.id);
        await writeAudit(tx, ctx, {
          action: "crops.create",
          entityType: "crop",
          entityId: row.id,
          after: { name: def.name, shelfLifeDays: def.shelfLifeDays },
        });
      }
      revalidateCrops();
      return { created: created.length };
    }),
});

// ----------------------------------------------------------------- varieties

async function assertCropInOrg(
  tx: Tx,
  orgId: string,
  cropId: string,
) {
  const crop = await tx.query.crops.findFirst({
    where: and(eq(crops.id, cropId), eq(crops.organisationId, orgId)),
    columns: { id: true },
  });
  if (!crop) throw new DomainError("NOT_FOUND", "Crop not found.");
}

export const createVariety = defineAction({
  name: "varieties.create",
  schema: varietyCreateSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        await assertCropInOrg(tx, ctx.orgId, input.cropId);
        const [row] = await tx
          .insert(varieties)
          .values({
            organisationId: ctx.orgId,
            cropId: input.cropId,
            name: input.name,
            daysToFirstHarvest: input.daysToFirstHarvest,
            harvestDurationWeeks: input.harvestDurationWeeks,
            expectedYieldKgPerPlant: String(input.expectedYieldKgPerPlant),
            notes: emptyToNull(input.notes),
            isActive: input.isActive,
          })
          .returning({ id: varieties.id });
        await writeAudit(tx, ctx, {
          action: "varieties.create",
          entityType: "variety",
          entityId: row.id,
          after: input,
        });
        revalidateCrops();
        return { id: row.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError(
          "DUPLICATE",
          "This crop already has a variety with this name.",
        );
      }
      throw e;
    }
  },
});

export const updateVariety = defineAction({
  name: "varieties.update",
  schema: varietyUpdateSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const before = await tx.query.varieties.findFirst({
          where: and(
            eq(varieties.id, input.id),
            eq(varieties.organisationId, ctx.orgId),
          ),
        });
        if (!before) throw new DomainError("NOT_FOUND", "Variety not found.");
        await assertCropInOrg(tx, ctx.orgId, input.cropId);
        await tx
          .update(varieties)
          .set({
            cropId: input.cropId,
            name: input.name,
            daysToFirstHarvest: input.daysToFirstHarvest,
            harvestDurationWeeks: input.harvestDurationWeeks,
            expectedYieldKgPerPlant: String(input.expectedYieldKgPerPlant),
            notes: emptyToNull(input.notes),
            isActive: input.isActive,
          })
          .where(
            and(
              eq(varieties.id, input.id),
              eq(varieties.organisationId, ctx.orgId),
            ),
          );
        await writeAudit(tx, ctx, {
          action: "varieties.update",
          entityType: "variety",
          entityId: input.id,
          before: {
            cropId: before.cropId,
            name: before.name,
            daysToFirstHarvest: before.daysToFirstHarvest,
            harvestDurationWeeks: before.harvestDurationWeeks,
            expectedYieldKgPerPlant: before.expectedYieldKgPerPlant,
            isActive: before.isActive,
          },
          after: input,
        });
        revalidateCrops();
        return { id: input.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError(
          "DUPLICATE",
          "This crop already has a variety with this name.",
        );
      }
      throw e;
    }
  },
});

export const deleteVariety = defineAction({
  name: "varieties.delete",
  schema: cropIdSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const before = await tx.query.varieties.findFirst({
          where: and(
            eq(varieties.id, input.id),
            eq(varieties.organisationId, ctx.orgId),
          ),
        });
        if (!before) throw new DomainError("NOT_FOUND", "Variety not found.");
        await tx
          .delete(varieties)
          .where(
            and(
              eq(varieties.id, input.id),
              eq(varieties.organisationId, ctx.orgId),
            ),
          );
        await writeAudit(tx, ctx, {
          action: "varieties.delete",
          entityType: "variety",
          entityId: input.id,
          before: { cropId: before.cropId, name: before.name },
        });
        revalidateCrops();
        return { id: input.id };
      });
    } catch (e) {
      if (isFkViolation(e)) {
        throw new DomainError(
          "IN_USE",
          "This variety is used by nursery batches or crop cycles. Mark it inactive instead.",
        );
      }
      throw e;
    }
  },
});
