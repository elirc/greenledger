import Link from "next/link";
import { PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { createRecipe } from "@/modules/recipes/actions";
import { RecipeForm } from "@/modules/recipes/components/recipe-form";
import { listRecipeItemOptions } from "@/modules/recipes/queries";

export const metadata = { title: "New recipe" };

export default async function NewRecipePage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const items = await listRecipeItemOptions(ctx);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="New recipe" backHref="/recipes" />
      {items.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="No inputs yet"
          description="Add fertilisers and chemicals to the store before building a recipe."
        >
          <Button asChild className="h-11">
            <Link href="/store/items/new">Add an item</Link>
          </Button>
        </EmptyState>
      ) : (
        <RecipeForm
          items={items}
          onSubmitAction={createRecipe}
          submitLabel="Save recipe"
        />
      )}
    </div>
  );
}
