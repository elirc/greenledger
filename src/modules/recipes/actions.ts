"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { applications, items, recipeLines, recipes } from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import type { Role } from "@/lib/permissions";
import { roundQty } from "@/modules/stock/logic";
import {
  recipeCreateSchema,
  recipeIdSchema,
  recipeUpdateSchema,
  type RecipeCreateInput,
} from "./schema";

const RECIPE_ROLES: Role[] = ["owner", "manager"];

function pgError(e: unknown): { code?: string; constraint?: string } {
  if (typeof e !== "object" || e === null) return {};
  const direct = e as { code?: unknown; constraint?: unknown };
  if (typeof direct.code === "string") {
    return {
      code: direct.code,
      constraint:
        typeof direct.constraint === "string" ? direct.constraint : undefined,
    };
  }
  const cause = (e as { cause?: { code?: unknown; constraint?: unknown } })
    .cause;
  return {
    code: typeof cause?.code === "string" ? cause.code : undefined,
    constraint:
      typeof cause?.constraint === "string" ? cause.constraint : undefined,
  };
}

/** Duplicate recipe name → friendly field error (DUPLICATE on `name`). */
function mapDuplicate(e: unknown): never {
  const pg = pgError(e);
  if (pg.code === "23505") {
    if (pg.constraint === "recipe_lines_recipe_item_uidx") {
      throw new DomainError(
        "DUPLICATE_LINE",
        "The same input appears twice on this recipe.",
      );
    }
    throw new DomainError("DUPLICATE", "A recipe with this name already exists.");
  }
  throw e;
}

const emptyToNull = (s: string | undefined) =>
  s && s.length > 0 ? s : null;

function revalidateRecipes() {
  revalidatePath("/recipes", "layout");
  revalidatePath("/applications/new");
}

/** FKs don't check the organisation — every line item must be ours. */
async function assertItems(tx: Tx, ctx: Ctx, itemIds: string[]) {
  const ids = [...new Set(itemIds)];
  const rows = await tx
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.organisationId, ctx.orgId), inArray(items.id, ids)));
  if (rows.length !== ids.length) {
    throw new DomainError("NOT_FOUND", "An input on this recipe was not found.");
  }
}

function lineValues(ctx: Ctx, recipeId: string, input: RecipeCreateInput) {
  return input.lines.map((l) => ({
    organisationId: ctx.orgId,
    recipeId,
    itemId: l.itemId,
    quantityPer1000L: roundQty(l.quantityPer1000l).toFixed(3),
  }));
}

function auditLines(input: RecipeCreateInput) {
  return input.lines.map((l) => ({
    itemId: l.itemId,
    quantityPer1000l: roundQty(l.quantityPer1000l),
  }));
}

export const createRecipe = defineAction({
  name: "recipes.create",
  schema: recipeCreateSchema,
  roles: RECIPE_ROLES,
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        await assertItems(
          tx,
          ctx,
          input.lines.map((l) => l.itemId),
        );
        const [row] = await tx
          .insert(recipes)
          .values({
            organisationId: ctx.orgId,
            name: input.name,
            type: input.type,
            description: emptyToNull(input.description),
            isActive: input.isActive,
          })
          .returning({ id: recipes.id });
        await tx.insert(recipeLines).values(lineValues(ctx, row.id, input));
        await writeAudit(tx, ctx, {
          action: "recipes.create",
          entityType: "recipe",
          entityId: row.id,
          after: {
            name: input.name,
            type: input.type,
            isActive: input.isActive,
            lines: auditLines(input),
          },
        });
        revalidateRecipes();
        return { id: row.id };
      });
    } catch (e) {
      mapDuplicate(e);
    }
  },
});

export const updateRecipe = defineAction({
  name: "recipes.update",
  schema: recipeUpdateSchema,
  roles: RECIPE_ROLES,
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const [before] = await tx
          .select({
            id: recipes.id,
            name: recipes.name,
            type: recipes.type,
            description: recipes.description,
            isActive: recipes.isActive,
          })
          .from(recipes)
          .where(
            and(eq(recipes.id, input.id), eq(recipes.organisationId, ctx.orgId)),
          )
          .for("update");
        if (!before) throw new DomainError("NOT_FOUND", "Recipe not found.");
        await assertItems(
          tx,
          ctx,
          input.lines.map((l) => l.itemId),
        );

        const beforeLines = await tx
          .select({
            itemId: recipeLines.itemId,
            quantityPer1000l: recipeLines.quantityPer1000L,
          })
          .from(recipeLines)
          .where(
            and(
              eq(recipeLines.organisationId, ctx.orgId),
              eq(recipeLines.recipeId, input.id),
            ),
          );

        await tx
          .update(recipes)
          .set({
            name: input.name,
            type: input.type,
            description: emptyToNull(input.description),
            isActive: input.isActive,
          })
          .where(
            and(eq(recipes.id, input.id), eq(recipes.organisationId, ctx.orgId)),
          );
        // Lines are a value list: replace them wholesale.
        await tx
          .delete(recipeLines)
          .where(
            and(
              eq(recipeLines.organisationId, ctx.orgId),
              eq(recipeLines.recipeId, input.id),
            ),
          );
        await tx.insert(recipeLines).values(lineValues(ctx, input.id, input));

        await writeAudit(tx, ctx, {
          action: "recipes.update",
          entityType: "recipe",
          entityId: input.id,
          before: {
            name: before.name,
            type: before.type,
            isActive: before.isActive,
            lines: beforeLines.map((l) => ({
              itemId: l.itemId,
              quantityPer1000l: Number(l.quantityPer1000l),
            })),
          },
          after: {
            name: input.name,
            type: input.type,
            isActive: input.isActive,
            lines: auditLines(input),
          },
        });
        revalidateRecipes();
        return { id: input.id };
      });
    } catch (e) {
      mapDuplicate(e);
    }
  },
});

/**
 * Hard delete only when no application used the recipe (applications keep
 * recipe_id via ON DELETE SET NULL, which would silently lose the link).
 * Otherwise the recipe is deactivated instead and the caller says why.
 */
export const deleteRecipe = defineAction({
  name: "recipes.delete",
  schema: recipeIdSchema,
  roles: RECIPE_ROLES,
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          id: recipes.id,
          name: recipes.name,
          isActive: recipes.isActive,
        })
        .from(recipes)
        .where(
          and(eq(recipes.id, input.id), eq(recipes.organisationId, ctx.orgId)),
        )
        .for("update");
      if (!before) throw new DomainError("NOT_FOUND", "Recipe not found.");

      const [used] = await tx
        .select({ id: applications.id })
        .from(applications)
        .where(
          and(
            eq(applications.organisationId, ctx.orgId),
            eq(applications.recipeId, input.id),
          ),
        )
        .limit(1);

      if (used) {
        await tx
          .update(recipes)
          .set({ isActive: false })
          .where(
            and(eq(recipes.id, input.id), eq(recipes.organisationId, ctx.orgId)),
          );
      } else {
        await tx
          .delete(recipes)
          .where(
            and(eq(recipes.id, input.id), eq(recipes.organisationId, ctx.orgId)),
          );
      }

      await writeAudit(tx, ctx, {
        action: used ? "recipes.deactivate" : "recipes.delete",
        entityType: "recipe",
        entityId: input.id,
        before: { name: before.name, isActive: before.isActive },
        after: used ? { isActive: false } : undefined,
      });
      revalidateRecipes();
      return {
        id: input.id,
        outcome: used ? ("deactivated" as const) : ("deleted" as const),
      };
    }),
});
