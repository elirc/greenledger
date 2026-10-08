import { relations } from "drizzle-orm";
import {
  inventoryMovements,
  itemBatches,
  items,
  receiptLines,
  receipts,
} from "./inventory";
import { cropCycles, plantLosses, scoutingLogs } from "./nursery";
import { applicationItems, applications, recipeLines, recipes } from "./applications";
import { harvestLines, harvests, produceLots, produceMovements } from "./produce";
import { paymentsReceived, saleLines, sales, customers } from "./sales";
import { greenhouses, zones } from "./farm";
import { varieties, crops } from "./crops";

export const itemsRelations = relations(items, ({ many }) => ({
  batches: many(itemBatches),
  movements: many(inventoryMovements),
}));

export const itemBatchesRelations = relations(itemBatches, ({ one, many }) => ({
  item: one(items, { fields: [itemBatches.itemId], references: [items.id] }),
  movements: many(inventoryMovements),
}));

export const inventoryMovementsRelations = relations(
  inventoryMovements,
  ({ one }) => ({
    item: one(items, {
      fields: [inventoryMovements.itemId],
      references: [items.id],
    }),
    batch: one(itemBatches, {
      fields: [inventoryMovements.itemBatchId],
      references: [itemBatches.id],
    }),
    cropCycle: one(cropCycles, {
      fields: [inventoryMovements.cropCycleId],
      references: [cropCycles.id],
    }),
    application: one(applications, {
      fields: [inventoryMovements.applicationId],
      references: [applications.id],
    }),
  }),
);

export const receiptsRelations = relations(receipts, ({ many }) => ({
  lines: many(receiptLines),
}));

export const receiptLinesRelations = relations(receiptLines, ({ one }) => ({
  receipt: one(receipts, {
    fields: [receiptLines.receiptId],
    references: [receipts.id],
  }),
  item: one(items, { fields: [receiptLines.itemId], references: [items.id] }),
  batch: one(itemBatches, {
    fields: [receiptLines.itemBatchId],
    references: [itemBatches.id],
  }),
}));

export const cropCyclesRelations = relations(cropCycles, ({ one, many }) => ({
  greenhouse: one(greenhouses, {
    fields: [cropCycles.greenhouseId],
    references: [greenhouses.id],
  }),
  zone: one(zones, { fields: [cropCycles.zoneId], references: [zones.id] }),
  variety: one(varieties, {
    fields: [cropCycles.varietyId],
    references: [varieties.id],
  }),
  losses: many(plantLosses),
  scoutingLogs: many(scoutingLogs),
  applications: many(applications),
  harvests: many(harvests),
}));

export const plantLossesRelations = relations(plantLosses, ({ one }) => ({
  cropCycle: one(cropCycles, {
    fields: [plantLosses.cropCycleId],
    references: [cropCycles.id],
  }),
}));

export const scoutingLogsRelations = relations(scoutingLogs, ({ one }) => ({
  cropCycle: one(cropCycles, {
    fields: [scoutingLogs.cropCycleId],
    references: [cropCycles.id],
  }),
}));

export const varietiesRelations = relations(varieties, ({ one, many }) => ({
  crop: one(crops, { fields: [varieties.cropId], references: [crops.id] }),
  cycles: many(cropCycles),
}));

export const recipesRelations = relations(recipes, ({ many }) => ({
  lines: many(recipeLines),
  applications: many(applications),
}));

export const recipeLinesRelations = relations(recipeLines, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeLines.recipeId],
    references: [recipes.id],
  }),
  item: one(items, { fields: [recipeLines.itemId], references: [items.id] }),
}));

export const applicationsRelations = relations(
  applications,
  ({ one, many }) => ({
    greenhouse: one(greenhouses, {
      fields: [applications.greenhouseId],
      references: [greenhouses.id],
    }),
    cropCycle: one(cropCycles, {
      fields: [applications.cropCycleId],
      references: [cropCycles.id],
    }),
    recipe: one(recipes, {
      fields: [applications.recipeId],
      references: [recipes.id],
    }),
    items: many(applicationItems),
    movements: many(inventoryMovements),
  }),
);

export const applicationItemsRelations = relations(
  applicationItems,
  ({ one }) => ({
    application: one(applications, {
      fields: [applicationItems.applicationId],
      references: [applications.id],
    }),
    item: one(items, {
      fields: [applicationItems.itemId],
      references: [items.id],
    }),
    batch: one(itemBatches, {
      fields: [applicationItems.itemBatchId],
      references: [itemBatches.id],
    }),
  }),
);

export const harvestsRelations = relations(harvests, ({ one, many }) => ({
  cropCycle: one(cropCycles, {
    fields: [harvests.cropCycleId],
    references: [cropCycles.id],
  }),
  greenhouse: one(greenhouses, {
    fields: [harvests.greenhouseId],
    references: [greenhouses.id],
  }),
  lines: many(harvestLines),
  lots: many(produceLots),
}));

export const harvestLinesRelations = relations(harvestLines, ({ one }) => ({
  harvest: one(harvests, {
    fields: [harvestLines.harvestId],
    references: [harvests.id],
  }),
}));

export const produceLotsRelations = relations(produceLots, ({ one, many }) => ({
  harvest: one(harvests, {
    fields: [produceLots.harvestId],
    references: [harvests.id],
  }),
  crop: one(crops, { fields: [produceLots.cropId], references: [crops.id] }),
  variety: one(varieties, {
    fields: [produceLots.varietyId],
    references: [varieties.id],
  }),
  movements: many(produceMovements),
}));

export const produceMovementsRelations = relations(
  produceMovements,
  ({ one }) => ({
    lot: one(produceLots, {
      fields: [produceMovements.produceLotId],
      references: [produceLots.id],
    }),
    saleLine: one(saleLines, {
      fields: [produceMovements.saleLineId],
      references: [saleLines.id],
    }),
  }),
);

export const customersRelations = relations(customers, ({ many }) => ({
  sales: many(sales),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, {
    fields: [sales.customerId],
    references: [customers.id],
  }),
  lines: many(saleLines),
  payments: many(paymentsReceived),
}));

export const saleLinesRelations = relations(saleLines, ({ one, many }) => ({
  sale: one(sales, { fields: [saleLines.saleId], references: [sales.id] }),
  produceMovements: many(produceMovements),
}));

export const paymentsReceivedRelations = relations(
  paymentsReceived,
  ({ one }) => ({
    sale: one(sales, {
      fields: [paymentsReceived.saleId],
      references: [sales.id],
    }),
  }),
);
