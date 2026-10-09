import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { formatLagosDate } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { ReceivablesView } from "@/modules/sales/components/receivables-view";
import { getReceivables } from "@/modules/sales/queries";

export const metadata = { title: "Receivables" };

export default async function ReceivablesPage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const { asOf, rows, totals } = await getReceivables(ctx);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Receivables"
        description={`Unpaid balances by age since the sale date, as of ${formatLagosDate(asOf)}.`}
        backHref="/sales"
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nothing owed"
          description="Every sale is fully paid."
        >
          <Button asChild variant="outline" className="h-11">
            <Link href="/sales">Back to sales</Link>
          </Button>
        </EmptyState>
      ) : (
        <ReceivablesView rows={rows} totals={totals} />
      )}
    </div>
  );
}
