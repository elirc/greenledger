import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { SaleForm } from "@/modules/sales/components/sale-form";
import { getSaleFormRefs } from "@/modules/sales/queries";

export const metadata = { title: "New sale" };

export default async function NewSalePage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const refs = await getSaleFormRefs(ctx);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="New sale"
        description="Produce is taken oldest harvest first."
        backHref="/sales"
      />
      <SaleForm refs={refs} />
    </div>
  );
}
