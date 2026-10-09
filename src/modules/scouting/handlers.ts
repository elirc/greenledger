/**
 * Scouting-log handler, plain module (NOT 'use server') per DECISIONS §17 so
 * the /api/sync route ("scouting.create") can dispatch to the same code the
 * Server Action runs. No revalidatePath here — actions.ts revalidates.
 *
 * Photos are NOT offline-capable: the sync payload is the text-only
 * scoutingCreateSchema, so a queued log arrives without a photo. The Server
 * Action passes the (optional) uploaded File through `photo`.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cropCycles, files, scoutingLogs } from "@/db/schema";
import { storage } from "@/adapters/storage";
import { writeAudit } from "@/lib/audit";
import { AuthError, DomainError } from "@/lib/errors";
import { assertGreenhouse, type Ctx } from "@/lib/guard";
import { newId } from "@/lib/ids";
import type { Role } from "@/lib/permissions";
import { safeFilename, scoutingPhotoKey, sniffImageType } from "./logic";
import { PHOTO_EXT, type ScoutingCreateInput } from "./schema";

/** /cycles/[id]/scouting/new is OMW (ARCHITECTURE §5); sync has no per-op roles. */
export const SCOUTING_ROLES: Role[] = ["owner", "manager", "worker"];

function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  if ((e as { code?: unknown }).code === "23505") return true;
  return (e as { cause?: { code?: string } }).cause?.code === "23505";
}

const emptyToNull = (s: string | undefined) =>
  s && s.length > 0 ? s : null;

export type LogScoutingResult = { id: string; duplicate: boolean };

/** Text fields + an optional photo (online Server Action path only). */
export type LogScoutingHandlerInput = ScoutingCreateInput & { photo?: File };

/**
 * Cycle must be ours, visible to the user and not closed; a replayed
 * clientId returns `{ duplicate: true }` with no side effects; the photo
 * (if any) is sniffed + stored before the transaction; insert with
 * id = clientId, audit.
 */
export async function logScoutingHandler(
  input: LogScoutingHandlerInput,
  ctx: Ctx,
): Promise<LogScoutingResult> {
  if (!SCOUTING_ROLES.includes(ctx.role)) throw new AuthError("FORBIDDEN");

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
      return { id: row.id, duplicate: false };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      // Concurrent replay won the race (DECISIONS §17 belt-and-braces).
      return { id: input.clientId, duplicate: true };
    }
    throw e;
  }
}
