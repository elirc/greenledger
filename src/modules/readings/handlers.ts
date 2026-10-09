/**
 * Climate-reading handler, plain module (NOT 'use server') per DECISIONS §17
 * so the /api/sync route ("reading.create") and the seed can call the same
 * code the Server Action does. No revalidatePath here.
 */

import { and, eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { climateReadings, greenhouses } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { AuthError, DomainError } from "@/lib/errors";
import { assertGreenhouse, type Ctx } from "@/lib/guard";
import type { Role } from "@/lib/permissions";
import { lagosLocalToDate } from "@/modules/applications/schema";
import type { ReadingCreateInput } from "./schema";

/** /readings is OMW (ARCHITECTURE §5). The sync route has no per-op roles. */
export const READING_ROLES: Role[] = ["owner", "manager", "worker"];

/** Allow small clock skew between the phone and the server. */
const FUTURE_SKEW_MS = 10 * 60_000;

function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  if ((e as { code?: unknown }).code === "23505") return true;
  return (e as { cause?: { code?: string } }).cause?.code === "23505";
}

/** numeric columns take strings; undefined → NULL. */
const num = (v: number | undefined) => (v === undefined ? null : String(v));

/**
 * Inside the caller's transaction: role + assigned-greenhouse checks, the
 * greenhouse must be ours and active, time not in the future; insert with
 * id = clientId (replay → 23505), audit.
 */
export async function recordReading(
  tx: Tx,
  ctx: Ctx,
  input: ReadingCreateInput,
): Promise<{ id: string; greenhouseId: string; recordedAt: string }> {
  if (!READING_ROLES.includes(ctx.role)) throw new AuthError("FORBIDDEN");
  assertGreenhouse(ctx, input.greenhouseId);

  const recordedAt = lagosLocalToDate(input.recordedAt);
  if (!recordedAt) {
    throw new DomainError("BAD_DATE", "Enter a valid date and time.");
  }
  if (recordedAt.getTime() > Date.now() + FUTURE_SKEW_MS) {
    throw new DomainError("BAD_DATE", "The reading time cannot be in the future.");
  }
  const values = {
    temperatureC: num(input.temperatureC),
    humidityPct: num(input.humidityPct),
    ecMsCm: num(input.ecMsCm),
    ph: num(input.ph),
  };
  if (Object.values(values).every((v) => v === null)) {
    throw new DomainError("NO_READINGS", "Enter at least one reading.");
  }

  const [gh] = await tx
    .select({ id: greenhouses.id, isActive: greenhouses.isActive })
    .from(greenhouses)
    .where(
      and(
        eq(greenhouses.id, input.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    );
  if (!gh) throw new DomainError("NOT_FOUND", "Greenhouse not found.");
  if (!gh.isActive) {
    throw new DomainError("INACTIVE", "This greenhouse is no longer active.");
  }

  await tx.insert(climateReadings).values({
    id: input.clientId,
    organisationId: ctx.orgId,
    greenhouseId: input.greenhouseId,
    recordedAt,
    ...values,
    recordedBy: ctx.userId,
  });

  await writeAudit(tx, ctx, {
    action: "readings.create",
    entityType: "climate_reading",
    entityId: input.clientId,
    after: {
      greenhouseId: input.greenhouseId,
      recordedAt: recordedAt.toISOString(),
      ...values,
    },
  });

  return {
    id: input.clientId,
    greenhouseId: input.greenhouseId,
    recordedAt: recordedAt.toISOString(),
  };
}

/** (input, ctx) handler: own transaction + replay → DUPLICATE mapping. */
export async function createReadingHandler(
  input: ReadingCreateInput,
  ctx: Ctx,
): Promise<{ id: string; greenhouseId: string; recordedAt: string }> {
  try {
    return await db.transaction((tx) => recordReading(tx, ctx, input));
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new DomainError("DUPLICATE", "This reading was already recorded.");
    }
    throw e;
  }
}
