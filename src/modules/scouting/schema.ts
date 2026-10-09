import { z } from "zod";

/** Shared between the client form (zodResolver) and the server action. */

export const SCOUTING_SEVERITIES = ["low", "medium", "high"] as const;
export type ScoutingSeverity = (typeof SCOUTING_SEVERITIES)[number];

export const SEVERITY_LABELS: Record<ScoutingSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Upload limits (brief: jpeg/png/webp, ≤ 5 MB). */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

export const PHOTO_EXT: Record<PhotoType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** The text fields of a scouting log — what the react-hook-form manages. */
export const scoutingCreateSchema = z.object({
  /** Client UUID (offline idempotency) — becomes the scouting_logs PK. */
  clientId: z.uuid(),
  cropCycleId: z.uuid({ error: "Pick a crop cycle" }),
  date: z.iso.date({ error: "Pick a date" }),
  pestOrDisease: z
    .string()
    .trim()
    .min(2, "Name the pest or disease")
    .max(120, "Keep it under 120 characters"),
  severity: z.enum(SCOUTING_SEVERITIES, { error: "Pick a severity" }),
  actionTaken: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type ScoutingCreateInput = z.infer<typeof scoutingCreateSchema>;

/** One optional photo; mime is re-checked against the file bytes server-side. */
export const scoutingPhotoSchema = z
  .file()
  .min(1, "The photo is empty")
  .max(PHOTO_MAX_BYTES, "Photo must be 5 MB or smaller")
  .mime([...PHOTO_TYPES], "Photo must be a JPEG, PNG or WebP image");

/** What the server action validates (FormData → object). */
export const scoutingUploadSchema = scoutingCreateSchema.extend({
  photo: scoutingPhotoSchema.optional(),
});
export type ScoutingUploadInput = z.infer<typeof scoutingUploadSchema>;
