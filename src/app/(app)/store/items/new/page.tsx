import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { createItem } from "@/modules/items/actions";
import { ItemForm } from "@/modules/items/components/item-form";

export const metadata = { title: "Add item" };

export default async function NewItemPage() {
  await requireMember({ roles: ["owner", "manager"] });
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Add item"
        description="Seed, fertiliser, chemicals, media, packaging and spares you keep in store."
        backHref="/store"
      />
      <ItemForm onSubmitAction={createItem} submitLabel="Add item" />
    </div>
  );
}
