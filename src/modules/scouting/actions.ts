"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cropCycles, files, scoutingLogs } from "@/db/schema";
import { storage } from "@/adapters/storage";
import { defineAction, type ActionResult } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { assertGreenhouse } from "@/lib/guard";
import { newId } from "@/lib/ids";
import { safeFilename, scoutingPhotoKey, sniffImageType } from "./logic";
import { PHOTO_EXT, scoutingUploadSchema } from "./schema";

function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  if ((e as { code?: unknown }).code === "23505") return true;
  return (e as { cause?: { code?: string } }).cause?.code === "23505";
}

const emptyToNull = (s: string | undefined) =>
  s && s.length > 0 ? s : null;

type LogScoutingResult = { id: string; duplicate: boolean };

const logScoutingAction = defineAction({
  name: "scouting.create",
  schema: scoutingUploadSchema,
  roles: ["owner", "manager", "worker"],
  handler: async (input, ctx): Promise<LogScoutingResult> => {
    const cycle = await db.query.cropCycles.findFirst({
      where: and(
        eq(cropCycles.id, input.cropCycleId),
        eq(cropCycles.organisationId, ctx.orgId),
      ),
      columns: { id: true, greenhouseId: true, status: true },
    });
    if (!cycle) throw new DomainError("NOT_FOUND", "Crop cycle not found.");
    assertGreenhouse(ctx, cycle.greenhouseId);
    if (cycle.status === "closed") {
      throw new DomainError(
        "CYCLE_CLOSED",
        "This cycle is closed — scouting can no longer be logged.",
      );
    }

    // Replay of an already-saved log (offline retry) — no side effects.
    const existing = await db.query.scoutingLogs.findFirst({
      where: and(
        eq(scoutingLogs.id, input.clientId),
        eq(scoutingLogs.organisationId, ctx.orgId),
      ),
      columns: { id: true },
    });
    if (existing) return { id: existing.id, duplicate: true };

    // Photo: trust the bytes, not the declared type. Stored before the
    // transaction (storage isn't transactional); a failed insert leaves an
    // unreferenced file, never a dangling files row.
    let photo: {
      fileId: string;
      key: string;
      type: keyof typeof PHOTO_EXT;
      filename: string;
      size: number;
    } | null = null;
    if (input.photo) {
      const bytes = new Uint8Array(await input.photo.arrayBuffer());
      const type = sniffImageType(bytes);
      if (!type) {
        throw new DomainError(
          "BAD_PHOTO",
          "That file is not a JPEG, PNG or WebP image.",
        );
      }
      const fileId = newId();
      const key = scoutingPhotoKey(ctx.orgId, fileId, type);
      await storage.put(key, Buffer.from(bytes), type);
      photo = {
        fileId,
        key,
        type,
        filename: safeFilename(input.photo.name, `scouting.${PHOTO_EXT[type]}`),
        size: bytes.byteLength,
      };
    }

    try {
      return await db.transaction(async (tx) => {
        if (photo) {
          await tx.insert(files).values({
            id: photo.fileId,
            organisationId: ctx.orgId,
            storageKey: photo.key,
            filename: photo.filename,
            contentType: photo.type,
            sizeBytes: photo.size,
            uploadedBy: ctx.userId,
          });
        }
        const [row] = await tx
          .insert(scoutingLogs)
          .values({
            id: input.clientId,
            organisationId: ctx.orgId,
            cropCycleId: cycle.id,
            date: input.date,
            pestOrDisease: input.pestOrDisease,
            severity: input.severity,
            photoFileId: photo?.fileId ?? null,
            actionTaken: emptyToNull(input.actionTaken),
            createdBy: ctx.userId,
          })
          .returning({ id: scoutingLogs.id });
        await writeAudit(tx, ctx, {
          action: "scouting.create",
          entityType: "scouting_log",
          entityId: row.id,
          after: {
            cropCycleId: cycle.id,
            date: input.date,
            pestOrDisease: input.pestOrDisease,
            severity: input.severity,
            photoFileId: photo?.fileId ?? null,
          },
        });
        revalidatePath(`/cycles/${cycle.id}`);
        revalidatePath(`/cycles/${cycle.id}/scouting`);
        return { id: row.id, duplicate: false };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        // Concurrent replay won the race (DECISIONS §17 belt-and-braces).
        return { id: input.clientId, duplicate: true };
      }
      throw e;
    }
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
