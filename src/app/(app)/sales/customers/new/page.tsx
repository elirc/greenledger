import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { createCustomer } from "@/modules/customers/actions";
import { CustomerForm } from "@/modules/customers/components/customer-form";

export const metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  await requireMember({ roles: ["owner", "manager"] });
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Add customer" backHref="/sales/customers" />
      <CustomerForm onSubmitAction={createCustomer} submitLabel="Add customer" />
    </div>
  );
}
