import Link from "next/link";
import { Undo2 } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/guard";
import { ReturnForm } from "@/modules/stock/components/return-form";
import { getStockFormRefs } from "@/modules/stock/queries";

export const metadata = { title: "Return to store" };

export default async function ReturnsPage() {
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const refs = await getStockFormRefs(ctx);
  const missing =
    refs.stores.length === 0
      ? "store"
      : refs.greenhouses.length === 0
        ? "greenhouse"
        : refs.batches.length === 0
          ? "batch"
          : null;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Return to store"
        description="Unused inputs coming back from a greenhouse."
        backHref="/store"
      />
      {missing ? (
        <EmptyState
          icon={Undo2}
          title="Nothing to return yet"
          description={
            missing === "batch"
              ? "No stock has been received yet, so nothing can come back."
              : `Add a ${missing} first.`
          }
        >
          <Button asChild className="h-11">
            <Link href={missing === "batch" ? "/store/receive" : "/setup"}>
              {missing === "batch" ? "Receive stock" : "Open setup"}
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <ReturnForm refs={refs} />
      )}
    </div>
  );
}
