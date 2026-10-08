import Link from "next/link";
import { Truck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { listSuppliers } from "@/modules/suppliers/queries";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const suppliers = await listSuppliers(ctx);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Suppliers"
        backHref="/store"
        action={
          <Button asChild className="h-11">
            <Link href="/store/suppliers/new">
              <Plus className="size-4" /> Add supplier
            </Link>
          </Button>
        }
      />
      {suppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No suppliers yet"
          description="Add the businesses you buy seed, fertiliser and chemicals from."
        >
          <Button asChild className="h-11">
            <Link href="/store/suppliers/new">Add your first supplier</Link>
          </Button>
        </EmptyState>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {suppliers.map((s) => (
            <li key={s.id}>
              <Link
                href={`/store/suppliers/${s.id}`}
                className="hover:bg-muted/50 flex min-h-14 flex-col justify-center gap-0.5 px-4 py-2"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground text-sm">
                  {[s.phone, s.email].filter(Boolean).join(" · ") ||
                    "No contact details"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
