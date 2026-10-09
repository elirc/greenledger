"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { primaryNav, moreNav, isNavActive } from "./nav-items";
import { UserMenu } from "./user-menu";

export function DesktopSidebar({
  headerSlot,
}: {
  /** Server-rendered extras (notification bell) passed from AppShell. */
  headerSlot?: ReactNode;
}) {
  const pathname = usePathname();
  const items = [...primaryNav, ...moreNav];

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <Image src="/icon.svg" alt="" width={28} height={28} />
        <span className="text-lg font-semibold tracking-tight">
          GreenLedger
        </span>
      </div>
      <Separator className="bg-sidebar-border" />
      <ScrollArea className="flex-1 px-3 py-3">
        <nav aria-label="Primary" className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
      <Separator className="bg-sidebar-border" />
      <div className="flex items-center gap-2 p-3">
        {/* session header slot */}
        {headerSlot}
        <UserMenu />
      </div>
    </aside>
  );
}
