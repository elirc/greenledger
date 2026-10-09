import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import type { RecipeRow } from "../queries";
import { RECIPE_TYPE_LABELS } from "../schema";

/** Recipes list: tap a row to edit. */
export function RecipeList({ recipes }: { recipes: RecipeRow[] }) {
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {recipes.map((r) => (
        <li key={r.id}>
          <Link
            href={`/recipes/${r.id}`}
            className="hover:bg-muted/50 flex min-h-14 items-center gap-3 px-4 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.name}</span>
                <StatusBadge variant={r.type === "spray" ? "warning" : "info"}>
                  {RECIPE_TYPE_LABELS[r.type]}
                </StatusBadge>
                {!r.isActive ? (
                  <StatusBadge variant="neutral">Inactive</StatusBadge>
                ) : null}
              </div>
              <span className="text-muted-foreground text-sm">
                {r.lineCount} input{r.lineCount === 1 ? "" : "s"}
                {r.useCount > 0
                  ? ` · used ${r.useCount} time${r.useCount === 1 ? "" : "s"}`
                  : " · not used yet"}
              </span>
              {r.description ? (
                <p className="text-muted-foreground truncate text-xs">
                  {r.description}
                </p>
              ) : null}
            </div>
            <ChevronRight className="text-muted-foreground size-5 shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
