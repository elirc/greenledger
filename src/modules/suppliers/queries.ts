import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import type { Ctx } from "@/lib/guard";

/** Every query takes ctx and filters by ctx.orgId — no exceptions. */
export async function listSuppliers(ctx: Ctx) {
  return db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      phone: suppliers.phone,
      email: suppliers.email,
      notes: suppliers.notes,
      createdAt: suppliers.createdAt,
    })
    .from(suppliers)
    .where(eq(suppliers.organisationId, ctx.orgId))
    .orderBy(asc(suppliers.name));
}

export async function getSupplier(ctx: Ctx, id: string) {
  const row = await db.query.suppliers.findFirst({
    where: and(eq(suppliers.id, id), eq(suppliers.organisationId, ctx.orgId)),
  });
  return row ?? null;
}
