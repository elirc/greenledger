"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const LINKS = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/orgs", label: "Organisations" },
  { href: "/platform/plans", label: "Plans" },
  { href: "/platform/audit", label: "Audit log" },
  { href: "/platform/health", label: "Health" },
];

/** Horizontal, scrollable tab nav for the platform admin area. */
export function PlatformNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Platform" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1">
        {LINKS.map((l) => {
          const active =
            l.href === "/platform" ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
