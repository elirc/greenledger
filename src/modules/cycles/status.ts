/** Crop-cycle status machine. Pure — unit tested in tests/unit/cycle-status.test.ts. */

import { DomainError } from "@/lib/errors";

export const CYCLE_STATUSES = [
  "planned",
  "nursery",
  "growing",
  "harvesting",
  "closed",
] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export const CYCLE_STATUS_LABELS: Record<CycleStatus, string> = {
  planned: "Planned",
  nursery: "In nursery",
  growing: "Growing",
  harvesting: "Harvesting",
  closed: "Closed",
};

/** Allowed forward transitions (closing is allowed from any active state). */
const TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  planned: ["nursery", "growing", "closed"],
  nursery: ["growing", "closed"],
  growing: ["harvesting", "closed"],
  harvesting: ["closed"],
  closed: [],
};

export function canTransition(from: CycleStatus, to: CycleStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: CycleStatus, to: CycleStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError(
      "BAD_TRANSITION",
      `A ${CYCLE_STATUS_LABELS[from].toLowerCase()} cycle cannot move to ${CYCLE_STATUS_LABELS[to].toLowerCase()}.`,
    );
  }
}

/** Statuses whose cycles count as "active" in dashboards and pickers. */
export const ACTIVE_CYCLE_STATUSES: CycleStatus[] = [
  "nursery",
  "growing",
  "harvesting",
];
