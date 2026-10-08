"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "cn";
import { primaryNav, moreNav, isNavActive } from "./nav-items";
import { MoreSheet } from "./more-sheet";

export function BottomNav() {
  const pathname = usePathname();
  const moreActive = moreNav.some((item) => isNavActive(pathname, item.href));

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="mx-auto grid h-16 max-w-3xl grid-cols-5">
        {primaryNav.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon
                className={cn("size-6", active && "fill-primary/15")}
                strokeWidth={active ? 2.4 : 2}
              />
              {item.label}
            </Link>
          );
        })}
        <MoreSheet
          trigger={
            <button
              type="button"
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                moreActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Menu className="size-6" strokeWidth={moreActive ? 2.4 : 2} />
              More
            </button>
          }
        />
      </div>
    </nav>
  );
}
