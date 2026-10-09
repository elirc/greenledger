import { z } from "zod";

/** Shared between the client form (zodResolver) and the server action. */

/** Stored as free text (DATA-MODEL §4.3); the UI offers these. */
export const LOSS_CAUSES = [
  "pest",
  "disease",
  "physical",
  "heat",
  "other",
] as const;
export type LossCause = (typeof LOSS_CAUSES)[number];

export const LOSS_CAUSE_LABELS: Record<LossCause, string> = {
  pest: "Pest",
  disease: "Disease",
  physical: "Physical damage",
  heat: "Heat",
  other: "Other",
};

export function lossCauseLabel(cause: string): string {
  return (LOSS_CAUSE_LABELS as Record<string, string>)[cause] ?? cause;
}

export const plantLossCreateSchema = z.object({
  /** Client UUID (offline sync hook) — used as the plant_losses row PK. */
  clientId: z.uuid(),
  cropCycleId: z.uuid(),
  /** Lagos calendar date yyyy-MM-dd from <input type="date">. */
  date: z.iso.date({ error: "Enter the date" }),
  count: z
    .number({ error: "Enter how many plants were lost" })
    .int("Whole plants only")
    .positive("Must be at least 1")
    .max(10_000_000, "Too many plants"),
  cause: z.enum(LOSS_CAUSES, { error: "Pick a cause" }),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type PlantLossCreateInput = z.infer<typeof plantLossCreateSchema>;
