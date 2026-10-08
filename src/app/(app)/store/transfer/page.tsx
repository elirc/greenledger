import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/guard";
import { TransferForm } from "@/modules/stock/components/transfer-form";
import { getStockFormRefs } from "@/modules/stock/queries";

export const metadata = { title: "Transfer stock" };

export default async function TransferPage() {
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const refs = await getStockFormRefs(ctx);
  const hasStock = refs.batches.some((b) =>
    Object.values(b.stock).some((q) => q > 0),
  );

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Transfer stock"
        description="Move a batch from one store to another."
        backHref="/store"
      />
      {refs.stores.length < 2 ? (
        <EmptyState
          icon={ArrowRightLeft}
          title="You need two stores"
          description="Transfers move stock between stores. Add another store in settings."
        >
          <Button asChild className="h-11">
            <Link href="/settings/farm">Manage stores</Link>
          </Button>
        </EmptyState>
      ) : !hasStock ? (
        <EmptyState
          icon={ArrowRightLeft}
          title="Nothing to move yet"
          description="Receive stock into a store first."
        >
          <Button asChild className="h-11">
            <Link href="/store/receive">Receive stock</Link>
          </Button>
        </EmptyState>
      ) : (
        <TransferForm refs={refs} />
      )}
    </div>
  );
}
