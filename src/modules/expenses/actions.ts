"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { cropCycles, expenses, greenhouses, sites } from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { todayLagos } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import { nairaToKobo } from "@/lib/money";
import type { Role } from "@/lib/permissions";
import {
  expenseCreateSchema,
  expenseIdSchema,
  expenseUpdateSchema,
  type ExpenseCreateInput,
} from "./schema";

/** Expenses are money: owner / manager only (ARCHITECTURE §5). */
const ROLES: Role[] = ["owner", "manager"];

const emptyToNull = (s: string | undefined) =>
  s && s.length > 0 ? s : null;

/**
 * Validate + normalise attribution. FKs don't check the organisation, so
 * every referenced row is verified as ours. A cycle implies its greenhouse,
 * a greenhouse implies its site; contradictions are rejected.
 */
async function resolveValues(tx: Tx, ctx: Ctx, input: ExpenseCreateInput) {
  if (input.incurredDate > todayLagos()) {
    throw new DomainError("BAD_DATE", "The date cannot be in the future.");
  }
  const amountKobo = nairaToKobo(input.amount);
  if (amountKobo <= 0) {
    throw new DomainError("INVALID_MONEY", "The amount must be more than ₦0.");
  }

  let siteId = emptyToNull(input.siteId);
  let greenhouseId = emptyToNull(input.greenhouseId);
  const cropCycleId = emptyToNull(input.cropCycleId);

  if (cropCycleId) {
    const [cycle] = await tx
      .select({ id: cropCycles.id, greenhouseId: cropCycles.greenhouseId })
      .from(cropCycles)
      .where(
        and(
          eq(cropCycles.id, cropCycleId),
          eq(cropCycles.organisationId, ctx.orgId),
        ),
      );
    if (!cycle) throw new DomainError("NOT_FOUND", "Crop cycle not found.");
    if (greenhouseId && greenhouseId !== cycle.greenhouseId) {
      throw new DomainError(
        "BAD_ATTRIBUTION",
        "That crop cycle is in a different greenhouse.",
      );
    }
    greenhouseId = cycle.greenhouseId;
  }
  if (greenhouseId) {
    const [gh] = await tx
      .select({ id: greenhouses.id, siteId: greenhouses.siteId })
      .from(greenhouses)
      .where(
        and(
          eq(greenhouses.id, greenhouseId),
          eq(greenhouses.organisationId, ctx.orgId),
        ),
      );
    if (!gh) throw new DomainError("NOT_FOUND", "Greenhouse not found.");
    if (siteId && siteId !== gh.siteId) {
      throw new DomainError(
        "BAD_ATTRIBUTION",
        "That greenhouse is on a different site.",
      );
    }
    siteId = gh.siteId;
  }
  if (siteId) {
    const [site] = await tx
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.organisationId, ctx.orgId)));
    if (!site) throw new DomainError("NOT_FOUND", "Site not found.");
  }

  return {
    category: input.category,
    amountKobo,
    incurredDate: input.incurredDate,
    siteId,
    greenhouseId,
    cropCycleId,
    description: emptyToNull(input.description),
  };
}

function revalidate() {
  revalidatePath("/expenses", "layout");
  revalidatePath("/reports", "layout");
}

export const createExpense = defineAction({
  name: "expenses.create",
  schema: expenseCreateSchema,
  roles: ROLES,
  handler: (input, ctx) =>
    db.transaction(async (tx) => {
      const values = await resolveValues(tx, ctx, input);
      const [row] = await tx
        .insert(expenses)
        .values({ organisationId: ctx.orgId, createdBy: ctx.userId, ...values })
        .returning({ id: expenses.id });
      await writeAudit(tx, ctx, {
        action: "expenses.create",
        entityType: "expense",
        entityId: row.id,
        after: values,
      });
      revalidate();
      return { id: row.id, month: values.incurredDate.slice(0, 7) };
    }),
});

export const updateExpense = defineAction({
  name: "expenses.update",
  schema: expenseUpdateSchema,
  roles: ROLES,
  handler: (input, ctx) =>
    db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(expenses)
        .where(
          and(eq(expenses.id, input.id), eq(expenses.organisationId, ctx.orgId)),
        )
        .for("update");
      if (!before) throw new DomainError("NOT_FOUND", "Expense not found.");
      const values = await resolveValues(tx, ctx, input);
      await tx
        .update(expenses)
        .set(values)
        .where(
          and(eq(expenses.id, input.id), eq(expenses.organisationId, ctx.orgId)),
        );
      await writeAudit(tx, ctx, {
        action: "expenses.update",
        entityType: "expense",
        entityId: input.id,
        before: {
          category: before.category,
          amountKobo: before.amountKobo,
          incurredDate: before.incurredDate,
          siteId: before.siteId,
          greenhouseId: before.greenhouseId,
          cropCycleId: before.cropCycleId,
          description: before.description,
        },
        after: values,
      });
      revalidate();
      return { id: input.id, month: values.incurredDate.slice(0, 7) };
    }),
});

/** Hard delete (expenses have no dependants); the audit row keeps the record. */
export const deleteExpense = defineAction({
  name: "expenses.delete",
  schema: expenseIdSchema,
  roles: ROLES,
  handler: (input, ctx) =>
    db.transaction(async (tx) => {
      const [before] = await tx
        .delete(expenses)
        .where(
          and(eq(expenses.id, input.id), eq(expenses.organisationId, ctx.orgId)),
        )
        .returning();
      if (!before) throw new DomainError("NOT_FOUND", "Expense not found.");
      await writeAudit(tx, ctx, {
        action: "expenses.delete",
        entityType: "expense",
        entityId: input.id,
        before: {
          category: before.category,
          amountKobo: before.amountKobo,
          incurredDate: before.incurredDate,
          siteId: before.siteId,
          greenhouseId: before.greenhouseId,
          cropCycleId: before.cropCycleId,
          description: before.description,
        },
      });
      revalidate();
      return { id: input.id, month: before.incurredDate.slice(0, 7) };
    }),
});
