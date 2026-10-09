/**
 * Sales handlers, plain module (NOT 'use server') per DECISIONS §17 so the
 * seed and the Phase-6 sync route can call exactly the code the Server
 * Actions do. No revalidatePath here — callers outside a Next request
 * (seed, sync batch) must not trip over it; actions.ts revalidates.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  counters,
  crops,
  customers,
  paymentsReceived,
  saleLines,
  sales,
  stores,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { todayLagos } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import { newId } from "@/lib/ids";
import { formatNaira, nairaToKobo } from "@/lib/money";
import { allocateSale } from "@/modules/produce/movements";
import { roundQty } from "@/modules/stock/logic";
import { formatInvoiceNumber, lineTotalKobo, saleStatusFor } from "./logic";
import {
  GRADE_LABELS,
  type PaymentCreateInput,
  type SaleCreateInput,
} from "./schema";

/** Produce can be sold from cold rooms and packhouses, never the input store. */
const PRODUCE_STORE_TYPES = ["cold_room", "packhouse"] as const;

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "cause" in e &&
    (e as { cause?: { code?: string } }).cause?.code === "23505"
  );
}

const emptyToNull = (s: string | undefined) => (s && s.length > 0 ? s : null);

/**
 * A Lagos calendar date as a movement/payment timestamp: now when it is
 * today, otherwise midday Lagos (UTC+1, no DST) on that date.
 */
function momentForLagosDate(date: string): Date | undefined {
  if (date === todayLagos()) return undefined;
  return new Date(`${date}T12:00:00+01:00`);
}

export interface CreateSaleResult {
  id: string;
  invoiceNumber: string;
  totalKobo: number;
}

/**
 * Post a sale in ONE transaction: bump the org's 'invoice' counter
 * (insert-on-missing upsert, value + 1 RETURNING) → INV-000123; insert the
 * sale + lines; FIFO-allocate each line through `allocateSale` (locks lots,
 * negative `sale` produce_movements tied to sale_line_id); set total_kobo;
 * one audit row. Any shortfall rolls the whole sale back.
 */
export async function createSaleHandler(
  input: SaleCreateInput,
  ctx: Ctx,
): Promise<CreateSaleResult> {
  if (input.saleDate > todayLagos()) {
    throw new DomainError("BAD_DATE", "The sale date cannot be in the future.");
  }
  try {
    return await db.transaction(async (tx) => {
      const customer = await tx.query.customers.findFirst({
        columns: { id: true, name: true },
        where: and(
          eq(customers.id, input.customerId),
          eq(customers.organisationId, ctx.orgId),
        ),
      });
      if (!customer) throw new DomainError("NOT_FOUND", "Customer not found.");

      const store = await tx.query.stores.findFirst({
        columns: { id: true, name: true, type: true },
        where: and(
          eq(stores.id, input.storeId),
          eq(stores.organisationId, ctx.orgId),
        ),
      });
      if (!store) throw new DomainError("NOT_FOUND", "Store not found.");
      if (
        !(PRODUCE_STORE_TYPES as readonly string[]).includes(store.type)
      ) {
        throw new DomainError(
          "BAD_STORE",
          "Produce is sold from a cold room or packhouse, not the input store.",
        );
      }

      const cropIds = [...new Set(input.lines.map((l) => l.cropId))];
      const cropRows = await tx
        .select({ id: crops.id, name: crops.name })
        .from(crops)
        .where(
          and(eq(crops.organisationId, ctx.orgId), inArray(crops.id, cropIds)),
        );
      const cropName = new Map(cropRows.map((c) => [c.id, c.name]));
      if (cropName.size !== cropIds.length) {
        throw new DomainError("NOT_FOUND", "Crop not found.");
      }

      const [counter] = await tx
        .insert(counters)
        .values({ organisationId: ctx.orgId, key: "invoice", value: 1 })
        .onConflictDoUpdate({
          target: [counters.organisationId, counters.key],
          set: { value: sql`${counters.value} + 1` },
        })
        .returning({ value: counters.value });
      const invoiceNumber = formatInvoiceNumber(counter.value);

      const saleId = input.clientId ?? newId();
      await tx.insert(sales).values({
        id: saleId,
        organisationId: ctx.orgId,
        customerId: customer.id,
        invoiceNumber,
        saleDate: input.saleDate,
        status: "unpaid",
        totalKobo: 0,
        amountPaidKobo: 0,
        notes: emptyToNull(input.notes),
        createdBy: ctx.userId,
      });

      const performedAt = momentForLagosDate(input.saleDate);
      let totalKobo = 0;
      const auditLines: {
        crop: string;
        grade: string;
        kg: number;
        crates: number | null;
        priceBasis: string;
        unitPriceKobo: number;
        lineTotalKobo: number;
        lots: { lotId: string; kg: number }[];
      }[] = [];

      for (const line of input.lines) {
        const kg = roundQty(line.kg);
        const crates = line.crates ? Math.round(line.crates * 100) / 100 : null;
        const unitPriceKobo = nairaToKobo(line.unitPrice);
        const total = lineTotalKobo({
          priceBasis: line.priceBasis,
          unitPriceKobo,
          kg,
          crates,
        });
        const lineId = newId();
        await tx.insert(saleLines).values({
          id: lineId,
          organisationId: ctx.orgId,
          saleId,
          cropId: line.cropId,
          grade: line.grade,
          kg: kg.toFixed(3),
          crates: crates === null ? null : crates.toFixed(2),
          priceBasis: line.priceBasis,
          unitPriceKobo,
          lineTotalKobo: total,
        });

        const label = `${cropName.get(line.cropId)} ${GRADE_LABELS[line.grade]}`;
        let allocations: { lotId: string; kg: number }[];
        try {
          ({ allocations } = await allocateSale(tx, ctx, {
            cropId: line.cropId,
            grade: line.grade,
            storeId: store.id,
            kg,
            saleLineId: lineId,
            performedAt,
          }));
        } catch (e) {
          if (e instanceof DomainError && e.code === "NO_STOCK") {
            throw new DomainError(
              "NO_STOCK",
              `No ${label} in ${store.name}.`,
            );
          }
          if (e instanceof DomainError && e.code === "INSUFFICIENT_STOCK") {
            throw new DomainError(
              "INSUFFICIENT_STOCK",
              `Not enough ${label} in ${store.name}: ${e.message}`,
            );
          }
          throw e;
        }

        totalKobo += total;
        auditLines.push({
          crop: cropName.get(line.cropId) ?? line.cropId,
          grade: line.grade,
          kg,
          crates,
          priceBasis: line.priceBasis,
          unitPriceKobo,
          lineTotalKobo: total,
          lots: allocations,
        });
      }

      const status = saleStatusFor(totalKobo, 0);
      await tx
        .update(sales)
        .set({ totalKobo, status })
        .where(and(eq(sales.id, saleId), eq(sales.organisationId, ctx.orgId)));

      await writeAudit(tx, ctx, {
        action: "sales.create",
        entityType: "sale",
        entityId: saleId,
        after: {
          invoiceNumber,
          customer: customer.name,
          saleDate: input.saleDate,
          store: store.name,
          totalKobo,
          lines: auditLines,
        },
      });

      return { id: saleId, invoiceNumber, totalKobo };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new DomainError("DUPLICATE", "This sale was already recorded.");
    }
    throw e;
  }
}

export interface RecordPaymentResult {
  id: string;
  saleId: string;
  amountPaidKobo: number;
  status: "unpaid" | "part_paid" | "paid";
}

/**
 * Record a payment against a sale: lock the sale FOR UPDATE, reject
 * over-payment (OVERPAY), insert payments_received, recompute
 * amount_paid_kobo + status in the same transaction, audit.
 */
export async function recordPaymentHandler(
  input: PaymentCreateInput,
  ctx: Ctx,
): Promise<RecordPaymentResult> {
  if (input.receivedDate > todayLagos()) {
    throw new DomainError(
      "BAD_DATE",
      "The payment date cannot be in the future.",
    );
  }
  const amountKobo = nairaToKobo(input.amount);
  if (amountKobo <= 0) {
    throw new DomainError("INVALID_MONEY", "The amount must be more than ₦0.");
  }

  return db.transaction(async (tx) => {
    const [sale] = await tx
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        saleDate: sales.saleDate,
        totalKobo: sales.totalKobo,
        amountPaidKobo: sales.amountPaidKobo,
        status: sales.status,
      })
      .from(sales)
      .where(and(eq(sales.id, input.saleId), eq(sales.organisationId, ctx.orgId)))
      .for("update");
    if (!sale) throw new DomainError("NOT_FOUND", "Sale not found.");
    if (input.receivedDate < sale.saleDate) {
      throw new DomainError(
        "BAD_DATE",
        "The payment date cannot be before the sale date.",
      );
    }

    const balance = sale.totalKobo - sale.amountPaidKobo;
    if (amountKobo > balance) {
      throw new DomainError(
        "OVERPAY",
        balance <= 0
          ? "This sale is already fully paid."
          : `That is more than the balance due (${formatNaira(balance)}).`,
      );
    }

    const paymentId = newId();
    const receivedAt = momentForLagosDate(input.receivedDate);
    await tx.insert(paymentsReceived).values({
      id: paymentId,
      organisationId: ctx.orgId,
      saleId: sale.id,
      amountKobo,
      method: input.method,
      ...(receivedAt ? { receivedAt } : {}),
      receivedBy: ctx.userId,
      notes: emptyToNull(input.notes),
    });

    const amountPaidKobo = sale.amountPaidKobo + amountKobo;
    const status = saleStatusFor(sale.totalKobo, amountPaidKobo);
    await tx
      .update(sales)
      .set({ amountPaidKobo, status })
      .where(and(eq(sales.id, sale.id), eq(sales.organisationId, ctx.orgId)));

    await writeAudit(tx, ctx, {
      action: "sales.recordPayment",
      entityType: "payment_received",
      entityId: paymentId,
      before: { amountPaidKobo: sale.amountPaidKobo, status: sale.status },
      after: {
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        amountKobo,
        method: input.method,
        receivedDate: input.receivedDate,
        amountPaidKobo,
        status,
      },
    });

    return { id: paymentId, saleId: sale.id, amountPaidKobo, status };
  });
}
