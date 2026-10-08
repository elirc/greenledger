import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Bell,
  ClipboardCheck,
  Package,
  QrCode,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { todayLagos } from "@/lib/dates";
import { listStockItems } from "@/modules/stock/stock-queries";
import { StockList } from "./stock-list";

export const metadata = { title: "Store" };

const QUICK_ACTIONS = [
  { href: "/store/receive", label: "Receive", icon: ArrowDownToLine },
  { href: "/store/issue", label: "Issue", icon: ArrowUpFromLine },
  { href: "/store/transfer", label: "Transfer", icon: ArrowLeftRight },
  { href: "/store/counts", label: "Count", icon: ClipboardCheck },
  { href: "/store/labels", label: "Labels", icon: QrCode },
  { href: "/store/alerts", label: "Alerts", icon: Bell },
  { href: "/store/suppliers", label: "Suppliers", icon: Truck },
] as const;

export default async function StorePage() {
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const rows = await listStockItems(ctx);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Store"
        description="Input stock on hand, value and what needs attention."
      />

      <nav
        aria-label="Store actions"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {QUICK_ACTIONS.map((a) => (
          <Button
            key={a.href}
            asChild
            variant="outline"
            className="h-11 shrink-0"
          >
            <Link href={a.href}>
              <a.icon className="size-4" /> {a.label}
            </Link>
          </Button>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No items in the store yet"
          description="Receive your first delivery to start tracking stock, value and expiry."
        >
          <Button asChild className="h-11">
            <Link href="/store/receive">Receive stock</Link>
          </Button>
        </EmptyState>
      ) : (
        <StockList
          rows={rows}
          today={todayLagos()}
          showValue={ctx.canSeeMoney}
        />
      )}
    </div>
  );
}
