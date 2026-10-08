import Link from "next/link";
import { notFound } from "next/navigation";
import { PackagePlus, Pencil } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireMember } from "@/lib/guard";
import { ItemBatchesList } from "@/modules/items/components/item-batches-list";
import { ItemInfoCard } from "@/modules/items/components/item-info-card";
import { ItemMovementsList } from "@/modules/items/components/item-movements-list";
import {
  getItem,
  getItemOnHandByStore,
  listItemBatches,
  listItemMovements,
} from "@/modules/items/queries";

export const metadata = { title: "Item" };

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const item = await getItem(ctx, id);
  if (!item) notFound();

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [onHandByStore, batches, movements] = await Promise.all([
    getItemOnHandByStore(ctx, id),
    listItemBatches(ctx, id),
    listItemMovements(ctx, id, page),
  ]);
  const canEdit = ctx.role === "owner" || ctx.role === "manager";
  const tab = sp.tab === "movements" ? "movements" : "batches";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={item.name}
        backHref="/store"
        action={
          canEdit ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={`/store/items/${item.id}/edit`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
          ) : null
        }
      />
      <ItemInfoCard item={item} onHandByStore={onHandByStore} />
      <Button asChild className="h-11 w-full sm:w-auto">
        <Link href="/store/receive">
          <PackagePlus className="size-4" /> Receive stock
        </Link>
      </Button>
      <Tabs defaultValue={tab} className="gap-4">
        <TabsList className="h-11 w-full group-data-horizontal/tabs:h-11">
          <TabsTrigger value="batches" className="min-h-10">
            Batches ({batches.length})
          </TabsTrigger>
          <TabsTrigger value="movements" className="min-h-10">
            Movements
          </TabsTrigger>
        </TabsList>
        <TabsContent value="batches">
          <ItemBatchesList
            batches={batches}
            baseUnit={item.baseUnit}
            showMoney={ctx.canSeeMoney}
          />
        </TabsContent>
        <TabsContent value="movements">
          <ItemMovementsList
            rows={movements.rows}
            baseUnit={item.baseUnit}
            page={movements.page}
            hasMore={movements.hasMore}
            pageHref={(p) => `/store/items/${item.id}?tab=movements&page=${p}`}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
