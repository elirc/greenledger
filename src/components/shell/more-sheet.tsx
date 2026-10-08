"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { moreNav, isNavActive } from "./nav-items";

export function MoreSheet({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>All sections</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-3 gap-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {moreNav.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium",
                  active
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : "border-border bg-card text-foreground",
                )}
              >
                <item.icon className="size-6" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
