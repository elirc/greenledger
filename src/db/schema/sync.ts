import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/**
 * Offline idempotency (DECISIONS §3). id IS the client-generated mutation
 * UUID. Handlers insert this row FIRST (ON CONFLICT (id) DO NOTHING) as the
 * first statement of their transaction; no row returned → duplicate →
 * return the stored result without re-applying.
 */
export const syncOps = pgTable(
  "sync_ops",
  {
    id: uuid().primaryKey(),
    organisationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    userId: text()
      .notNull()
      .references(() => user.id),
    kind: text().notNull(),
    // 'applied' | 'failed'
    status: text().notNull(),
    result: jsonb(),
    error: text(),
    appliedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("sync_ops_org_user_applied_idx").on(
      t.organisationId,
      t.userId,
      t.appliedAt,
    ),
  ],
);
