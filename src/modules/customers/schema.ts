import { z } from "zod";

/** Shared between the client form (zodResolver) and the server action. */
export const customerCreateSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  email: z.email("Enter a valid email").optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const customerUpdateSchema = customerCreateSchema.extend({
  id: z.uuid(),
});

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
