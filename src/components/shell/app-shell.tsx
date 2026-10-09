import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { BottomNav } from "./bottom-nav";
import { DesktopSidebar } from "./desktop-sidebar";
import { UserMenu } from "./user-menu";
import { OfflineBadge } from "@/components/common/offline-badge";
import { NotificationBell } from "@/modules/notifications/components/notification-bell";
import type { Role } from "@/lib/permissions";

export function AppShell({
  children,
  role,
}: {
  children: ReactNode;
  role?: Role;
}) {
  return (
    <div className="min-h-dvh bg-background lg:pl-60">
      <DesktopSidebar headerSlot={<NotificationBell />} role={role} />

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/icon.svg" alt="" width={26} height={26} />
            <span className="text-base font-semibold tracking-tight">
              GreenLedger
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <OfflineBadge />
            {/* session header slot */}
            <NotificationBell />
            <UserMenu compactIcon />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 lg:max-w-5xl lg:px-8 lg:pb-12 lg:pt-6">
        {children}
      </main>

      <BottomNav role={role} />
    </div>
  );
}
