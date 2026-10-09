import { z } from "zod";

/** Shared between the notification sheet and the server actions. */
export const markReadSchema = z.object({ id: z.uuid() });
export const markAllReadSchema = z.object({});

export type MarkReadInput = z.infer<typeof markReadSchema>;
