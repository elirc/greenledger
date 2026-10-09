/**
 * Pure notification helpers: where a notification links to, and its tone.
 * The table stores (entity_type, entity_id), not a URL (DATA-MODEL §4.11).
 */

export type NotificationTone = "danger" | "warning" | "info";

export function notificationHref(n: {
  type: string;
  entityType: string | null;
  entityId: string | null;
}): string | null {
  switch (n.entityType) {
    case "item":
      return n.entityId ? `/store/items/${n.entityId}` : "/store";
    case "item_batch":
      return "/store/alerts";
    case "produce_lot":
      return "/produce";
    case "maintenance_schedule":
    case "equipment":
      return "/equipment";
    case "task":
      return "/tasks";
    case "subscription":
      return "/settings/billing";
    default:
      break;
  }
  switch (n.type) {
    case "low_stock":
      return "/store";
    case "expiry_60":
    case "expiry_30":
    case "expired":
      return "/store/alerts";
    case "produce_best_before":
      return "/produce";
    case "maintenance_due":
      return "/equipment";
    case "task_due":
      return "/tasks";
    case "trial_ending":
    case "payment_failed":
    case "subscription_read_only":
      return "/settings/billing";
    default:
      return null;
  }
}

export function notificationTone(type: string): NotificationTone {
  switch (type) {
    case "expired":
    case "payment_failed":
    case "subscription_read_only":
      return "danger";
    case "expiry_30":
    case "low_stock":
    case "produce_best_before":
    case "maintenance_due":
    case "trial_ending":
      return "warning";
    default:
      return "info";
  }
}
