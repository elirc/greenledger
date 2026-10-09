import Link from "next/link";
import {
  ChartColumn,
  ChevronRight,
  Coins,
  PackageX,
  ShoppingCart,
  SprayCan,
  Warehouse,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { REPORT_KEYS, REPORT_META, type ReportKey } from "@/modules/reports/queries";

export const metadata = { title: "Reports" };

const ICONS: Record<ReportKey, LucideIcon> = {
  profitability: Coins,
  "input-use": FlaskConical,
  harvest: ChartColumn,
  waste: PackageX,
  "stock-valuation": Warehouse,
  purchases: ShoppingCart,
  "spray-record": SprayCan,
};

export default async function ReportsHubPage() {
  await requireMember({ roles: ["owner", "manager"] });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Reports"
        description="Every report opens on screen and exports to Excel; the spray record also prints as a PDF."
      />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {REPORT_KEYS.map((key) => {
          const meta = REPORT_META[key];
          const Icon = ICONS[key];
          return (
            <li key={key}>
              <Link
                href={`/reports/${key}`}
                className="bg-card hover:bg-muted/40 flex min-h-20 items-center gap-3 rounded-xl border p-4"
              >
                <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{meta.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {meta.description}
                  </p>
                </div>
                <ChevronRight
                  className="text-muted-foreground size-5 shrink-0"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
