import Link from "next/link";
import { Warehouse } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/guard";
import { CountCreateForm } from "@/modules/stock/components/count-create-form";
import { listCountStores } from "@/modules/stock/queries";

export const metadata = { title: "New stock count" };

export default async function NewCountPage() {
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const stores = await listCountStores(ctx);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="New stock count" backHref="/store/counts" />
      {stores.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="No stores yet"
          description="Add a store before counting stock."
        >
          <Button asChild className="h-11">
            <Link href="/setup">Open setup</Link>
          </Button>
        </EmptyState>
      ) : (
        <CountCreateForm stores={stores} />
      )}
    </div>
  );
}
