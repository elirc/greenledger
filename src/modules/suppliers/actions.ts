"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { supplierCreateSchema, supplierUpdateSchema } from "./schema";

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "cause" in e &&
    (e as { cause?: { code?: string } }).cause?.code === "23505"
  );
}

const emptyToNull = (s: string | undefined) =>
  s && s.length > 0 ? s : null;

export const createSupplier = defineAction({
  name: "suppliers.create",
  schema: supplierCreateSchema,
  roles: ["owner", "manager", "storekeeper"],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(suppliers)
          .values({
            organisationId: ctx.orgId,
            name: input.name,
            phone: emptyToNull(input.phone),
            email: emptyToNull(input.email),
            notes: emptyToNull(input.notes),
          })
          .returning({ id: suppliers.id });
        await writeAudit(tx, ctx, {
          action: "suppliers.create",
          entityType: "supplier",
          entityId: row.id,
          after: { name: input.name },
        });
        revalidatePath("/store/suppliers");
        return { id: row.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError(
          "DUPLICATE",
          "A supplier with this name already exists.",
        );
      }
      throw e;
    }
  },
});

export const updateSupplier = defineAction({
  name: "suppliers.update",
  schema: supplierUpdateSchema,
  roles: ["owner", "manager", "storekeeper"],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const before = await tx.query.suppliers.findFirst({
          where: and(
            eq(suppliers.id, input.id),
            eq(suppliers.organisationId, ctx.orgId),
          ),
        });
        if (!before) throw new DomainError("NOT_FOUND", "Supplier not found.");
        await tx
          .update(suppliers)
          .set({
            name: input.name,
            phone: emptyToNull(input.phone),
            email: emptyToNull(input.email),
            notes: emptyToNull(input.notes),
          })
          .where(
            and(
              eq(suppliers.id, input.id),
              eq(suppliers.organisationId, ctx.orgId),
            ),
          );
        await writeAudit(tx, ctx, {
          action: "suppliers.update",
          entityType: "supplier",
          entityId: input.id,
          before: { name: before.name, phone: before.phone, email: before.email },
          after: { name: input.name, phone: input.phone, email: input.email },
        });
        revalidatePath("/store/suppliers");
        return { id: input.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError(
          "DUPLICATE",
          "A supplier with this name already exists.",
        );
      }
      throw e;
    }
  },
});
