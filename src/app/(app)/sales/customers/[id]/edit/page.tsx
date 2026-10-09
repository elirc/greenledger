import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import type { ActionResult } from "@/lib/action";
import { requireMember } from "@/lib/guard";
import { updateCustomer } from "@/modules/customers/actions";
import { CustomerForm } from "@/modules/customers/components/customer-form";
import { getCustomer } from "@/modules/customers/queries";
import type { CustomerCreateInput } from "@/modules/customers/schema";

export const metadata = { title: "Edit customer" };

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const customer = await getCustomer(ctx, id);
  if (!customer) notFound();

  async function submit(
    input: CustomerCreateInput,
  ): Promise<ActionResult<{ id: string }>> {
    "use server";
    return updateCustomer({ ...input, id });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Edit customer" backHref={`/sales/customers/${id}`} />
      <CustomerForm
        defaultValues={{
          name: customer.name,
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          notes: customer.notes ?? "",
        }}
        onSubmitAction={submit}
        submitLabel="Save changes"
      />
    </div>
  );
}
