import { z } from "zod";

/**
 * Shared between the client forms (zodResolver) and the server actions.
 * Quantities are POSITIVE numbers in the item's base unit; the movement
 * type fixes the sign (movements.ts signedQty).
 */

const qty = z
  .number({ error: "Enter a quantity" })
  .positive("Quantity must be more than zero")
  .max(1_000_000_000, "Quantity is too large");

const reasonText = z
  .string()
  .trim()
  .min(3, "Give a short reason (3+ characters)")
  .max(500);

// ---------------------------------------------------------------- issue

export const issueStockSchema = z.object({
  /** Client UUID (offline sync hook) — becomes the first movement's id. */
  clientId: z.uuid(),
  itemId: z.uuid({ error: "Pick an item" }),
  storeId: z.uuid({ error: "Pick a store" }),
  /** Absent → FEFO auto-pick (earliest expiry first). */
  batchId: z.uuid().optional(),
  quantity: qty,
  greenhouseId: z.uuid().optional(),
  cropCycleId: z.uuid().optional(),
  /** Expired-batch issue. Owner/manager only. */
  override: z.object({ reason: reasonText }).optional(),
});
export type IssueStockInput = z.infer<typeof issueStockSchema>;

// ------------------------------------------------------------- transfer

export const transferStockSchema = z
  .object({
    itemId: z.uuid({ error: "Pick an item" }),
    fromStoreId: z.uuid({ error: "Pick the source store" }),
    toStoreId: z.uuid({ error: "Pick the destination store" }),
    /** Absent → earliest-expiry batch with stock in the source store. */
    batchId: z.uuid().optional(),
    quantity: qty,
    reason: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((v) => v.fromStoreId !== v.toStoreId, {
    error: "Choose a different store",
    path: ["toStoreId"],
  });
export type TransferStockInput = z.infer<typeof transferStockSchema>;

// -------------------------------------------------------------- returns

export const returnStockSchema = z.object({
  itemId: z.uuid({ error: "Pick an item" }),
  batchId: z.uuid({ error: "Pick the batch being returned" }),
  /** Store the stock goes back into. */
  storeId: z.uuid({ error: "Pick a store" }),
  /** Greenhouse the stock comes back from. */
  greenhouseId: z.uuid({ error: "Pick the greenhouse" }),
  cropCycleId: z.uuid().optional(),
  quantity: qty,
  reason: reasonText,
});
export type ReturnStockInput = z.infer<typeof returnStockSchema>;

// --------------------------------------------------------------- counts

export const createStockCountSchema = z.object({
  storeId: z.uuid({ error: "Pick a store" }),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type CreateStockCountInput = z.infer<typeof createStockCountSchema>;

export const stockCountLineSchema = z.object({
  batchId: z.uuid(),
  /** undefined = not counted yet (line is left out of the count). */
  countedQuantity: z
    .number()
    .min(0, "Counted quantity cannot be negative")
    .max(1_000_000_000)
    .optional(),
});

/** Save draft and Post share the same payload: the full sheet. */
export const saveStockCountSchema = z.object({
  id: z.uuid(),
  lines: z.array(stockCountLineSchema).max(5000),
});
export type SaveStockCountInput = z.infer<typeof saveStockCountSchema>;

export const postStockCountSchema = saveStockCountSchema;
export type PostStockCountInput = z.infer<typeof postStockCountSchema>;
