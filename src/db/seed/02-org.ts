import { member, organization, subscriptions } from "../schema";
import { newId } from "../../lib/ids";
import type { Role } from "../../lib/permissions";
import { bump, type SeedStep } from "./state";
import { createAuthUser } from "./users";

const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 14;

export const DEMO_ORG = { name: "Demo Farms Ltd", slug: "demo-farms" } as const;

export const DEMO_PASSWORD = "Demo1234!";

/** DATA-MODEL §6 users; roles per DECISIONS §2. Order = membership order. */
export const DEMO_USERS: ReadonlyArray<{
  role: Role;
  name: string;
  email: string;
  phoneNumber: string;
}> = [
  { role: "owner", name: "Ada Obi", email: "owner@demo.farm", phoneNumber: "+2348010000001" },
  { role: "manager", name: "Musa Bello", email: "manager@demo.farm", phoneNumber: "+2348010000002" },
  { role: "storekeeper", name: "Chinedu Eze", email: "store@demo.farm", phoneNumber: "+2348010000003" },
  { role: "worker", name: "Blessing Ola", email: "worker@demo.farm", phoneNumber: "+2348010000004" },
];

export const orgStep: SeedStep = {
  name: "organisation (org + subscription + users + members)",
  async run(state) {
    const orgId = newId();
    await state.db.insert(organization).values({
      id: orgId,
      name: DEMO_ORG.name,
      slug: DEMO_ORG.slug,
      createdAt: state.now,
    });
    state.orgId = orgId;
    bump(state, "organization");

    const [sub] = await state.db
      .insert(subscriptions)
      .values({
        organisationId: orgId,
        planId: state.planIds.growth,
        status: "trialing",
        trialEndsAt: new Date(state.now.getTime() + TRIAL_DAYS * DAY_MS),
      })
      .returning({ id: subscriptions.id });
    state.subscriptionId = sub.id;
    bump(state, "subscriptions");

    for (const [i, u] of DEMO_USERS.entries()) {
      const userId = await createAuthUser(state, {
        label: u.role,
        name: u.name,
        email: u.email,
        password: DEMO_PASSWORD,
        phoneNumber: u.phoneNumber,
      });
      const memberId = newId();
      await state.db.insert(member).values({
        id: memberId,
        organizationId: orgId,
        userId,
        role: u.role,
        // Stagger by 1s so "first membership" ordering is stable.
        createdAt: new Date(state.now.getTime() + i * 1000),
      });
      state.userIds[u.role] = userId;
      state.memberIds[u.role] = memberId;
      bump(state, "member");
    }
  },
};
