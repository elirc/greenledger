import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { subscriptionStatusEnum } from "./enums";

/** Global — no organisation column. Prices are placeholders per Assumptions. */
export const plans = pgTable("plans", {
  id: uuid().defaultRandom().primaryKey(),
  // 'starter' | 'growth' | 'estate'
  code: text().notNull().unique(),
  name: text().notNull(),
  maxGreenhouses: integer().notNull(),
  monthlyPriceKobo: bigint({ mode: "number" }).notNull(),
  paystackPlanCode: text(),
  isActive: boolean().default(true).notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Read-only rule (single helper used by every mutating action):
 * read_only ⇔ (status='trialing' AND trial_ends_at < now()) OR
 * status IN ('past_due','cancelled'). Org data is NEVER deleted.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid().defaultRandom().primaryKey(),
    organisationId: text()
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: "restrict" }),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    status: subscriptionStatusEnum().default("trialing").notNull(),
    trialEndsAt: timestamp({ withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp({ withTimezone: true }),
    paystackCustomerCode: text(),
    paystackSubscriptionCode: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("subscriptions_status_idx").on(t.status)],
);

/** No org column — resolved during processing. external_id = idempotency. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid().defaultRandom().primaryKey(),
    provider: text().default("paystack").notNull(),
    eventType: text().notNull(),
    externalId: text().notNull(),
    payload: jsonb().notNull(),
    processedAt: timestamp({ withTimezone: true }),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("webhook_events_provider_ext_uidx").on(
      t.provider,
      t.externalId,
    ),
  ],
);
