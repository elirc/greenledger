import { db, pool } from "../index";
import { resetStep } from "./00-reset";
import { platformStep } from "./01-platform";
import { orgStep } from "./02-org";
import { structureStep } from "./03-structure";
import { itemsStep } from "./04-items";
import { cropsStep } from "./05-crops";
import { applicationsStep } from "./06-applications";
import type { SeedState, SeedStep } from "./state";

/**
 * Steps run strictly in order. Later phases APPEND steps here (04-crops,
 * 05-items, ...) — extension is additive; earlier steps are not edited.
 */
export const SEED_STEPS: SeedStep[] = [
  resetStep,
  platformStep,
  orgStep,
  structureStep,
  itemsStep,
  cropsStep,
  applicationsStep,
];

function initialState(): SeedState {
  return {
    db,
    now: new Date(),
    planIds: { starter: "", growth: "", estate: "" },
    platformAdminId: "",
    orgId: "",
    subscriptionId: "",
    userIds: { owner: "", manager: "", storekeeper: "", worker: "" },
    memberIds: { owner: "", manager: "", storekeeper: "", worker: "" },
    siteId: "",
    greenhouseIds: {},
    zoneIds: {},
    storeIds: {},
    logins: [],
    counts: {},
  };
}

function printSummary(state: SeedState): void {
  console.log("\n[seed] Row counts");
  console.table(
    Object.entries(state.counts).map(([entity, rows]) => ({ entity, rows })),
  );
  console.log("[seed] Logins (OTP in mock mode is always 123456)");
  console.table(
    state.logins.map((l) => ({
      who: l.label,
      email: l.email,
      password: l.password,
      phone: l.phoneNumber ?? "—",
    })),
  );
}

export async function runSeed(): Promise<SeedState> {
  const state = initialState();
  try {
    for (const step of SEED_STEPS) {
      const t0 = Date.now();
      await step.run(state);
      console.log(`[seed] ✓ ${step.name} (${Date.now() - t0} ms)`);
    }
    printSummary(state);
    return state;
  } finally {
    await pool.end();
  }
}
