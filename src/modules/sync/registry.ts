/**
 * Offline-sync op registry (ARCHITECTURE §6). One entry per OpKind: a zod
 * parser for the raw payload and the module handler that applies it. P6
 * agents extend this with the remaining ops (stock.issue, scouting.create,
 * task.complete, reading.create) as their handlers land.
 */

import type { z } from "zod";
import type { Ctx } from "@/lib/guard";
import { plantLossCreateSchema } from "@/modules/losses/schema";
import { logPlantLossHandler } from "@/modules/losses/handlers";
import { applicationCreateSchema } from "@/modules/applications/schema";
import { logApplicationHandler } from "@/modules/applications/handlers";
import { harvestCreateSchema } from "@/modules/harvest/schema";
import { postHarvestHandler } from "@/modules/harvest/handlers";

export interface SyncOpEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogenous registry
  schema: z.ZodType<any>;
  run: (input: never, ctx: Ctx) => Promise<unknown>;
}

export const SYNC_OPS: Record<string, SyncOpEntry> = {
  "plantLoss.create": {
    schema: plantLossCreateSchema,
    run: logPlantLossHandler as SyncOpEntry["run"],
  },
  "application.create": {
    schema: applicationCreateSchema,
    run: logApplicationHandler as SyncOpEntry["run"],
  },
  "harvest.create": {
    schema: harvestCreateSchema,
    run: postHarvestHandler as SyncOpEntry["run"],
  },
  // P6 adds: "stock.issue", "scouting.create", "task.complete", "reading.create"
};

export type OpKind = keyof typeof SYNC_OPS | (string & {});
