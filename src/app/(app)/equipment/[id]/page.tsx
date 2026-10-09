import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import {
  EquipmentFacts,
  ScheduleSection,
  WorkHistory,
} from "@/modules/equipment/components/equipment-detail";
import { getEquipmentDetail } from "@/modules/equipment/queries";

export const metadata = { title: "Equipment" };

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const eq = await getEquipmentDetail(ctx, id);
  if (!eq) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={eq.name}
        backHref="/equipment"
        action={
          <Button asChild variant="outline" className="h-11">
            <Link href={`/equipment/${eq.id}/edit`}>
              <Pencil className="size-4" /> Edit
            </Link>
          </Button>
        }
      />
      <EquipmentFacts eq={eq} showMoney={ctx.canSeeMoney} />
      <ScheduleSection eq={eq} today={todayLagos()} />
      <WorkHistory eq={eq} showMoney={ctx.canSeeMoney} />
    </div>
  );
}
