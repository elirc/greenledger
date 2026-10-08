import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { FarmStructureTabs } from "@/modules/farm/components/farm-structure-tabs";
import { listGreenhouses, listSites, listStores } from "@/modules/farm/queries";

export const metadata = { title: "Farm structure" };

export default async function FarmSettingsPage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const [sites, greenhouses, stores] = await Promise.all([
    listSites(ctx),
    listGreenhouses(ctx),
    listStores(ctx),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Farm structure"
        description="Your site, greenhouses (with zones) and stores."
        backHref="/settings"
      />
      <FarmStructureTabs
        sites={sites}
        greenhouses={greenhouses}
        stores={stores}
      />
    </div>
  );
}
