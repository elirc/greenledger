"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/action";
import { postHarvestHandler } from "./handlers";
import { harvestCreateSchema } from "./schema";

/**
 * Log a harvest (owner/manager/worker; workers only on assigned greenhouses
 * and never with a PHI override — both enforced in the handler).
 */
export const logHarvest = defineAction({
  name: "harvest.create",
  schema: harvestCreateSchema,
  roles: ["owner", "manager", "worker"],
  handler: async (input, ctx) => {
    const result = await postHarvestHandler(input, ctx);
    revalidatePath("/harvest", "layout");
    revalidatePath("/produce", "layout");
    revalidatePath(`/cycles/${result.cropCycleId}`, "layout");
    revalidatePath("/greenhouses", "layout");
    revalidatePath("/");
    return result;
  },
});
