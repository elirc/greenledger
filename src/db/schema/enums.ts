import { pgEnum } from "drizzle-orm/pg-core";

export const baseUnitEnum = pgEnum("base_unit", ["kg", "g", "l", "ml", "pcs"]);

export const itemCategoryEnum = pgEnum("item_category", [
  "seed",
  "growing_media",
  "fertiliser",
  "agrochemical",
  "packaging",
  "consumable",
  "spare_part",
]);

export const greenhouseTypeEnum = pgEnum("greenhouse_type", [
  "greenhouse",
  "net_house",
  "shade_house",
  "open_field",
]);

export const storeTypeEnum = pgEnum("store_type", [
  "input_store",
  "cold_room",
  "packhouse",
]);

export const cycleStatusEnum = pgEnum("cycle_status", [
  "planned",
  "nursery",
  "growing",
  "harvesting",
  "closed",
]);

export const nurseryBatchStatusEnum = pgEnum("nursery_batch_status", [
  "open",
  "transplanted",
  "discarded",
]);

export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", [
  "receive",
  "issue",
  "transfer_in",
  "transfer_out",
  "adjustment",
  "return",
]);

export const produceMovementTypeEnum = pgEnum("produce_movement_type", [
  "harvest_in",
  "transfer_in",
  "transfer_out",
  "sale",
  "waste",
  "adjustment",
]);

export const applicationTypeEnum = pgEnum("application_type", [
  "fertigation",
  "spray",
]);

export const produceGradeEnum = pgEnum("produce_grade", [
  "a",
  "b",
  "c",
  "reject",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "open",
  "in_progress",
  "done",
  "cancelled",
]);

export const saleStatusEnum = pgEnum("sale_status", [
  "unpaid",
  "part_paid",
  "paid",
]);

export const scoutingSeverityEnum = pgEnum("scouting_severity", [
  "low",
  "medium",
  "high",
]);

export const expenseCategoryEnum = pgEnum("expense_category", [
  "labour",
  "power",
  "water",
  "repairs",
  "transport",
  "other",
]);

export const equipmentStatusEnum = pgEnum("equipment_status", [
  "operational",
  "needs_service",
  "broken",
  "retired",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
]);

export const stockCountStatusEnum = pgEnum("stock_count_status", [
  "draft",
  "posted",
]);
