"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteExpense } from "../actions";

export function DeleteExpenseButton({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className="h-11">
          <Trash2 className="size-4" /> Delete
        </Button>
      }
      title="Delete this expense?"
      description="It will no longer count in monthly totals or cycle profitability. The audit log keeps a record."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        const result = await deleteExpense({ id: expenseId });
        if (result.ok) {
          toast.success("Expense deleted");
          router.push(`/expenses?month=${result.data.month}`);
          router.refresh();
          return;
        }
        toast.error(result.error);
      }}
    />
  );
}
