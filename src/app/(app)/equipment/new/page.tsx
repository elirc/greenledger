import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { createEquipment } from "@/modules/equipment/actions";
import { EquipmentForm } from "@/modules/equipment/components/equipment-form";
import { getEquipmentFormRefs } from "@/modules/equipment/queries";

export const metadata = { title: "Add equipment" };

export default async function NewEquipmentPage() {
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const refs = await getEquipmentFormRefs(ctx);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Add equipment" backHref="/equipment" />
      <EquipmentForm
        refs={refs}
        onSubmitAction={createEquipment}
        submitLabel="Add equipment"
        canSeeMoney={ctx.canSeeMoney}
      />
    </div>
  );
}
