import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { VarietiesManager } from "@/modules/crops/components/varieties-manager";
import { listCrops, listVarieties } from "@/modules/crops/queries";

export const metadata = { title: "Crops & varieties" };

export default async function VarietiesSettingsPage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const [crops, varieties] = await Promise.all([
    listCrops(ctx),
    listVarieties(ctx),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Crops & varieties"
        description="Harvest timing, expected yield and produce shelf life."
        backHref="/settings"
      />
      <VarietiesManager crops={crops} varieties={varieties} />
    </div>
  );
}
