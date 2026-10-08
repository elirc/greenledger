import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { updateSupplier } from "@/modules/suppliers/actions";
import { SupplierForm } from "@/modules/suppliers/components/supplier-form";
import { getSupplier } from "@/modules/suppliers/queries";
import type { SupplierCreateInput } from "@/modules/suppliers/schema";
import type { ActionResult } from "@/lib/action";

export const metadata = { title: "Edit supplier" };

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const supplier = await getSupplier(ctx, id);
  if (!supplier) notFound();

  async function submit(
    input: SupplierCreateInput,
  ): Promise<ActionResult<{ id: string }>> {
    "use server";
    return updateSupplier({ ...input, id });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Edit supplier" backHref="/store/suppliers" />
      <SupplierForm
        defaultValues={{
          name: supplier.name,
          phone: supplier.phone ?? "",
          email: supplier.email ?? "",
          notes: supplier.notes ?? "",
        }}
        onSubmitAction={submit}
        submitLabel="Save changes"
      />
    </div>
  );
}
