"use client";

import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { removeStaff } from "../actions";

/** Removes the membership (and greenhouse assignments); the account stays. */
export function RemoveStaffButton({
  memberId,
  name,
}: {
  memberId: string;
  name: string;
}) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className="text-destructive h-11 w-full">
          <UserMinus className="size-4" /> Remove from farm
        </Button>
      }
      title={`Remove ${name}?`}
      description="They will lose access to this farm straight away. Their past records stay. You can add them again later."
      confirmLabel="Remove"
      destructive
      onConfirm={async () => {
        const result = await removeStaff({ memberId });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`${name} removed from the farm`);
        router.push("/settings/users");
        router.refresh();
      }}
    />
  );
}
