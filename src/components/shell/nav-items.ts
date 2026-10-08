import {
  CalendarCheck2,
  ClipboardList,
  CreditCard,
  FlaskConical,
  Home,
  Leaf,
  LineChart,
  PackageOpen,
  QrCode,
  Receipt,
  Settings,
  Sprout,
  SprayCan,
  Tent,
  Thermometer,
  Tractor,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Primary tabs shown in the mobile bottom nav (More opens the sheet). */
export const primaryNav: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/store", label: "Store", icon: Warehouse },
  { href: "/harvest", label: "Harvest", icon: Leaf },
  { href: "/tasks", label: "Tasks", icon: CalendarCheck2 },
];

/** Everything else, shown in the More sheet and the desktop sidebar. */
export const moreNav: NavItem[] = [
  { href: "/greenhouses", label: "Greenhouses", icon: Tent },
  { href: "/nursery", label: "Nursery", icon: Sprout },
  { href: "/cycles", label: "Crop cycles", icon: ClipboardList },
  { href: "/applications", label: "Applications", icon: SprayCan },
  { href: "/recipes", label: "Recipes", icon: FlaskConical },
  { href: "/produce", label: "Produce", icon: PackageOpen },
  { href: "/sales", label: "Sales", icon: Receipt },
  { href: "/equipment", label: "Equipment", icon: Tractor },
  { href: "/readings", label: "Readings", icon: Thermometer },
  { href: "/reports", label: "Reports", icon: LineChart },
  { href: "/expenses", label: "Expenses", icon: CreditCard },
  { href: "/scan", label: "Scan", icon: QrCode },
  { href: "/settings/farm", label: "Settings", icon: Settings },
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
