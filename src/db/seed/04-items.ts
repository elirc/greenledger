import { itemBatches, items, receiptLines, receipts, suppliers } from "../schema";
import type { Ctx } from "../../lib/guard";
import { writeAudit } from "../../lib/audit";
import { addDays, lagosDateOf } from "../../lib/dates";
import { rateTimesQty } from "../../lib/money";
import { postMovement } from "../../modules/stock/movements";
import { DEMO_ORG, DEMO_USERS } from "./02-org";
import { bump, type SeedState, type SeedStep } from "./state";

/**
 * Phase 2 seed: suppliers, the 40-item catalogue, ~70 batches with staggered
 * expiries and ~25 receipts whose stock arrives through the real movement
 * engine (`postMovement` type 'receive') — never raw movement inserts.
 *
 * Fully deterministic: no RNG; every date is derived from `state.now`.
 * Expiry mix (relative to seed day): 2 expired WITH stock, several < 30 d,
 * several 30-60 d, the rest later or none.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type SupplierKey = "chem" | "fert" | "seed" | "hardware";

export const DEMO_SUPPLIERS: ReadonlyArray<{
  key: SupplierKey;
  code: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
}> = [
  {
    key: "chem",
    code: "AAC",
    name: "Agro-Allied Chemicals Ltd",
    phone: "+2348031110001",
    email: "sales@agroallied.example",
    notes: "Crop protection. Ikeja depot; delivers Tue/Fri.",
  },
  {
    key: "fert",
    code: "GFN",
    name: "Greenfield Fertilisers Nigeria",
    phone: "+2348031110002",
    email: "orders@greenfield.example",
    notes: "Water-soluble fertilisers, 25 kg bags.",
  },
  {
    key: "seed",
    code: "SLN",
    name: "Seedline Nigeria Ltd",
    phone: "+2348031110003",
    email: "hello@seedline.example",
    notes: "Hybrid seed and growing media.",
  },
  {
    key: "hardware",
    code: "FHS",
    name: "FarmHub Supplies (Abeokuta)",
    phone: "+2348031110004",
    email: "farmhub@abeokuta.example",
    notes: "Crates, packaging, drip spares and consumables.",
  },
];

type Category = (typeof items.$inferInsert)["category"];
type BaseUnit = (typeof items.$inferInsert)["baseUnit"];

interface ItemSpec {
  code: string;
  name: string;
  category: Category;
  baseUnit: BaseUnit;
  reorderLevel: number;
  supplier: SupplierKey;
  /** Batches to receive (1-3). */
  batches: 1 | 2 | 3;
  /** Quantity per batch, base units. */
  qty: number;
  /** Price in naira per base unit (generation k adds 3% × k). */
  naira: number;
  /** false → batches have no expiry date. */
  expires: boolean;
  activeIngredient?: string;
  phiDays?: number;
  reiHours?: number;
  npk?: [number, number, number];
  notes?: string;
}

/** 40 items across all 7 categories (DATA-MODEL §6). */
export const DEMO_ITEMS: ReadonlyArray<ItemSpec> = [
  // ── Agrochemicals (8) — label PHI/REI values ─────────────────────────
  { code: "LCH", name: "Lambda-cyhalothrin 2.5% EC", category: "agrochemical", baseUnit: "l", reorderLevel: 2, supplier: "chem", batches: 3, qty: 4, naira: 9500, expires: true, activeIngredient: "lambda-cyhalothrin", phiDays: 7, reiHours: 24 },
  { code: "MCZ", name: "Mancozeb 80% WP", category: "agrochemical", baseUnit: "kg", reorderLevel: 5, supplier: "chem", batches: 3, qty: 10, naira: 4200, expires: true, activeIngredient: "mancozeb", phiDays: 7, reiHours: 24 },
  { code: "ABM", name: "Abamectin 1.8% EC", category: "agrochemical", baseUnit: "l", reorderLevel: 1, supplier: "chem", batches: 2, qty: 2, naira: 14000, expires: true, activeIngredient: "abamectin", phiDays: 7, reiHours: 12 },
  { code: "COX", name: "Copper Oxychloride 50% WP", category: "agrochemical", baseUnit: "kg", reorderLevel: 3, supplier: "chem", batches: 2, qty: 5, naira: 6800, expires: true, activeIngredient: "copper oxychloride", phiDays: 3, reiHours: 24 },
  { code: "IMD", name: "Imidacloprid 200 SL", category: "agrochemical", baseUnit: "l", reorderLevel: 1, supplier: "chem", batches: 2, qty: 2, naira: 12500, expires: true, activeIngredient: "imidacloprid", phiDays: 14, reiHours: 12 },
  { code: "SUL", name: "Wettable Sulphur 80% WG", category: "agrochemical", baseUnit: "kg", reorderLevel: 3, supplier: "chem", batches: 2, qty: 10, naira: 3100, expires: true, activeIngredient: "sulphur", phiDays: 1, reiHours: 24 },
  { code: "EMB", name: "Emamectin Benzoate 5% WG", category: "agrochemical", baseUnit: "kg", reorderLevel: 2, supplier: "chem", batches: 2, qty: 0.5, naira: 38000, expires: true, activeIngredient: "emamectin benzoate", phiDays: 3, reiHours: 12, notes: "Tuta absoluta rotation partner." },
  { code: "MTX", name: "Metalaxyl-M + Mancozeb 68% WG", category: "agrochemical", baseUnit: "kg", reorderLevel: 2, supplier: "chem", batches: 2, qty: 3, naira: 9800, expires: true, activeIngredient: "metalaxyl-M + mancozeb", phiDays: 7, reiHours: 24 },

  // ── Fertilisers (10) — N-P-K % ─────────────────────────────────────
  { code: "CAN", name: "Calcium Nitrate (CalNit) 15.5-0-0", category: "fertiliser", baseUnit: "kg", reorderLevel: 50, supplier: "fert", batches: 2, qty: 150, naira: 1450, expires: true, npk: [15.5, 0, 0] },
  { code: "MKP", name: "Monopotassium Phosphate (MKP) 0-52-34", category: "fertiliser", baseUnit: "kg", reorderLevel: 25, supplier: "fert", batches: 2, qty: 50, naira: 3200, expires: true, npk: [0, 52, 34] },
  { code: "NPK20", name: "NPK 20-20-20 Soluble", category: "fertiliser", baseUnit: "kg", reorderLevel: 50, supplier: "fert", batches: 2, qty: 100, naira: 1800, expires: true, npk: [20, 20, 20] },
  { code: "URE", name: "Urea 46-0-0", category: "fertiliser", baseUnit: "kg", reorderLevel: 50, supplier: "fert", batches: 2, qty: 100, naira: 850, expires: true, npk: [46, 0, 0] },
  { code: "KNO", name: "Potassium Nitrate 13-0-46", category: "fertiliser", baseUnit: "kg", reorderLevel: 50, supplier: "fert", batches: 2, qty: 100, naira: 2100, expires: true, npk: [13, 0, 46] },
  { code: "MAP", name: "Monoammonium Phosphate (MAP) 12-61-0", category: "fertiliser", baseUnit: "kg", reorderLevel: 25, supplier: "fert", batches: 2, qty: 50, naira: 2600, expires: true, npk: [12, 61, 0] },
  { code: "SOP", name: "Potassium Sulphate (SOP) 0-0-50", category: "fertiliser", baseUnit: "kg", reorderLevel: 25, supplier: "fert", batches: 2, qty: 75, naira: 1900, expires: true, npk: [0, 0, 50] },
  { code: "NPK15", name: "NPK 15-15-15 Granular", category: "fertiliser", baseUnit: "kg", reorderLevel: 100, supplier: "fert", batches: 2, qty: 200, naira: 700, expires: true, npk: [15, 15, 15] },
  { code: "MGS", name: "Magnesium Sulphate (Epsom salt)", category: "fertiliser", baseUnit: "kg", reorderLevel: 25, supplier: "fert", batches: 2, qty: 50, naira: 900, expires: true, npk: [0, 0, 0], notes: "MgO 16%, S 13%." },
  { code: "FEC", name: "Iron Chelate EDDHA 6%", category: "fertiliser", baseUnit: "kg", reorderLevel: 2, supplier: "fert", batches: 2, qty: 1, naira: 11000, expires: true, npk: [0, 0, 0], notes: "Micronutrient — Fe 6%." },

  // ── Seeds (6) ──────────────────────────────────────────────────────
  { code: "SPAD", name: "Tomato seed — Padma F1", category: "seed", baseUnit: "pcs", reorderLevel: 500, supplier: "seed", batches: 2, qty: 1000, naira: 45, expires: true },
  { code: "SCOB", name: "Tomato seed — Cobra F1", category: "seed", baseUnit: "pcs", reorderLevel: 500, supplier: "seed", batches: 2, qty: 1000, naira: 52, expires: true },
  { code: "SCAL", name: "Pepper seed — California Wonder", category: "seed", baseUnit: "pcs", reorderLevel: 500, supplier: "seed", batches: 2, qty: 1500, naira: 18, expires: true },
  { code: "SHAB", name: "Pepper seed — Habanero Red", category: "seed", baseUnit: "pcs", reorderLevel: 500, supplier: "seed", batches: 2, qty: 1000, naira: 30, expires: true },
  { code: "STAT", name: "Pepper seed — Tatashe", category: "seed", baseUnit: "pcs", reorderLevel: 500, supplier: "seed", batches: 2, qty: 1000, naira: 25, expires: true },
  { code: "SCHI", name: "Pepper seed — Chilli Long Slim", category: "seed", baseUnit: "pcs", reorderLevel: 500, supplier: "seed", batches: 2, qty: 1000, naira: 22, expires: true },

  // ── Growing media (3) ──────────────────────────────────────────────
  { code: "CPB", name: "Cocopeat block 5 kg", category: "growing_media", baseUnit: "pcs", reorderLevel: 40, supplier: "seed", batches: 3, qty: 60, naira: 3500, expires: false },
  { code: "CGB", name: "Cocopeat grow bag 100 cm", category: "growing_media", baseUnit: "pcs", reorderLevel: 100, supplier: "seed", batches: 2, qty: 300, naira: 2200, expires: false },
  { code: "PER", name: "Perlite (horticultural)", category: "growing_media", baseUnit: "kg", reorderLevel: 20, supplier: "seed", batches: 2, qty: 50, naira: 1600, expires: false },

  // ── Packaging (4) ──────────────────────────────────────────────────
  { code: "CRT", name: "Plastic harvest crate 20 kg", category: "packaging", baseUnit: "pcs", reorderLevel: 100, supplier: "hardware", batches: 1, qty: 250, naira: 4500, expires: false },
  { code: "CTN", name: "Carton box 5 kg (vented)", category: "packaging", baseUnit: "pcs", reorderLevel: 300, supplier: "hardware", batches: 1, qty: 1000, naira: 380, expires: false },
  { code: "PUN", name: "Punnet 500 g with lid", category: "packaging", baseUnit: "pcs", reorderLevel: 500, supplier: "hardware", batches: 1, qty: 2000, naira: 95, expires: false },
  { code: "NYB", name: "Nylon produce bag 10 kg", category: "packaging", baseUnit: "pcs", reorderLevel: 500, supplier: "hardware", batches: 1, qty: 400, naira: 60, expires: false },

  // ── Consumables (5) ────────────────────────────────────────────────
  { code: "GLV", name: "Nitrile gloves (pair)", category: "consumable", baseUnit: "pcs", reorderLevel: 200, supplier: "hardware", batches: 1, qty: 150, naira: 250, expires: false },
  { code: "TRY", name: "Seedling tray 104-cell", category: "consumable", baseUnit: "pcs", reorderLevel: 30, supplier: "hardware", batches: 1, qty: 80, naira: 1200, expires: false },
  { code: "TWN", name: "Trellis twine (polypropylene)", category: "consumable", baseUnit: "kg", reorderLevel: 10, supplier: "hardware", batches: 1, qty: 25, naira: 2800, expires: false },
  { code: "YST", name: "Yellow sticky trap 25×40 cm", category: "consumable", baseUnit: "pcs", reorderLevel: 100, supplier: "hardware", batches: 1, qty: 200, naira: 350, expires: true },
  { code: "TCL", name: "Tomato trellis clip", category: "consumable", baseUnit: "pcs", reorderLevel: 1000, supplier: "hardware", batches: 1, qty: 5000, naira: 12, expires: false },

  // ── Spare parts (4) ────────────────────────────────────────────────
  { code: "DRL", name: "Drip line 16 mm (roll 500 m)", category: "spare_part", baseUnit: "pcs", reorderLevel: 2, supplier: "hardware", batches: 1, qty: 4, naira: 48000, expires: false },
  { code: "DRP", name: "Pressure-compensating dripper 2 L/h", category: "spare_part", baseUnit: "pcs", reorderLevel: 500, supplier: "hardware", batches: 1, qty: 300, naira: 80, expires: false },
  { code: "DSF", name: "Disc filter 1\" (120 mesh)", category: "spare_part", baseUnit: "pcs", reorderLevel: 2, supplier: "hardware", batches: 1, qty: 4, naira: 15500, expires: false },
  { code: "PSK", name: "Fertigation pump seal kit", category: "spare_part", baseUnit: "pcs", reorderLevel: 1, supplier: "hardware", batches: 1, qty: 2, naira: 22000, expires: false },
];

/**
 * Days-from-today of generation-0 expiry, cycled over expiring items in
 * catalogue order. Generation k adds 150 days. Negative = already expired.
 */
const EXPIRY_BASE_DAYS = [-12, 18, 95, 160, 26, 210, 48, 300, 9, 130, 57, 240, 380, 75, 450];
const EXPIRY_GEN_STEP_DAYS = 150;

/** Receipts per supplier (→ 25 total). */
const RECEIPTS_PER_SUPPLIER: Record<SupplierKey, number> = {
  chem: 6,
  fert: 7,
  seed: 7,
  hardware: 5,
};

/** Receipt history spans the last 10 weeks. */
const HISTORY_DAYS = 70;

interface PlannedBatch {
  item: ItemSpec;
  itemIndex: number;
  generation: number;
  batchNumber: string;
  expiryDate: string | null;
  /** kobo per base unit (numeric(16,6) string) */
  rate: string;
}

function planBatches(today: string): PlannedBatch[] {
  const out: PlannedBatch[] = [];
  let expiringIdx = 0;
  DEMO_ITEMS.forEach((item, itemIndex) => {
    const base = item.expires
      ? EXPIRY_BASE_DAYS[expiringIdx++ % EXPIRY_BASE_DAYS.length]
      : null;
    for (let k = 0; k < item.batches; k++) {
      const rateKobo = Math.round(item.naira * 100 * (1 + 0.03 * k));
      out.push({
        item,
        itemIndex,
        generation: k,
        batchNumber: `${item.code}-${String(2401 + itemIndex * 7 + k * 211).padStart(4, "0")}`,
        expiryDate:
          base === null ? null : addDays(today, base + k * EXPIRY_GEN_STEP_DAYS),
        rate: rateKobo.toFixed(6),
      });
    }
  });
  return out;
}

/** Split `list` into `n` nearly equal consecutive chunks (no empty chunks). */
function chunk<T>(list: T[], n: number): T[][] {
  const parts = Math.min(n, list.length);
  const out: T[][] = [];
  let start = 0;
  for (let i = 0; i < parts; i++) {
    const size = Math.floor(list.length / parts) + (i < list.length % parts ? 1 : 0);
    out.push(list.slice(start, start + size));
    start += size;
  }
  return out;
}

/** The storekeeper's request context, built directly (no session in a script). */
function storekeeperCtx(state: SeedState): Ctx {
  const sk = DEMO_USERS.find((u) => u.role === "storekeeper")!;
  const userId = state.userIds.storekeeper;
  return {
    userId,
    orgId: state.orgId,
    role: "storekeeper",
    user: {
      id: userId,
      name: sk.name,
      phoneNumber: sk.phoneNumber,
      isPlatformAdmin: false,
    },
    org: { id: state.orgId, name: DEMO_ORG.name, status: "trial" },
    assignedGreenhouseIds: null,
    canSeeMoney: true,
  };
}

export const itemsStep: SeedStep = {
  name: "store (suppliers, items, batches, receipts → receive movements)",
  async run(state) {
    const { db, orgId } = state;
    const ctx = storekeeperCtx(state);
    const today = lagosDateOf(state.now);

    // Suppliers
    const supplierRows = await db
      .insert(suppliers)
      .values(
        DEMO_SUPPLIERS.map((s) => ({
          organisationId: orgId,
          name: s.name,
          phone: s.phone,
          email: s.email,
          notes: s.notes,
        })),
      )
      .returning({ id: suppliers.id, name: suppliers.name });
    const supplierIdByKey = new Map<SupplierKey, string>(
      DEMO_SUPPLIERS.map((s) => [
        s.key,
        supplierRows.find((r) => r.name === s.name)!.id,
      ]),
    );
    bump(state, "suppliers", supplierRows.length);

    // Items
    const itemRows = await db
      .insert(items)
      .values(
        DEMO_ITEMS.map((it) => ({
          organisationId: orgId,
          name: it.name,
          category: it.category,
          baseUnit: it.baseUnit,
          reorderLevel: it.reorderLevel.toFixed(3),
          activeIngredient: it.activeIngredient ?? null,
          phiDays: it.phiDays ?? null,
          reiHours: it.reiHours ?? null,
          nPct: it.npk ? it.npk[0].toFixed(2) : null,
          pPct: it.npk ? it.npk[1].toFixed(2) : null,
          kPct: it.npk ? it.npk[2].toFixed(2) : null,
          notes: it.notes ?? null,
        })),
      )
      .returning({ id: items.id, name: items.name });
    const itemIdByName = new Map(itemRows.map((r) => [r.name, r.id]));
    bump(state, "items", itemRows.length);

    // Receipts: per supplier, oldest generation first, chunked across the
    // last HISTORY_DAYS so newer batches arrive later (FEFO-consistent).
    const planned = planBatches(today);
    const receiptPlans: {
      supplier: (typeof DEMO_SUPPLIERS)[number];
      seq: number;
      receivedAt: Date;
      lines: PlannedBatch[];
    }[] = [];
    DEMO_SUPPLIERS.forEach((supplier, supplierIdx) => {
      const mine = planned
        .filter((b) => b.item.supplier === supplier.key)
        .sort((a, b) => a.generation - b.generation || a.itemIndex - b.itemIndex);
      const groups = chunk(mine, RECEIPTS_PER_SUPPLIER[supplier.key]);
      groups.forEach((lines, j) => {
        const span = HISTORY_DAYS - 7;
        const daysAgo =
          HISTORY_DAYS -
          supplierIdx -
          (groups.length > 1 ? Math.round((j * span) / (groups.length - 1)) : 0);
        // 10:00 Lagos (09:00 UTC) on that day
        const day = new Date(state.now.getTime() - daysAgo * DAY_MS);
        const receivedAt = new Date(`${lagosDateOf(day)}T09:00:00Z`);
        receiptPlans.push({ supplier, seq: j, receivedAt, lines });
      });
    });
    receiptPlans.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

    for (const plan of receiptPlans) {
      const supplierId = supplierIdByKey.get(plan.supplier.key)!;
      const storeId = state.storeIds["Input Store"];
      const lineCosts = plan.lines.map((l) => rateTimesQty(l.rate, l.item.qty));
      const total = lineCosts.reduce((s, c) => s + c, 0);

      await db.transaction(async (tx) => {
        const batchRows = await tx
          .insert(itemBatches)
          .values(
            plan.lines.map((l) => ({
              organisationId: orgId,
              itemId: itemIdByName.get(l.item.name)!,
              supplierId,
              batchNumber: l.batchNumber,
              expiryDate: l.expiryDate,
              unitCostKobo: l.rate,
              receivedAt: plan.receivedAt,
            })),
          )
          .returning({ id: itemBatches.id, batchNumber: itemBatches.batchNumber });
        const batchIdByNumber = new Map(batchRows.map((b) => [b.batchNumber, b.id]));

        const [receipt] = await tx
          .insert(receipts)
          .values({
            organisationId: orgId,
            supplierId,
            storeId,
            reference: `INV-${plan.supplier.code}-${1001 + plan.seq}`,
            receivedAt: plan.receivedAt,
            receivedBy: ctx.userId,
            totalCostKobo: total,
          })
          .returning({ id: receipts.id });

        const lineRows = await tx
          .insert(receiptLines)
          .values(
            plan.lines.map((l, i) => ({
              organisationId: orgId,
              receiptId: receipt.id,
              itemId: itemIdByName.get(l.item.name)!,
              itemBatchId: batchIdByNumber.get(l.batchNumber)!,
              quantity: l.item.qty.toFixed(3),
              unitCostKobo: l.rate,
              lineCostKobo: lineCosts[i],
            })),
          )
          .returning({ id: receiptLines.id, itemBatchId: receiptLines.itemBatchId });

        // Stock arrives ONLY through the movement engine.
        for (const line of lineRows) {
          const src = plan.lines.find(
            (l) => batchIdByNumber.get(l.batchNumber) === line.itemBatchId,
          )!;
          await postMovement(tx, ctx, {
            batchId: line.itemBatchId,
            storeId,
            type: "receive",
            quantity: src.item.qty,
            receiptLineId: line.id,
            performedAt: plan.receivedAt,
          });
        }

        await writeAudit(tx, ctx, {
          action: "receipts.create",
          entityType: "receipt",
          entityId: receipt.id,
          after: {
            supplier: plan.supplier.name,
            lines: plan.lines.length,
            totalCostKobo: total,
            source: "seed",
          },
        });

        bump(state, "item_batches", batchRows.length);
        bump(state, "receipt_lines", lineRows.length);
        bump(state, "inventory_movements", lineRows.length);
      });
      bump(state, "receipts");
      bump(state, "audit_log");
    }
  },
};
