"use server";

import { revalidatePath } from "next/cache";
import { defineAction, type ActionResult } from "@/lib/action";
import {
  logScoutingHandler,
  SCOUTING_ROLES,
  type LogScoutingResult,
} from "./handlers";
import { scoutingUploadSchema } from "./schema";

/**
 * Delegates to logScoutingHandler (src/modules/scouting/handlers.ts), the
 * same code the /api/sync route runs for "scouting.create" (no photo).
 */
const logScoutingAction = defineAction({
  name: "scouting.create",
  schema: scoutingUploadSchema,
  roles: SCOUTING_ROLES,
  handler: async (input, ctx): Promise<LogScoutingResult> => {
    const result = await logScoutingHandler(input, ctx);
    if (!result.duplicate) {
      revalidatePath(`/cycles/${input.cropCycleId}`);
      revalidatePath(`/cycles/${input.cropCycleId}/scouting`);
    }
    return result;
  },
});

/**
 * Form entry point: the scouting form posts multipart FormData (text fields
 * + optional `photo`). Everything is re-validated by the zod schema.
 */
export async function logScouting(
  formData: FormData,
): Promise<ActionResult<LogScoutingResult>> {
  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const photo = formData.get("photo");
  return logScoutingAction({
    clientId: text("clientId"),
    cropCycleId: text("cropCycleId"),
    date: text("date"),
    pestOrDisease: text("pestOrDisease"),
    severity: text("severity"),
    actionTaken: text("actionTaken"),
    photo: photo instanceof File && photo.size > 0 ? photo : undefined,
  });
}
