import { formatLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { notificationHref, notificationTone } from "../logic";
import { countUnreadNotifications, listNotifications } from "../queries";
import { NotificationSheet, type NotificationItem } from "./notification-sheet";

/**
 * Shell header bell (server component): fetches the signed-in user's feed and
 * unread count, hands plain data to the client sheet. Renders nothing when
 * there is no farm context (the layout handles redirects) or on failure — the
 * header must never crash the page.
 */
export async function NotificationBell() {
  let items: NotificationItem[];
  let unread: number;
  try {
    const ctx = await requireMember();
    const [rows, count] = await Promise.all([
      listNotifications(ctx, 30),
      countUnreadNotifications(ctx),
    ]);
    unread = count;
    items = rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      href: notificationHref(r),
      tone: notificationTone(r.type),
      timeLabel: formatLagos(r.createdAt, "dd MMM, HH:mm"),
      read: r.readAt !== null,
    }));
  } catch (err) {
    console.error("[notifications] bell failed to load:", err);
    return null;
  }
  return <NotificationSheet items={items} unread={unread} />;
}
