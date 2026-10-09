"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/action";
import { createReadingHandler } from "./handlers";
import { readingCreateSchema } from "./schema";

/**
 * Record a climate / EC / pH reading (owner/manager/worker; workers only on
 * assigned greenhouses — enforced inside the handler).
 */
export const createReading = defineAction({
  name: "readings.create",
  schema: readingCreateSchema,
  roles: ["owner", "manager", "worker"],
  handler: async (input, ctx) => {
    const result = await createReadingHandler(input, ctx);
    revalidatePath("/readings");
    revalidatePath(`/greenhouses/${input.greenhouseId}`);
    return result;
  },
});
