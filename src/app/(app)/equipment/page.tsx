import Link from "next/link";
import { Plus, Tractor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { EquipmentList } from "@/modules/equipment/components/equipment-list";
import { listEquipment } from "@/modules/equipment/queries";

export const metadata = { title: "Equipment" };

export default async function EquipmentPage() {
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const rows = await listEquipment(ctx);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Equipment"
        description="Pumps, tanks, sprayers, covers and nets — with service schedules."
        action={
          <Button asChild className="h-11">
            <Link href="/equipment/new">
              <Plus className="size-4" /> Add
            </Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Tractor}
          title="No equipment yet"
          description="Register your pumps, dosing units and sprayers to track servicing and repairs."
        >
          <Button asChild className="h-11">
            <Link href="/equipment/new">Add your first item</Link>
          </Button>
        </EmptyState>
      ) : (
        <EquipmentList rows={rows} today={todayLagos()} showMoney={ctx.canSeeMoney} />
      )}
    </div>
  );
}
