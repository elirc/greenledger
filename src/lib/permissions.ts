import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
} from "better-auth/plugins/organization/access";

/** Membership role codes stored in Better Auth `member.role`. */
export const ROLES = ["owner", "manager", "storekeeper", "worker"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Farm manager",
  storekeeper: "Storekeeper",
  worker: "Worker",
};

/**
 * Better Auth access-control statements. These gate Better Auth's own
 * organization endpoints (invitations, member management). Fine-grained
 * app permissions are enforced by requireMember() in src/lib/guard.ts —
 * that is the source of truth for app behavior, not this object.
 */
const statement = {
  ...defaultStatements,
  farm: ["manage"],
  stock: ["receive", "issue", "adjust"],
  logs: ["create"],
  money: ["read"],
  overrides: ["grant"],
  billing: ["manage"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  owner: ac.newRole({
    ...adminAc.statements,
    farm: ["manage"],
    stock: ["receive", "issue", "adjust"],
    logs: ["create"],
    money: ["read"],
    overrides: ["grant"],
    billing: ["manage"],
  }),
  manager: ac.newRole({
    farm: ["manage"],
    stock: ["receive", "issue", "adjust"],
    logs: ["create"],
    money: ["read"],
    overrides: ["grant"],
  }),
  storekeeper: ac.newRole({
    stock: ["receive", "issue", "adjust"],
    money: ["read"],
  }),
  worker: ac.newRole({
    logs: ["create"],
  }),
};
