import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import type { ActionResult } from "@/lib/action";
import { requireMember } from "@/lib/guard";
import { updateItem } from "@/modules/items/actions";
import { ItemForm } from "@/modules/items/components/item-form";
import { getItem, listItemBatches } from "@/modules/items/queries";
import type { ItemCreateInput } from "@/modules/items/schema";

export const metadata = { title: "Edit item" };

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const item = await getItem(ctx, id);
  if (!item) notFound();
  const batches = await listItemBatches(ctx, id);

  async function submit(
    input: ItemCreateInput,
  ): Promise<ActionResult<{ id: string }>> {
    "use server";
    return updateItem({ ...input, id });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Edit item" backHref={`/store/items/${item.id}`} />
      <ItemForm
        defaultValues={{
          name: item.name,
          category: item.category,
          baseUnit: item.baseUnit,
          reorderLevel: item.reorderLevel,
          activeIngredient: item.activeIngredient ?? "",
          phiDays: item.phiDays ?? undefined,
          reiHours: item.reiHours ?? undefined,
          nPct: item.nPct ?? undefined,
          pPct: item.pPct ?? undefined,
          kPct: item.kPct ?? undefined,
          notes: item.notes ?? "",
          isActive: item.isActive,
        }}
        unitLocked={batches.length > 0}
        onSubmitAction={submit}
        submitLabel="Save changes"
      />
    </div>
  );
}
