"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarX,
  CheckCheck,
  CreditCard,
  Hourglass,
  ListChecks,
  Lock,
  PackageMinus,
  Timer,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { markAllNotificationsRead, markNotificationRead } from "../actions";
import type { NotificationTone } from "../logic";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  tone: NotificationTone;
  /** Pre-formatted (Africa/Lagos) on the server. */
  timeLabel: string;
  read: boolean;
}

const TYPE_ICON: Record<string, LucideIcon> = {
  low_stock: PackageMinus,
  expiry_60: CalendarX,
  expiry_30: CalendarX,
  expired: CalendarX,
  produce_best_before: Timer,
  maintenance_due: Wrench,
  task_due: ListChecks,
  trial_ending: Hourglass,
  payment_failed: CreditCard,
  subscription_read_only: Lock,
};

const TONE_CLASS: Record<NotificationTone, string> = {
  danger: "bg-status-danger/12 text-status-danger",
  warning: "bg-status-warning/15 text-status-warning",
  info: "bg-status-info/12 text-status-info",
};

/** Bell button with unread count + the notification list sheet. */
export function NotificationSheet({
  items,
  unread,
}: {
  items: NotificationItem[];
  unread: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function openItem(n: NotificationItem) {
    setBusy(n.id);
    try {
      if (!n.read) {
        const res = await markNotificationRead({ id: n.id });
        if (!res.ok) toast.error(res.error);
      }
      if (n.href) {
        setOpen(false);
        router.push(n.href);
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function markAll() {
    setBusy("all");
    try {
      const res = await markAllNotificationsRead({});
      if (!res.ok) toast.error(res.error);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-lg"
          className="relative size-11"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="bg-status-danger absolute top-1.5 right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white">
              {badge}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            {unread > 0 ? `${unread} unread` : "You're all caught up."}
          </SheetDescription>
        </SheetHeader>

        {items.length > 0 ? (
          <div className="flex justify-end border-b px-4 py-1">
            <Button
              variant="ghost"
              className="h-11"
              disabled={unread === 0 || busy !== null}
              onClick={() => void markAll()}
            >
              <CheckCheck className="size-4" />
              {busy === "all" ? "Marking…" : "Mark all read"}
            </Button>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="bg-muted mb-3 flex size-12 items-center justify-center rounded-full">
                <Bell className="text-muted-foreground size-6" />
              </div>
              <p className="font-medium">No notifications yet</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Expiry, low-stock, maintenance and billing alerts show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {items.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Bell;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void openItem(n)}
                      className={cn(
                        "hover:bg-muted/50 flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left disabled:opacity-60",
                        !n.read && "bg-primary/5",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg",
                          TONE_CLASS[n.tone],
                        )}
                      >
                        <Icon className="size-4.5" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span
                          className={cn(
                            "text-sm",
                            n.read ? "font-normal" : "font-semibold",
                          )}
                        >
                          {n.title}
                        </span>
                        {n.body ? (
                          <span className="text-muted-foreground line-clamp-2 text-sm">
                            {n.body}
                          </span>
                        ) : null}
                        <span className="text-muted-foreground text-xs">
                          {n.timeLabel}
                        </span>
                      </span>
                      {!n.read ? (
                        <span
                          aria-label="Unread"
                          className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
