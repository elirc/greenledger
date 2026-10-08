import type { Ctx } from "@/lib/guard";

export const TEST_ORG_ID = "00000000-0000-4000-8000-0000000000aa";
export const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Build a Ctx directly (integration tests bypass HTTP/session).
 * canSeeMoney follows the role unless explicitly overridden.
 */
export function makeCtx(
  overrides: Partial<Omit<Ctx, "user" | "org">> & {
    user?: Partial<Ctx["user"]>;
    org?: Partial<Ctx["org"]>;
  } = {},
): Ctx {
  const role = overrides.role ?? "owner";
  const orgId = overrides.orgId ?? TEST_ORG_ID;
  const userId = overrides.userId ?? TEST_USER_ID;
  return {
    userId,
    orgId,
    role,
    user: {
      id: userId,
      name: "Test User",
      phoneNumber: "+2348000000000",
      isPlatformAdmin: false,
      ...overrides.user,
    },
    org: { id: orgId, name: "Test Farm", status: "active", ...overrides.org },
    assignedGreenhouseIds:
      overrides.assignedGreenhouseIds !== undefined
        ? overrides.assignedGreenhouseIds
        : role === "worker"
          ? []
          : null,
    canSeeMoney: overrides.canSeeMoney ?? role !== "worker",
  };
}
