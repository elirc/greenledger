import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { MoneyText } from "@/components/common/money-text";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/guard";
import { listCustomers } from "@/modules/customers/queries";

export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const customers = await listCustomers(ctx);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Customers"
        backHref="/sales"
        action={
          <Button asChild className="h-11">
            <Link href="/sales/customers/new">
              <Plus className="size-4" /> Add customer
            </Link>
          </Button>
        }
      />
      {customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Add the traders, supermarkets and hotels you sell produce to."
        >
          <Button asChild className="h-11">
            <Link href="/sales/customers/new">Add your first customer</Link>
          </Button>
        </EmptyState>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {customers.map((c) => (
            <li key={c.id}>
              <Link
                href={`/sales/customers/${c.id}`}
                className="hover:bg-muted/50 flex min-h-14 items-center justify-between gap-3 px-4 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {[c.phone, c.email].filter(Boolean).join(" · ") ||
                      "No contact details"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-muted-foreground text-xs">Open balance</p>
                  <MoneyText
                    kobo={c.openBalanceKobo}
                    className={
                      (c.openBalanceKobo ?? 0) > 0
                        ? "text-status-danger font-medium"
                        : "font-medium"
                    }
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
