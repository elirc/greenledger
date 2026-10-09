"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteRecipe } from "../actions";

/** Delete, or deactivate when applications already used the recipe. */
export function DeleteRecipeButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();

  async function onDelete() {
    const result = await deleteRecipe({ id });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data.outcome === "deactivated") {
      toast.info(`${name} was deactivated instead of deleted`, {
        description:
          "Applications were logged with it, so it is kept for your records.",
      });
    } else {
      toast.success(`${name} deleted`);
    }
    router.push("/recipes");
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive" className="h-11 w-full">
          <Trash2 className="size-4" /> Delete recipe
        </Button>
      }
      title={`Delete ${name}?`}
      description="If applications were logged with this recipe it will be deactivated instead, so your spray and feed records stay intact."
      confirmLabel="Delete"
      destructive
      onConfirm={onDelete}
    />
  );
}
