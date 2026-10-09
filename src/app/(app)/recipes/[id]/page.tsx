import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Separator } from "@/components/ui/separator";
import type { ActionResult } from "@/lib/action";
import { requireMember } from "@/lib/guard";
import { updateRecipe } from "@/modules/recipes/actions";
import { DeleteRecipeButton } from "@/modules/recipes/components/delete-recipe-button";
import { RecipeForm } from "@/modules/recipes/components/recipe-form";
import { getRecipe, listRecipeItemOptions } from "@/modules/recipes/queries";
import type { RecipeCreateInput } from "@/modules/recipes/schema";

export const metadata = { title: "Edit recipe" };

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const recipe = await getRecipe(ctx, id);
  if (!recipe) notFound();
  const items = await listRecipeItemOptions(
    ctx,
    recipe.lines.map((l) => l.itemId),
  );

  async function submit(
    input: RecipeCreateInput,
  ): Promise<ActionResult<{ id: string }>> {
    "use server";
    return updateRecipe({ ...input, id });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Edit recipe" backHref="/recipes" />
      <RecipeForm
        items={items}
        defaultValues={{
          name: recipe.name,
          type: recipe.type,
          description: recipe.description ?? "",
          isActive: recipe.isActive,
          lines: recipe.lines.map((l) => ({
            itemId: l.itemId,
            quantityPer1000l: l.quantityPer1000l,
          })),
        }}
        onSubmitAction={submit}
        submitLabel="Save changes"
      />
      <Separator />
      <DeleteRecipeButton id={recipe.id} name={recipe.name} />
    </div>
  );
}
