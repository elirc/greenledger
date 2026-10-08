"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GreenhouseRow, SiteRow, StoreRow } from "../queries";
import { GreenhouseList } from "./greenhouse-list";
import { SitePanel } from "./site-panel";
import { StoreList } from "./store-list";

export function FarmStructureTabs({
  sites,
  greenhouses,
  stores,
}: {
  sites: SiteRow[];
  greenhouses: GreenhouseRow[];
  stores: StoreRow[];
}) {
  const siteOptions = sites.map((s) => ({ id: s.id, name: s.name }));
  return (
    <Tabs defaultValue="greenhouses" className="gap-4">
      <TabsList className="h-11 w-full group-data-horizontal/tabs:h-11">
        <TabsTrigger value="site" className="min-h-10">
          Site
        </TabsTrigger>
        <TabsTrigger value="greenhouses" className="min-h-10">
          Greenhouses
        </TabsTrigger>
        <TabsTrigger value="stores" className="min-h-10">
          Stores
        </TabsTrigger>
      </TabsList>
      <TabsContent value="site">
        <SitePanel sites={sites} />
      </TabsContent>
      <TabsContent value="greenhouses">
        <GreenhouseList greenhouses={greenhouses} sites={siteOptions} />
      </TabsContent>
      <TabsContent value="stores">
        <StoreList stores={stores} sites={siteOptions} />
      </TabsContent>
    </Tabs>
  );
}
