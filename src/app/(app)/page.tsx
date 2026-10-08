import type { Metadata } from "next";
import {
  CalendarCheck2,
  Leaf,
  PackageOpen,
  TriangleAlert,
  Wallet,
  Warehouse,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Dashboard" };

const tiles = [
  { label: "Input stock value", icon: Warehouse },
  { label: "Low & expiring items", icon: TriangleAlert },
  { label: "Produce on hand", icon: PackageOpen },
  { label: "This week's harvest", icon: Leaf },
  { label: "Sales & unpaid invoices", icon: Wallet },
  { label: "Tasks & maintenance due", icon: CalendarCheck2 },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Farm overview — stock, harvests, sales and what needs attention."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <SectionCard key={tile.label} title={tile.label}>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <tile.icon className="size-5 text-primary" />
              </div>
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Live numbers arrive in Phase 6 — modules are being wired in.
      </p>
    </>
  );
}
