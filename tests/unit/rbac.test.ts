import { describe, expect, it } from "vitest";
import { ROLE_LABELS, ROLES, roles } from "@/lib/permissions";

describe("permissions matrix", () => {
  it("defines exactly the four farm roles, in order", () => {
    expect([...ROLES]).toEqual(["owner", "manager", "storekeeper", "worker"]);
  });

  it("has a display label for every role (DECISIONS §2)", () => {
    expect(ROLE_LABELS).toEqual({
      owner: "Owner",
      manager: "Farm manager",
      storekeeper: "Storekeeper",
      worker: "Worker",
    });
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ROLES].sort());
  });

  it("defines a Better Auth role for every role code", () => {
    expect(Object.keys(roles).sort()).toEqual([...ROLES].sort());
  });

  it("workers can only create logs", () => {
    expect(roles.worker.statements).toEqual({ logs: ["create"] });
    expect(roles.worker.authorize({ logs: ["create"] }).success).toBe(true);
    expect(roles.worker.authorize({ money: ["read"] }).success).toBe(false);
    expect(roles.worker.authorize({ stock: ["issue"] }).success).toBe(false);
    expect(roles.worker.authorize({ billing: ["manage"] }).success).toBe(false);
  });

  it("only the owner manages billing", () => {
    expect(roles.owner.authorize({ billing: ["manage"] }).success).toBe(true);
    expect(roles.manager.authorize({ billing: ["manage"] }).success).toBe(false);
    expect(roles.storekeeper.authorize({ billing: ["manage"] }).success).toBe(
      false,
    );
  });
});
