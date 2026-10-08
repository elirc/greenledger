import { eq } from "drizzle-orm";
import { plans, user } from "../schema";
import { bump, type SeedStep } from "./state";
import { createAuthUser } from "./users";

/** Global plans — prices are integer kobo (₦1 = 100 kobo). */
const PLANS = [
  { code: "starter", name: "Starter", maxGreenhouses: 5, monthlyPriceKobo: 25_000_00 },
  { code: "growth", name: "Growth", maxGreenhouses: 20, monthlyPriceKobo: 60_000_00 },
  { code: "estate", name: "Estate", maxGreenhouses: 50, monthlyPriceKobo: 120_000_00 },
] as const;

export const PLATFORM_ADMIN = {
  label: "Platform admin",
  name: "Platform Admin",
  email: "admin@greenledger.local",
  password: "Admin1234!",
} as const;

export const platformStep: SeedStep = {
  name: "platform (plans + platform admin)",
  async run(state) {
    const rows = await state.db
      .insert(plans)
      .values(PLANS.map((p) => ({ ...p })))
      .returning({ id: plans.id, code: plans.code });
    for (const r of rows) {
      state.planIds[r.code as keyof typeof state.planIds] = r.id;
    }
    bump(state, "plans", rows.length);

    // Platform admin: NO membership — platform access comes from the flag only.
    const adminId = await createAuthUser(state, { ...PLATFORM_ADMIN });
    await state.db
      .update(user)
      .set({ isPlatformAdmin: true })
      .where(eq(user.id, adminId));
    state.platformAdminId = adminId;
  },
};
