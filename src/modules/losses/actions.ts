"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/action";
import { logPlantLossHandler } from "./handlers";
import { plantLossCreateSchema } from "./schema";

/**
 * Log a plant loss (owner/manager/worker; workers assigned greenhouse only —
 * enforced inside the handler via assertGreenhouse).
 */
export const logPlantLoss = defineAction({
  name: "losses.create",
  schema: plantLossCreateSchema,
  roles: ["owner", "manager", "worker"],
  handler: async (input, ctx) => {
    const result = await logPlantLossHandler(input, ctx);
    revalidatePath(`/cycles/${input.cropCycleId}`, "layout");
    revalidatePath("/cycles");
    revalidatePath("/greenhouses", "layout");
    return result;
  },
});
