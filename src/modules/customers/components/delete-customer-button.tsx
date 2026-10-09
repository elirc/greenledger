"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteCustomer } from "../actions";

/** Only customers without sales can be deleted (the action enforces it). */
export function DeleteCustomerButton({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className="h-11">
          <Trash2 className="size-4" /> Delete
        </Button>
      }
      title={`Delete ${customerName}?`}
      description="Only customers with no sales can be deleted."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        const result = await deleteCustomer({ id: customerId });
        if (result.ok) {
          toast.success("Customer deleted");
          router.push("/sales/customers");
          router.refresh();
          return;
        }
        toast.error(result.error);
      }}
    />
  );
}
