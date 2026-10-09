import { PageHeader } from "@/components/shell/page-header";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { createExpense } from "@/modules/expenses/actions";
import { ExpenseForm } from "@/modules/expenses/components/expense-form";
import { getExpenseFormRefs } from "@/modules/expenses/queries";

export const metadata = { title: "Add expense" };

export default async function NewExpensePage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const refs = await getExpenseFormRefs(ctx);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Add expense" backHref="/expenses" />
      <ExpenseForm
        refs={refs}
        today={todayLagos()}
        onSubmitAction={createExpense}
        submitLabel="Add expense"
      />
    </div>
  );
}
