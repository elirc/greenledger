import type { Db } from "../index";
import type { Role } from "../../lib/permissions";

/** A demo login printed in the summary. */
export interface SeedLogin {
  label: string;
  email: string;
  password: string;
  phoneNumber: string | null;
}

/**
 * Shared, mutable state threaded through the seed steps. Each step reads what
 * earlier steps produced and records what it creates. Later phases add fields
 * (all optional) and append steps — never reorder or rewrite earlier ones.
 */
export interface SeedState {
  db: Db;
  /** Fixed "seed time" — every derived timestamp is computed from this. */
  now: Date;
  planIds: Record<"starter" | "growth" | "estate", string>;
  platformAdminId: string;
  orgId: string;
  subscriptionId: string;
  /** user id per membership role */
  userIds: Record<Role, string>;
  memberIds: Record<Role, string>;
  siteId: string;
  /** keyed by greenhouse name (GH1..GH6) */
  greenhouseIds: Record<string, string>;
  /** keyed by `${greenhouseName}/${zoneName}` e.g. "GH1/A" */
  zoneIds: Record<string, string>;
  /** keyed by store name */
  storeIds: Record<string, string>;
  logins: SeedLogin[];
  /** entity → row count, printed at the end */
  counts: Record<string, number>;
}

export type SeedStep = {
  name: string;
  run: (state: SeedState) => Promise<void>;
};

export function bump(state: SeedState, entity: string, n = 1): void {
  state.counts[entity] = (state.counts[entity] ?? 0) + n;
}
