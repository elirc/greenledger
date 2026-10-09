import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import type { ActionResult } from "@/lib/action";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { updateExpense } from "@/modules/expenses/actions";
import { DeleteExpenseButton } from "@/modules/expenses/components/delete-expense-button";
import { ExpenseForm } from "@/modules/expenses/components/expense-form";
import { getExpense, getExpenseFormRefs } from "@/modules/expenses/queries";
import type { ExpenseCreateInput } from "@/modules/expenses/schema";

export const metadata = { title: "Edit expense" };

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const [row, refs] = await Promise.all([
    getExpense(ctx, id),
    getExpenseFormRefs(ctx),
  ]);
  if (!row) notFound();

  async function submit(
    input: ExpenseCreateInput,
  ): Promise<ActionResult<{ id: string; month: string }>> {
    "use server";
    return updateExpense({ ...input, id });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Edit expense"
        backHref={`/expenses?month=${row.incurredDate.slice(0, 7)}`}
        action={<DeleteExpenseButton expenseId={row.id} />}
      />
      <ExpenseForm
        refs={refs}
        today={todayLagos()}
        defaultValues={{
          category: row.category,
          amount: row.amountKobo === null ? "" : String(row.amountKobo / 100),
          incurredDate: row.incurredDate,
          siteId: row.siteId ?? "",
          greenhouseId: row.greenhouseId ?? "",
          cropCycleId: row.cropCycleId ?? "",
          description: row.description ?? "",
        }}
        onSubmitAction={submit}
        submitLabel="Save changes"
      />
    </div>
  );
}
