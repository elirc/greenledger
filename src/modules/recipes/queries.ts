import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { applications, items, recipeLines, recipes } from "@/db/schema";
import type { Ctx } from "@/lib/guard";
import type { BaseUnit } from "@/lib/units";
import type { ItemCategory } from "@/modules/items/schema";

/**
 * Every query takes ctx and filters by ctx.orgId — no exceptions.
 * Recipes carry no money columns.
 */

const isUuid = (id: string) => z.uuid().safeParse(id).success;

export async function listRecipes(ctx: Ctx) {
  const lineCounts = db
    .select({
      recipeId: recipeLines.recipeId,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(recipeLines)
    .where(eq(recipeLines.organisationId, ctx.orgId))
    .groupBy(recipeLines.recipeId)
    .as("line_counts");
  const useCounts = db
    .select({
      recipeId: applications.recipeId,
      n: sql<number>`count(*)::int`.as("uses"),
    })
    .from(applications)
    .where(eq(applications.organisationId, ctx.orgId))
    .groupBy(applications.recipeId)
    .as("use_counts");

  return db
    .select({
      id: recipes.id,
      name: recipes.name,
      type: recipes.type,
      description: recipes.description,
      isActive: recipes.isActive,
      lineCount: sql<number>`coalesce(${lineCounts.n}, 0)`,
      useCount: sql<number>`coalesce(${useCounts.n}, 0)`,
    })
    .from(recipes)
    .leftJoin(lineCounts, eq(lineCounts.recipeId, recipes.id))
    .leftJoin(useCounts, eq(useCounts.recipeId, recipes.id))
    .where(eq(recipes.organisationId, ctx.orgId))
    .orderBy(sql`${recipes.isActive} desc`, asc(recipes.name));
}

export type RecipeRow = Awaited<ReturnType<typeof listRecipes>>[number];

export async function getRecipe(ctx: Ctx, id: string) {
  if (!isUuid(id)) return null;
  const [recipe] = await db
    .select({
      id: recipes.id,
      name: recipes.name,
      type: recipes.type,
      description: recipes.description,
      isActive: recipes.isActive,
    })
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.organisationId, ctx.orgId)));
  if (!recipe) return null;

  const lines = await db
    .select({
      itemId: recipeLines.itemId,
      itemName: items.name,
      baseUnit: items.baseUnit,
      quantityPer1000l: recipeLines.quantityPer1000L,
    })
    .from(recipeLines)
    .innerJoin(
      items,
      and(eq(items.id, recipeLines.itemId), eq(items.organisationId, ctx.orgId)),
    )
    .where(
      and(
        eq(recipeLines.organisationId, ctx.orgId),
        eq(recipeLines.recipeId, id),
      ),
    )
    .orderBy(asc(items.name));

  return {
    ...recipe,
    lines: lines.map((l) => ({
      ...l,
      quantityPer1000l: Number(l.quantityPer1000l),
    })),
  };
}

export type RecipeDetail = NonNullable<Awaited<ReturnType<typeof getRecipe>>>;

export interface RecipeItemOption {
  id: string;
  name: string;
  category: ItemCategory;
  baseUnit: BaseUnit;
  isActive: boolean;
}

/**
 * Items for the recipe line picker. Active items, plus any inactive item
 * already on the recipe being edited (so the form can still label it).
 */
export async function listRecipeItemOptions(
  ctx: Ctx,
  includeIds: string[] = [],
): Promise<RecipeItemOption[]> {
  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      category: items.category,
      baseUnit: items.baseUnit,
      isActive: items.isActive,
    })
    .from(items)
    .where(eq(items.organisationId, ctx.orgId))
    .orderBy(asc(items.name));
  const keep = new Set(includeIds);
  return rows.filter((r) => r.isActive || keep.has(r.id));
}
