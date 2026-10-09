import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import type { ActionResult } from "@/lib/action";
import { requireMember } from "@/lib/guard";
import { updateEquipment } from "@/modules/equipment/actions";
import { EquipmentForm } from "@/modules/equipment/components/equipment-form";
import {
  getEquipment,
  getEquipmentFormRefs,
} from "@/modules/equipment/queries";
import type {
  EquipmentCategory,
  EquipmentCreateInput,
} from "@/modules/equipment/schema";

export const metadata = { title: "Edit equipment" };

/** Kobo → plain naira text for the form ("450000", "1250.5"). */
const koboToNairaText = (kobo: number | null) =>
  kobo === null || kobo === 0 ? "" : String(kobo / 100);

export default async function EditEquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const [row, refs] = await Promise.all([
    getEquipment(ctx, id),
    getEquipmentFormRefs(ctx),
  ]);
  if (!row) notFound();

  async function submit(
    input: EquipmentCreateInput,
  ): Promise<ActionResult<{ id: string }>> {
    "use server";
    return updateEquipment({ ...input, id });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Edit equipment" backHref={`/equipment/${id}`} />
      <EquipmentForm
        refs={refs}
        canSeeMoney={ctx.canSeeMoney}
        defaultValues={{
          name: row.name,
          category: row.category as EquipmentCategory,
          siteId: row.siteId ?? "",
          greenhouseId: row.greenhouseId ?? "",
          locationNote: row.locationNote ?? "",
          serialNumber: row.serialNumber ?? "",
          purchaseDate: row.purchaseDate ?? "",
          cost: koboToNairaText(row.costKobo),
          status: row.status,
          notes: row.notes ?? "",
        }}
        onSubmitAction={submit}
        submitLabel="Save changes"
      />
    </div>
  );
}
