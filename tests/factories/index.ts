import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import {
  crops,
  greenhouseAssignments,
  greenhouses,
  inventoryMovements,
  itemBatches,
  items,
  member,
  organization,
  plans,
  receiptLines,
  receipts,
  sites,
  stores,
  subscriptions,
  suppliers,
  user,
  varieties,
  zones,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { ROLES, type Role } from "@/lib/permissions";
import type { Ctx } from "@/lib/guard";
import { makeCtx } from "../helpers/ctx";

/** Any drizzle client over our schema (getTestDb() or the app `db`). */
export type FactoryDb = NodePgDatabase<typeof schema>;

export interface TestOrgUser {
  id: string;
  memberId: string;
  name: string;
  email: string;
  phoneNumber: string;
}

export interface TestOrg {
  orgId: string;
  name: string;
  slug: string;
  planId: string;
  subscriptionId: string;
  siteId: string;
  /** [GH1, GH2] */
  greenhouseIds: string[];
  /** two zones (A, B) per greenhouse, in greenhouse order */
  zoneIds: string[];
  /** [Input Store (default), Cold Room, Packhouse] */
  storeIds: string[];
  /** the worker is assigned to greenhouseIds[0] only */
  assignmentIds: string[];
  cropId: string;
  varietyId: string;
  supplierId: string;
  /** null when created with `inventory: false` */
  itemId: string | null;
  batchId: string | null;
  receiptId: string | null;
  users: Record<Role, TestOrgUser>;
  /** Ready-made request contexts, one per role. */
  ctx: Record<Role, Ctx>;
  /** Every id this factory created for the org (for leak scans). */
  allIds: string[];
}

let seq = 0;

/** The `growth` plan, created once per test DB (plans are global). */
async function ensurePlan(db: FactoryDb): Promise<string> {
  const existing = await db.query.plans.findFirst({
    where: (p, { eq }) => eq(p.code, "growth"),
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(plans)
    .values({
      code: "growth",
      name: "Growth",
      maxGreenhouses: 20,
      monthlyPriceKobo: 60_000_00,
    })
    .onConflictDoNothing({ target: plans.code })
    .returning({ id: plans.id });
  if (row) return row.id;
  const again = await db.query.plans.findFirst({
    where: (p, { eq }) => eq(p.code, "growth"),
  });
  if (!again) throw new Error("factory: could not create growth plan");
  return again.id;
}

/**
 * Create a complete, isolated tenant: org + active subscription + site +
 * 2 greenhouses (zones A/B) + 3 stores + one user/member per role.
 * Pure DB inserts — no Better Auth API, no password hashes.
 * Every name that is globally unique (slug, email, phone) gets a unique tag,
 * so this can be called many times against one DB.
 */
export async function createTestOrg(
  db: FactoryDb,
  opts: {
    name: string;
    /**
     * Create the baseline crop/supplier/item/batch/receipt + one receive
     * movement (default true). Tests that sweep ALL movements of the org
     * (e.g. the stock invariant) pass false.
     */
    inventory?: boolean;
  },
): Promise<TestOrg> {
  seq += 1;
  const tag = `${Date.now().toString(36)}${seq}${newId().slice(0, 6)}`;
  const now = new Date();
  const orgId = newId();
  const slug = `${opts.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${tag}`;

  await db.insert(organization).values({
    id: orgId,
    name: opts.name,
    slug,
    createdAt: now,
  });

  const planId = await ensurePlan(db);
  const [sub] = await db
    .insert(subscriptions)
    .values({
      organisationId: orgId,
      planId,
      status: "active",
      trialEndsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    })
    .returning({ id: subscriptions.id });

  const [site] = await db
    .insert(sites)
    .values({ organisationId: orgId, name: `${opts.name} Site` })
    .returning({ id: sites.id });

  const ghRows = await db
    .insert(greenhouses)
    .values(
      ["GH1", "GH2"].map((name) => ({
        organisationId: orgId,
        siteId: site.id,
        name,
        type: "greenhouse" as const,
        areaM2: "480.00",
        plantCapacity: 1100,
      })),
    )
    .returning({ id: greenhouses.id });
  const greenhouseIds = ghRows.map((g) => g.id);

  const zoneRows = await db
    .insert(zones)
    .values(
      greenhouseIds.flatMap((greenhouseId) =>
        ["A", "B"].map((name, position) => ({
          organisationId: orgId,
          greenhouseId,
          name,
          position,
        })),
      ),
    )
    .returning({ id: zones.id });

  const storeRows = await db
    .insert(stores)
    .values([
      { organisationId: orgId, siteId: site.id, name: "Input Store", type: "input_store" as const, isDefault: true },
      { organisationId: orgId, siteId: site.id, name: "Cold Room", type: "cold_room" as const, isDefault: false },
      { organisationId: orgId, siteId: site.id, name: "Packhouse", type: "packhouse" as const, isDefault: false },
    ])
    .returning({ id: stores.id });
  const storeIds = storeRows.map((s) => s.id);

  const users = {} as Record<Role, TestOrgUser>;
  for (const [i, role] of ROLES.entries()) {
    const id = newId();
    const memberId = newId();
    const u: TestOrgUser = {
      id,
      memberId,
      name: `${opts.name} ${role}`,
      email: `${role}.${tag}@test.greenledger.local`,
      // +234 9 + 9 digits, unique per call
      phoneNumber: `+2349${String((Date.now() + seq * 10 + i) % 1_000_000_000).padStart(9, "0")}`,
    };
    await db.insert(user).values({
      id,
      name: u.name,
      email: u.email,
      emailVerified: true,
      phoneNumber: u.phoneNumber,
      phoneNumberVerified: true,
      isPlatformAdmin: false,
    });
    await db.insert(member).values({
      id: memberId,
      organizationId: orgId,
      userId: id,
      role,
      createdAt: new Date(now.getTime() + i * 1000),
    });
    users[role] = u;
  }

  const assignRows = await db
    .insert(greenhouseAssignments)
    .values({
      organisationId: orgId,
      userId: users.worker.id,
      greenhouseId: greenhouseIds[0],
    })
    .returning({ id: greenhouseAssignments.id });
  const assignmentIds = assignRows.map((a) => a.id);

  // Minimal inventory + crop data so list queries have rows per org
  // (tenancy positive controls, redaction probes).
  const withInventory = opts.inventory !== false;
  const [crop] = await db
    .insert(crops)
    .values({ organisationId: orgId, name: "Tomato", shelfLifeDays: 7 })
    .returning({ id: crops.id });
  const [variety] = await db
    .insert(varieties)
    .values({
      organisationId: orgId,
      cropId: crop.id,
      name: `Padma F1 ${tag}`,
      daysToFirstHarvest: 75,
      harvestDurationWeeks: 10,
      expectedYieldKgPerPlant: "4.50",
    })
    .returning({ id: varieties.id });
  const [supplier] = await db
    .insert(suppliers)
    .values({ organisationId: orgId, name: `AgroSupplier ${tag}` })
    .returning({ id: suppliers.id });

  let itemId: string | null = null;
  let batchId: string | null = null;
  let receiptId: string | null = null;
  let receiptLineId: string | null = null;
  if (withInventory) {
    const [item] = await db
      .insert(items)
      .values({
        organisationId: orgId,
        name: `NPK 20-20-20 ${tag}`,
        category: "fertiliser",
        baseUnit: "kg",
        reorderLevel: "50.000",
        nPct: "20.00",
        pPct: "20.00",
        kPct: "20.00",
      })
      .returning({ id: items.id });
    const [batch] = await db
      .insert(itemBatches)
      .values({
        organisationId: orgId,
        itemId: item.id,
        supplierId: supplier.id,
        batchNumber: `B-${tag}`,
        expiryDate: "2030-01-01",
        unitCostKobo: "150000.000000", // ₦1,500/kg
      })
      .returning({ id: itemBatches.id });
    const [receipt] = await db
      .insert(receipts)
      .values({
        organisationId: orgId,
        supplierId: supplier.id,
        storeId: storeIds[0],
        receivedBy: users.storekeeper.id,
        totalCostKobo: 15_000_000,
      })
      .returning({ id: receipts.id });
    const [receiptLine] = await db
      .insert(receiptLines)
      .values({
        organisationId: orgId,
        receiptId: receipt.id,
        itemId: item.id,
        itemBatchId: batch.id,
        quantity: "100.000",
        unitCostKobo: "150000.000000",
        lineCostKobo: 15_000_000,
      })
      .returning({ id: receiptLines.id });
    await db.insert(inventoryMovements).values({
      organisationId: orgId,
      itemId: item.id,
      itemBatchId: batch.id,
      storeId: storeIds[0],
      type: "receive",
      quantity: "100.000",
      receiptLineId: receiptLine.id,
      performedBy: users.storekeeper.id,
    });
    itemId = item.id;
    batchId = batch.id;
    receiptId = receipt.id;
    receiptLineId = receiptLine.id;
  }

  const ctx = {} as Record<Role, Ctx>;
  for (const role of ROLES) {
    const u = users[role];
    ctx[role] = makeCtx({
      role,
      orgId,
      userId: u.id,
      user: { name: u.name, phoneNumber: u.phoneNumber, isPlatformAdmin: false },
      org: { name: opts.name, status: "active" },
      assignedGreenhouseIds: role === "worker" ? [greenhouseIds[0]] : null,
    });
  }

  const allIds = [
    orgId,
    sub.id,
    site.id,
    ...greenhouseIds,
    ...zoneRows.map((z) => z.id),
    ...storeIds,
    ...assignmentIds,
    crop.id,
    variety.id,
    supplier.id,
    ...[itemId, batchId, receiptId, receiptLineId].filter(
      (x): x is string => x !== null,
    ),
    ...ROLES.flatMap((r) => [users[r].id, users[r].memberId]),
  ];

  return {
    orgId,
    name: opts.name,
    slug,
    planId,
    subscriptionId: sub.id,
    siteId: site.id,
    greenhouseIds,
    zoneIds: zoneRows.map((z) => z.id),
    storeIds,
    assignmentIds,
    cropId: crop.id,
    varietyId: variety.id,
    supplierId: supplier.id,
    itemId,
    batchId,
    receiptId,
    users,
    ctx,
    allIds,
  };
}
