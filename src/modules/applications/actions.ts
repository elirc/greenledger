"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/action";
import { logApplicationHandler } from "./handlers";
import { applicationCreateSchema } from "./schema";

/**
 * Log a fertigation or spray (owner/manager/worker; workers only on
 * assigned greenhouses — enforced in the handler via assertGreenhouse).
 * Posting runs in one transaction through postApplication.
 */
export const logApplication = defineAction({
  name: "applications.create",
  schema: applicationCreateSchema,
  roles: ["owner", "manager", "worker"],
  handler: async (input, ctx) => {
    const result = await logApplicationHandler(input, ctx);
    revalidatePath("/applications", "layout");
    revalidatePath(`/cycles/${result.cropCycleId}`, "layout");
    revalidatePath("/greenhouses", "layout");
    revalidatePath("/store", "layout");
    revalidatePath("/");
    return result;
  },
});
