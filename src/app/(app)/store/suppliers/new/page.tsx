import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { createSupplier } from "@/modules/suppliers/actions";
import { SupplierForm } from "@/modules/suppliers/components/supplier-form";

export const metadata = { title: "Add supplier" };

export default async function NewSupplierPage() {
  await requireMember({ roles: ["owner", "manager", "storekeeper"] });
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Add supplier" backHref="/store/suppliers" />
      <SupplierForm onSubmitAction={createSupplier} submitLabel="Add supplier" />
    </div>
  );
}
