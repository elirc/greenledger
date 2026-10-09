import { Suspense } from "react";
import Link from "next/link";
import { Plus, Receipt, Users, Clock } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/guard";
import { listCustomers } from "@/modules/customers/queries";
import { SaleList } from "@/modules/sales/components/sale-list";
import { SalesFilters } from "@/modules/sales/components/sales-filters";
import { listSales } from "@/modules/sales/queries";
import { salesFilterSchema } from "@/modules/sales/schema";

export const metadata = { title: "Sales" };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const sp = await searchParams;
  const parsed = salesFilterSchema.safeParse({
    status: typeof sp.status === "string" ? sp.status : undefined,
    customerId: typeof sp.customerId === "string" ? sp.customerId : undefined,
  });
  const filters = parsed.success ? parsed.data : {};
  const filtered = Boolean(filters.status || filters.customerId);

  const [sales, customers] = await Promise.all([
    listSales(ctx, filters),
    listCustomers(ctx),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Sales"
        action={
          <Button asChild className="h-11">
            <Link href="/sales/new">
              <Plus className="size-4" /> New sale
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="h-11">
          <Link href="/sales/customers">
            <Users className="size-4" /> Customers
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/sales/receivables">
            <Clock className="size-4" /> Receivables
          </Link>
        </Button>
      </div>
      <Suspense fallback={null}>
        <SalesFilters
          customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        />
      </Suspense>
      {sales.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={Receipt}
            title="No sales match these filters"
            description="Try another status or customer."
          >
            <Button asChild variant="outline" className="h-11">
              <Link href="/sales">Clear filters</Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            icon={Receipt}
            title="No sales yet"
            description="Record a sale to allocate produce oldest-first and print the invoice and delivery note."
          >
            <Button asChild className="h-11">
              <Link href="/sales/new">Record your first sale</Link>
            </Button>
          </EmptyState>
        )
      ) : (
        <SaleList sales={sales} />
      )}
    </div>
  );
}
