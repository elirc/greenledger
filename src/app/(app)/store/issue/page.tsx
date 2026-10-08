import Link from "next/link";
import { PackageMinus } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/guard";
import { IssueForm } from "@/modules/stock/components/issue-form";
import { getStockFormRefs } from "@/modules/stock/queries";

export const metadata = { title: "Issue stock" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidParam(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && UUID_RE.test(v) ? v : undefined;
}

export default async function IssuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const sp = await searchParams;
  const refs = await getStockFormRefs(ctx);
  const hasStock = refs.batches.some((b) =>
    Object.values(b.stock).some((q) => q > 0),
  );

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Issue stock"
        description="Take inputs out of a store for a greenhouse or job."
        backHref="/store"
      />
      {refs.stores.length === 0 || !hasStock ? (
        <EmptyState
          icon={PackageMinus}
          title="Nothing to issue yet"
          description={
            refs.stores.length === 0
              ? "Set up a store first."
              : "Receive stock into a store, then issue it from here."
          }
        >
          <Button asChild className="h-11">
            <Link href={refs.stores.length === 0 ? "/setup" : "/store/receive"}>
              {refs.stores.length === 0 ? "Open setup" : "Receive stock"}
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <IssueForm
          refs={refs}
          canOverride={ctx.role === "owner" || ctx.role === "manager"}
          initialBatchId={uuidParam(sp.batchId)}
          initialItemId={uuidParam(sp.itemId)}
        />
      )}
    </div>
  );
}
