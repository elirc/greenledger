import Link from "next/link";
import { Warehouse } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/guard";
import { listStores } from "@/modules/farm/queries";
import { listItemOptions } from "@/modules/items/queries";
import { ReceiveForm } from "@/modules/receipts/components/receive-form";
import { RecentReceipts } from "@/modules/receipts/components/recent-receipts";
import { listRecentReceipts } from "@/modules/receipts/queries";
import { listSuppliers } from "@/modules/suppliers/queries";

export const metadata = { title: "Receive stock" };

export default async function ReceivePage() {
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const [suppliers, stores, items, recent] = await Promise.all([
    listSuppliers(ctx),
    listStores(ctx),
    listItemOptions(ctx),
    listRecentReceipts(ctx, 5),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Receive stock"
        description="Record a delivery. Each line creates a batch you can label and track."
        backHref="/store"
      />
      {stores.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="No stores yet"
          description="Set up at least one store before receiving stock."
        >
          <Button asChild className="h-11">
            <Link href="/settings/farm">Set up stores</Link>
          </Button>
        </EmptyState>
      ) : (
        <ReceiveForm
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          stores={stores.map((s) => ({
            id: s.id,
            name: s.name,
            isDefault: s.isDefault,
          }))}
          items={items}
        />
      )}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Recent receipts</h2>
        <RecentReceipts receipts={recent} showMoney={ctx.canSeeMoney} />
      </section>
    </div>
  );
}
