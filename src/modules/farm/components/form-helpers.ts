"use client";

import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action";

/**
 * Map a failed ActionResult into the form: zod fieldErrors go to their
 * fields, a DUPLICATE (pg 23505) becomes a friendly error on `duplicateField`.
 */
export function applyActionError<T extends FieldValues>(
  form: UseFormReturn<T>,
  result: Extract<ActionResult<unknown>, { ok: false }>,
  duplicateField?: Path<T>,
) {
  if (result.fieldErrors) {
    for (const [field, messages] of Object.entries(result.fieldErrors)) {
      if (messages?.[0]) {
        form.setError(field as Path<T>, { message: messages[0] });
      }
    }
  }
  if (result.code === "DUPLICATE" && duplicateField) {
    form.setError(duplicateField, { message: result.error });
  }
  toast.error(result.error);
}
