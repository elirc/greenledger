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

import type { Role } from "@/lib/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles that may use the screen; omitted = everyone. */
  roles?: Role[];
}

const OM: Role[] = ["owner", "manager"];
const OMS: Role[] = ["owner", "manager", "storekeeper"];
const OMW: Role[] = ["owner", "manager", "worker"];

/** Primary tabs shown in the mobile bottom nav (More opens the sheet). */
export const primaryNav: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/store", label: "Store", icon: Warehouse, roles: OMS },
  { href: "/harvest", label: "Harvest", icon: Leaf, roles: OMW },
  { href: "/tasks", label: "Tasks", icon: CalendarCheck2 },
];

/** Everything else, shown in the More sheet and the desktop sidebar. */
export const moreNav: NavItem[] = [
  { href: "/greenhouses", label: "Greenhouses", icon: Tent },
  { href: "/nursery", label: "Nursery", icon: Sprout, roles: OMW },
  { href: "/cycles", label: "Crop cycles", icon: ClipboardList, roles: OMW },
  { href: "/applications", label: "Applications", icon: SprayCan, roles: OMW },
  { href: "/recipes", label: "Recipes", icon: FlaskConical, roles: OM },
  { href: "/produce", label: "Produce", icon: PackageOpen, roles: OMS },
  { href: "/sales", label: "Sales", icon: Receipt, roles: OM },
  { href: "/equipment", label: "Equipment", icon: Tractor, roles: OMS },
  { href: "/readings", label: "Readings", icon: Thermometer, roles: OMW },
  { href: "/reports", label: "Reports", icon: LineChart, roles: OM },
  { href: "/expenses", label: "Expenses", icon: CreditCard, roles: OM },
  { href: "/scan", label: "Scan", icon: QrCode },
  { href: "/settings", label: "Settings", icon: Settings, roles: OM },
];

/** Items a member with `role` may see (undefined role = show everything). */
export function navForRole(items: NavItem[], role?: Role): NavItem[] {
  if (!role) return items;
  return items.filter((i) => !i.roles || i.roles.includes(role));
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
