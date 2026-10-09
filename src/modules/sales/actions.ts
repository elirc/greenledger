"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/action";
import { createSaleHandler, recordPaymentHandler } from "./handlers";
import { paymentCreateSchema, saleCreateSchema } from "./schema";

/** Post a sale (FIFO lot allocation + invoice number) — owner/manager only. */
export const createSale = defineAction({
  name: "sales.create",
  schema: saleCreateSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) => {
    const result = await createSaleHandler(input, ctx);
    revalidatePath("/sales", "layout");
    revalidatePath("/produce");
    return result;
  },
});

/** Record a payment received against a sale — owner/manager only. */
export const recordPayment = defineAction({
  name: "sales.recordPayment",
  schema: paymentCreateSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) => {
    const result = await recordPaymentHandler(input, ctx);
    revalidatePath("/sales", "layout");
    return result;
  },
});
