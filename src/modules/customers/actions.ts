"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, sales } from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { customerCreateSchema, customerUpdateSchema } from "./schema";

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

const DUPLICATE_MSG = "A customer with this name already exists.";

export const createCustomer = defineAction({
  name: "customers.create",
  schema: customerCreateSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(customers)
          .values({
            organisationId: ctx.orgId,
            name: input.name,
            phone: emptyToNull(input.phone),
            email: emptyToNull(input.email),
            notes: emptyToNull(input.notes),
          })
          .returning({ id: customers.id });
        await writeAudit(tx, ctx, {
          action: "customers.create",
          entityType: "customer",
          entityId: row.id,
          after: { name: input.name, phone: input.phone, email: input.email },
        });
        revalidatePath("/sales", "layout");
        return { id: row.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", DUPLICATE_MSG);
      throw e;
    }
  },
});

export const updateCustomer = defineAction({
  name: "customers.update",
  schema: customerUpdateSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const before = await tx.query.customers.findFirst({
          where: and(
            eq(customers.id, input.id),
            eq(customers.organisationId, ctx.orgId),
          ),
        });
        if (!before) throw new DomainError("NOT_FOUND", "Customer not found.");
        await tx
          .update(customers)
          .set({
            name: input.name,
            phone: emptyToNull(input.phone),
            email: emptyToNull(input.email),
            notes: emptyToNull(input.notes),
          })
          .where(
            and(
              eq(customers.id, input.id),
              eq(customers.organisationId, ctx.orgId),
            ),
          );
        await writeAudit(tx, ctx, {
          action: "customers.update",
          entityType: "customer",
          entityId: input.id,
          before: { name: before.name, phone: before.phone, email: before.email },
          after: { name: input.name, phone: input.phone, email: input.email },
        });
        revalidatePath("/sales", "layout");
        return { id: input.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", DUPLICATE_MSG);
      throw e;
    }
  },
});

/** Delete only customers without sales (sales FK is restrict; history stays). */
export const deleteCustomer = defineAction({
  name: "customers.delete",
  schema: z.object({ id: z.uuid() }),
  roles: ["owner", "manager"],
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(
          and(
            eq(customers.id, input.id),
            eq(customers.organisationId, ctx.orgId),
          ),
        )
        .for("update");
      if (!row) throw new DomainError("NOT_FOUND", "Customer not found.");
      const [{ n }] = await tx
        .select({ n: count() })
        .from(sales)
        .where(
          and(eq(sales.organisationId, ctx.orgId), eq(sales.customerId, row.id)),
        );
      if (n > 0) {
        throw new DomainError(
          "HAS_SALES",
          "This customer has sales and cannot be deleted.",
        );
      }
      await tx
        .delete(customers)
        .where(
          and(eq(customers.id, row.id), eq(customers.organisationId, ctx.orgId)),
        );
      await writeAudit(tx, ctx, {
        action: "customers.delete",
        entityType: "customer",
        entityId: row.id,
        before: { name: row.name },
      });
      revalidatePath("/sales", "layout");
      return { id: row.id };
    }),
});
