/**
 * Offline-sync op registry (ARCHITECTURE §6). One entry per OpKind: a zod
 * parser for the raw payload and the module handler that applies it. Every
 * handler enforces its own role/greenhouse gates (the sync route has no
 * per-op roles) and is replay-safe (client-UUID PK → DUPLICATE, or an
 * explicit `{ duplicate: true }`).
 */

import type { z } from "zod";
import { AuthError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import type { Role } from "@/lib/permissions";
import { plantLossCreateSchema } from "@/modules/losses/schema";
import { logPlantLossHandler } from "@/modules/losses/handlers";
import { applicationCreateSchema } from "@/modules/applications/schema";
import { logApplicationHandler } from "@/modules/applications/handlers";
import { harvestCreateSchema } from "@/modules/harvest/schema";
import { postHarvestHandler } from "@/modules/harvest/handlers";
import { readingCreateSchema } from "@/modules/readings/schema";
import { createReadingHandler } from "@/modules/readings/handlers";
import { issueStockSchema } from "@/modules/stock/schema";
import { issueStockHandler } from "@/modules/stock/handlers";
import { scoutingCreateSchema } from "@/modules/scouting/schema";
import { logScoutingHandler } from "@/modules/scouting/handlers";
import { taskCompleteSchema } from "@/modules/tasks/schema";
import { completeTaskHandler } from "@/modules/tasks/handlers";

export interface SyncOpEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogenous registry
  schema: z.ZodType<any>;
  run: (input: never, ctx: Ctx) => Promise<unknown>;
}

/**
 * The Server Actions gate roles in defineAction; the sync route does not, so
 * every entry re-applies the same role list here (ARCHITECTURE §5 route map).
 */
function gated(
  roles: Role[] | null,
  handler: (input: never, ctx: Ctx) => Promise<unknown>,
): SyncOpEntry["run"] {
  return async (input, ctx) => {
    if (roles && !roles.includes(ctx.role)) throw new AuthError("FORBIDDEN");
    return handler(input, ctx);
  };
}

const OMW: Role[] = ["owner", "manager", "worker"];
const OMS: Role[] = ["owner", "manager", "storekeeper"];

export const SYNC_OPS: Record<string, SyncOpEntry> = {
  "plantLoss.create": {
    schema: plantLossCreateSchema,
    run: gated(OMW, logPlantLossHandler as SyncOpEntry["run"]),
  },
  "application.create": {
    schema: applicationCreateSchema,
    run: gated(OMW, logApplicationHandler as SyncOpEntry["run"]),
  },
  "harvest.create": {
    schema: harvestCreateSchema,
    run: gated(OMW, postHarvestHandler as SyncOpEntry["run"]),
  },
  "reading.create": {
    schema: readingCreateSchema,
    run: gated(OMW, createReadingHandler as SyncOpEntry["run"]),
  },
  "stock.issue": {
    schema: issueStockSchema,
    run: gated(OMS, issueStockHandler as SyncOpEntry["run"]),
  },
  /** Text-only schema: queued scouting logs never carry a photo. */
  "scouting.create": {
    schema: scoutingCreateSchema,
    run: gated(OMW, logScoutingHandler as SyncOpEntry["run"]),
  },
  /** Any role; canCompleteTask (inside the handler) is the gate. */
  "task.complete": {
    schema: taskCompleteSchema,
    run: gated(null, completeTaskHandler as SyncOpEntry["run"]),
  },
};

export type OpKind = keyof typeof SYNC_OPS | (string & {});
