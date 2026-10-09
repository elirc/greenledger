import Link from "next/link";
import { Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import {
  ExpenseFilters,
  ExpenseList,
  ExpenseTotalsTable,
} from "@/modules/expenses/components/expense-list";
import { expenseTotals, listExpenses } from "@/modules/expenses/queries";
import {
  EXPENSE_CATEGORY_LABELS,
  expenseListParamsSchema,
} from "@/modules/expenses/schema";
import { monthLabel } from "@/modules/tasks/logic";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const params = expenseListParamsSchema.parse({
    month: first(raw.month),
    category: first(raw.category),
  });
  const currentMonth = todayLagos().slice(0, 7);
  const month = params.month && params.month <= currentMonth ? params.month : currentMonth;

  const [rows, totals] = await Promise.all([
    listExpenses(ctx, { month, category: params.category }),
    expenseTotals(ctx, month),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Expenses"
        description="Labour, power, water, repairs and other running costs."
        action={
          <Button asChild className="h-11">
            <Link href="/expenses/new">
              <Plus className="size-4" /> Add
            </Link>
          </Button>
        }
      />
      <ExpenseFilters
        month={month}
        category={params.category}
        currentMonth={currentMonth}
        totals={totals}
      />
      {totals.byCategory.every((c) => c.count === 0) ? (
        <EmptyState
          icon={Receipt}
          title={`No expenses in ${monthLabel(month)}`}
          description="Record wages, diesel, water and repairs so cycle profitability is complete."
        >
          <Button asChild className="h-11">
            <Link href="/expenses/new">Add an expense</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <ExpenseTotalsTable totals={totals} />
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No {params.category ? EXPENSE_CATEGORY_LABELS[params.category].toLowerCase() : ""}{" "}
              expenses this month.
            </p>
          ) : (
            <ExpenseList rows={rows} />
          )}
        </>
      )}
    </div>
  );
}
