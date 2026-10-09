import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, Receipt } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { MoneyText } from "@/components/common/money-text";
import { SectionCard } from "@/components/common/section-card";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/guard";
import { DeleteCustomerButton } from "@/modules/customers/components/delete-customer-button";
import { getCustomer } from "@/modules/customers/queries";
import { SaleList } from "@/modules/sales/components/sale-list";
import { listSales } from "@/modules/sales/queries";

export const metadata = { title: "Customer" };

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const customer = await getCustomer(ctx, id);
  if (!customer) notFound();
  const sales = await listSales(ctx, { customerId: customer.id });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={customer.name}
        backHref="/sales/customers"
        action={
          <Button asChild variant="outline" className="h-11">
            <Link href={`/sales/customers/${customer.id}/edit`}>
              <Pencil className="size-4" /> Edit
            </Link>
          </Button>
        }
      />
      <SectionCard title="Details">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{customer.phone ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="truncate">{customer.email ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 text-base">
            <dt className="font-medium">Open balance</dt>
            <dd>
              <MoneyText
                kobo={customer.openBalanceKobo}
                className={
                  (customer.openBalanceKobo ?? 0) > 0
                    ? "text-status-danger font-semibold"
                    : "font-semibold"
                }
              />
            </dd>
          </div>
        </dl>
        {customer.notes ? (
          <p className="text-muted-foreground mt-3 text-sm whitespace-pre-wrap">
            {customer.notes}
          </p>
        ) : null}
      </SectionCard>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Sales</h2>
        <Button asChild className="h-11">
          <Link href="/sales/new">
            <Plus className="size-4" /> New sale
          </Link>
        </Button>
      </div>
      {sales.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No sales to this customer yet"
          description="Sales you record for this customer show up here."
        >
          <DeleteCustomerButton
            customerId={customer.id}
            customerName={customer.name}
          />
        </EmptyState>
      ) : (
        <SaleList sales={sales} showCustomer={false} />
      )}
    </div>
  );
}
