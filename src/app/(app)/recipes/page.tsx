import Link from "next/link";
import { FlaskConical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { RecipeList } from "@/modules/recipes/components/recipe-list";
import { listRecipes } from "@/modules/recipes/queries";

export const metadata = { title: "Recipes" };

export default async function RecipesPage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const recipes = await listRecipes(ctx);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Recipes"
        description="Fertigation feeds and spray mixes, per 1,000 L of water."
        action={
          <Button asChild className="h-11">
            <Link href="/recipes/new">
              <Plus className="size-4" /> New recipe
            </Link>
          </Button>
        }
      />
      {recipes.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No recipes yet"
          description="Save your standard feeds and spray mixes so logging an application scales them to the water volume."
        >
          <Button asChild className="h-11">
            <Link href="/recipes/new">Add your first recipe</Link>
          </Button>
        </EmptyState>
      ) : (
        <RecipeList recipes={recipes} />
      )}
    </div>
  );
}
