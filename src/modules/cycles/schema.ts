import { z } from "zod";

/** Shared between the client forms (zodResolver) and the server actions. */

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

/** Lagos calendar date yyyy-MM-dd from <input type="date">. */
const lagosDate = (error: string) => z.iso.date({ error });

const plantCount = z
  .number({ error: "Enter the number of plants" })
  .int("Whole plants only")
  .positive("Must be more than 0")
  .max(10_000_000, "Too many plants");

export const cycleIdSchema = z.object({ id: z.uuid() });
export type CycleIdInput = z.infer<typeof cycleIdSchema>;

// ------------------------------------------------------------- planning

export const cyclePlanSchema = z.object({
  greenhouseId: z.uuid({ error: "Pick a greenhouse" }),
  varietyId: z.uuid({ error: "Pick a variety" }),
  /** Intended sow date. */
  sowDate: lagosDate("Enter the intended sow date"),
  notes: optionalText(1000),
});
export const cyclePlanUpdateSchema = cyclePlanSchema.extend({ id: z.uuid() });
export type CyclePlanInput = z.infer<typeof cyclePlanSchema>;
export type CyclePlanUpdateInput = z.infer<typeof cyclePlanUpdateSchema>;

// ----------------------------------------------------------- transitions

/**
 * Planned / in-nursery cycle → growing for direct-seeded farms (or a
 * nursery batch raised outside the app): sets the transplant date and the
 * plant count. Nursery-batch transplants go through transplantToCycle.
 */
export const cycleStartGrowingSchema = z.object({
  id: z.uuid(),
  transplantDate: lagosDate("Enter the transplant / planting date"),
  plantCount,
});
export type CycleStartGrowingInput = z.infer<typeof cycleStartGrowingSchema>;

/** Simple status moves. "growing" needs a plant count → startGrowing. */
export const CYCLE_SIMPLE_TARGETS = ["nursery", "harvesting", "closed"] as const;
export type CycleSimpleTarget = (typeof CYCLE_SIMPLE_TARGETS)[number];

export const cycleTransitionSchema = z.object({
  id: z.uuid(),
  to: z.enum(CYCLE_SIMPLE_TARGETS),
});
export type CycleTransitionInput = z.infer<typeof cycleTransitionSchema>;

/** Editing the transplant date recomputes expected harvest dates. */
export const cycleTransplantDateSchema = z.object({
  id: z.uuid(),
  transplantDate: lagosDate("Enter the transplant date"),
});
export type CycleTransplantDateInput = z.infer<
  typeof cycleTransplantDateSchema
>;
