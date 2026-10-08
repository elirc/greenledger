"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { and, asc, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  cropCycles,
  greenhouses,
  member,
  organization,
  plans,
  sites,
  stores,
  subscriptions,
  zones,
} from "@/db/schema";
import { defineAction, type ActionResult } from "@/lib/action";
import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import {
  DEFAULT_STORE_NAMES,
  STORE_TYPES,
  createFarmSchema,
  ensureStoresSchema,
  greenhouseCreateSchema,
  greenhouseUpdateSchema,
  greenhousesBulkSchema,
  idSchema,
  siteCreateSchema,
  siteUpdateSchema,
  storeCreateSchema,
  storeUpdateSchema,
  zoneCreateSchema,
  zoneMoveSchema,
  zoneRenameSchema,
} from "./schema";

const FARM_ROLES = ["owner", "manager"] as const;
const TRIAL_DAYS = 14;

function pgCode(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const direct = (e as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (e as { cause?: { code?: unknown } }).cause;
  return typeof cause?.code === "string" ? cause.code : undefined;
}
const isUniqueViolation = (e: unknown) => pgCode(e) === "23505";
const isFkViolation = (e: unknown) => pgCode(e) === "23503";

const emptyToNull = (s: string | undefined) =>
  s && s.length > 0 ? s : null;

function revalidateFarm() {
  revalidatePath("/settings/farm");
  revalidatePath("/setup");
  revalidatePath("/greenhouses");
}

async function assertSiteInOrg(tx: Tx, orgId: string, siteId: string) {
  const site = await tx.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.organisationId, orgId)),
    columns: { id: true },
  });
  if (!site) throw new DomainError("NOT_FOUND", "Site not found.");
}

// ================================================================ onboarding

function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return base.length > 0 ? base : "farm";
}

function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 4);
}

async function slugTaken(slug: string): Promise<boolean> {
  const row = await db.query.organization.findFirst({
    where: eq(organization.slug, slug),
    columns: { id: true },
  });
  return Boolean(row);
}

/**
 * Onboarding: create the farm (Better Auth organization) for a signed-in
 * user who has none, then its trial subscription, default site and default
 * Input Store. This is the ONE action that cannot use requireMember (there is
 * no organisation yet) — it checks the session directly. Returns a result;
 * the client navigates to /setup.
 */
export async function createFarm(
  raw: unknown,
): Promise<ActionResult<{ orgId: string }>> {
  try {
    const parsed = createFarmSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        code: "VALIDATION",
        error: "Please check the highlighted fields.",
        fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<
          string,
          string[]
        >,
      };
    }
    const { name } = parsed.data;

    const hdrs = await headers();
    const session = await auth.api.getSession({ headers: hdrs });
    if (!session) {
      return { ok: false, code: "UNAUTHENTICATED", error: "You need to sign in." };
    }
    const userId = session.user.id;

    const existing = await db.query.member.findFirst({
      where: eq(member.userId, userId),
      columns: { id: true },
    });
    if (existing) {
      return {
        ok: false,
        code: "ALREADY_MEMBER",
        error: "Your account already belongs to a farm.",
      };
    }

    const plan = await db.query.plans.findFirst({
      where: eq(plans.code, "growth"),
      columns: { id: true },
    });
    if (!plan) {
      return {
        ok: false,
        code: "NO_PLAN",
        error: "Subscription plans are not set up yet. Please contact support.",
      };
    }

    // Slugify; on collision suffix a random 4-char string and retry.
    const baseSlug = slugify(name);
    let org: { id: string; slug: string } | null = null;
    for (let attempt = 0; attempt < 5 && !org; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
      if (await slugTaken(slug)) continue;
      try {
        const created = await auth.api.createOrganization({
          body: { name, slug },
          headers: hdrs,
        });
        if (created) org = { id: created.id, slug: created.slug };
      } catch (e) {
        // Lost a race for the slug — try another suffix; anything else is real.
        if (await slugTaken(slug)) continue;
        throw e;
      }
    }
    if (!org) {
      return {
        ok: false,
        code: "SLUG_UNAVAILABLE",
        error: "Could not create the farm. Please try a different name.",
        fieldErrors: { name: ["Try a different farm name"] },
      };
    }
    const orgId = org.id;
    const orgSlug = org.slug;

    await auth.api.setActiveOrganization({
      body: { organizationId: orgId },
      headers: hdrs,
    });

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    await db.transaction(async (tx) => {
      const [sub] = await tx
        .insert(subscriptions)
        .values({
          organisationId: orgId,
          planId: plan.id,
          status: "trialing",
          trialEndsAt,
        })
        .returning({ id: subscriptions.id });
      const [site] = await tx
        .insert(sites)
        .values({ organisationId: orgId, name })
        .returning({ id: sites.id });
      const [store] = await tx
        .insert(stores)
        .values({
          organisationId: orgId,
          siteId: site.id,
          name: DEFAULT_STORE_NAMES.input_store,
          type: "input_store",
          isDefault: true,
        })
        .returning({ id: stores.id });
      await writeAudit(
        tx,
        { orgId, userId },
        {
          action: "farm.create",
          entityType: "organization",
          entityId: orgId,
          after: {
            name,
            slug: orgSlug,
            plan: "growth",
            subscriptionId: sub.id,
            trialEndsAt: trialEndsAt.toISOString(),
            siteId: site.id,
            storeId: store.id,
          },
        },
      );
    });

    revalidatePath("/", "layout");
    return { ok: true, data: { orgId } };
  } catch (e) {
    console.error("[action:farm.create]", e);
    return {
      ok: false,
      code: "INTERNAL",
      error: "Something went wrong. Please try again.",
    };
  }
}

// ===================================================================== sites

export const createSite = defineAction({
  name: "farm.createSite",
  schema: siteCreateSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(sites)
          .values({
            organisationId: ctx.orgId,
            name: input.name,
            address: emptyToNull(input.address),
          })
          .returning({ id: sites.id });
        await writeAudit(tx, ctx, {
          action: "farm.createSite",
          entityType: "site",
          entityId: row.id,
          after: { name: input.name, address: input.address },
        });
        revalidateFarm();
        return { id: row.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError("DUPLICATE", "A site with this name already exists.");
      }
      throw e;
    }
  },
});

export const updateSite = defineAction({
  name: "farm.updateSite",
  schema: siteUpdateSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const before = await tx.query.sites.findFirst({
          where: and(eq(sites.id, input.id), eq(sites.organisationId, ctx.orgId)),
        });
        if (!before) throw new DomainError("NOT_FOUND", "Site not found.");
        await tx
          .update(sites)
          .set({ name: input.name, address: emptyToNull(input.address) })
          .where(and(eq(sites.id, input.id), eq(sites.organisationId, ctx.orgId)));
        await writeAudit(tx, ctx, {
          action: "farm.updateSite",
          entityType: "site",
          entityId: input.id,
          before: { name: before.name, address: before.address },
          after: { name: input.name, address: input.address },
        });
        revalidateFarm();
        return { id: input.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError("DUPLICATE", "A site with this name already exists.");
      }
      throw e;
    }
  },
});

// =============================================================== greenhouses

const DUP_GREENHOUSE = "A greenhouse with this name already exists.";

export const createGreenhouse = defineAction({
  name: "farm.createGreenhouse",
  schema: greenhouseCreateSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        await assertSiteInOrg(tx, ctx.orgId, input.siteId);
        const [row] = await tx
          .insert(greenhouses)
          .values({
            organisationId: ctx.orgId,
            siteId: input.siteId,
            name: input.name,
            type: input.type,
            areaM2: String(input.areaM2),
            plantCapacity: input.plantCapacity,
            notes: emptyToNull(input.notes),
            isActive: input.isActive,
          })
          .returning({ id: greenhouses.id });
        await writeAudit(tx, ctx, {
          action: "farm.createGreenhouse",
          entityType: "greenhouse",
          entityId: row.id,
          after: input,
        });
        revalidateFarm();
        return { id: row.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", DUP_GREENHOUSE);
      throw e;
    }
  },
});

export const updateGreenhouse = defineAction({
  name: "farm.updateGreenhouse",
  schema: greenhouseUpdateSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const before = await tx.query.greenhouses.findFirst({
          where: and(
            eq(greenhouses.id, input.id),
            eq(greenhouses.organisationId, ctx.orgId),
          ),
        });
        if (!before) throw new DomainError("NOT_FOUND", "Greenhouse not found.");
        await assertSiteInOrg(tx, ctx.orgId, input.siteId);
        await tx
          .update(greenhouses)
          .set({
            siteId: input.siteId,
            name: input.name,
            type: input.type,
            areaM2: String(input.areaM2),
            plantCapacity: input.plantCapacity,
            notes: emptyToNull(input.notes),
            isActive: input.isActive,
          })
          .where(
            and(
              eq(greenhouses.id, input.id),
              eq(greenhouses.organisationId, ctx.orgId),
            ),
          );
        await writeAudit(tx, ctx, {
          action: "farm.updateGreenhouse",
          entityType: "greenhouse",
          entityId: input.id,
          before: {
            siteId: before.siteId,
            name: before.name,
            type: before.type,
            areaM2: before.areaM2,
            plantCapacity: before.plantCapacity,
            isActive: before.isActive,
          },
          after: input,
        });
        revalidateFarm();
        return { id: input.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", DUP_GREENHOUSE);
      throw e;
    }
  },
});

/**
 * Hard delete only when nothing references the greenhouse (crop cycles or any
 * other history). Otherwise it is deactivated (is_active=false) instead and
 * the caller tells the user why.
 */
export const deleteGreenhouse = defineAction({
  name: "farm.deleteGreenhouse",
  schema: idSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const before = await tx.query.greenhouses.findFirst({
        where: and(
          eq(greenhouses.id, input.id),
          eq(greenhouses.organisationId, ctx.orgId),
        ),
      });
      if (!before) throw new DomainError("NOT_FOUND", "Greenhouse not found.");

      const cycle = await tx.query.cropCycles.findFirst({
        where: and(
          eq(cropCycles.organisationId, ctx.orgId),
          eq(cropCycles.greenhouseId, input.id),
        ),
        columns: { id: true },
      });

      let deleted = false;
      if (!cycle) {
        try {
          // Savepoint: an FK violation from other history must not abort the tx.
          await tx.transaction(async (sp) => {
            await sp
              .delete(greenhouses)
              .where(
                and(
                  eq(greenhouses.id, input.id),
                  eq(greenhouses.organisationId, ctx.orgId),
                ),
              );
          });
          deleted = true;
        } catch (e) {
          if (!isFkViolation(e)) throw e;
        }
      }

      if (!deleted) {
        await tx
          .update(greenhouses)
          .set({ isActive: false })
          .where(
            and(
              eq(greenhouses.id, input.id),
              eq(greenhouses.organisationId, ctx.orgId),
            ),
          );
      }

      await writeAudit(tx, ctx, {
        action: deleted ? "farm.deleteGreenhouse" : "farm.deactivateGreenhouse",
        entityType: "greenhouse",
        entityId: input.id,
        before: { name: before.name, isActive: before.isActive },
        after: deleted ? undefined : { isActive: false },
      });
      revalidateFarm();
      return { id: input.id, outcome: deleted ? ("deleted" as const) : ("deactivated" as const) };
    }),
});

/**
 * Wizard step 2: save repeatable greenhouse rows in one transaction.
 * Rows with an id update that greenhouse, rows without one are inserted.
 */
export const saveGreenhouses = defineAction({
  name: "farm.saveGreenhouses",
  schema: greenhousesBulkSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        await assertSiteInOrg(tx, ctx.orgId, input.siteId);

        // Friendly duplicate check against names already in the org.
        const existing = await tx
          .select({ id: greenhouses.id, name: greenhouses.name })
          .from(greenhouses)
          .where(eq(greenhouses.organisationId, ctx.orgId));
        const ownIds = new Set(existing.map((g) => g.id));
        const rowIds = new Set(input.rows.flatMap((r) => (r.id ? [r.id] : [])));
        const untouched = existing.filter((g) => !rowIds.has(g.id));
        for (const row of input.rows) {
          if (row.id && !ownIds.has(row.id)) {
            throw new DomainError("NOT_FOUND", "Greenhouse not found.");
          }
          const clash = untouched.some(
            (g) => g.name.toLowerCase() === row.name.toLowerCase(),
          );
          if (clash) {
            throw new DomainError(
              "DUPLICATE",
              `A greenhouse named "${row.name}" already exists.`,
            );
          }
        }

        let created = 0;
        let updated = 0;
        for (const row of input.rows) {
          const values = {
            name: row.name,
            type: row.type,
            areaM2: String(row.areaM2),
            plantCapacity: row.plantCapacity,
          };
          if (row.id) {
            await tx
              .update(greenhouses)
              .set(values)
              .where(
                and(
                  eq(greenhouses.id, row.id),
                  eq(greenhouses.organisationId, ctx.orgId),
                ),
              );
            await writeAudit(tx, ctx, {
              action: "farm.updateGreenhouse",
              entityType: "greenhouse",
              entityId: row.id,
              after: values,
            });
            updated++;
          } else {
            const [ins] = await tx
              .insert(greenhouses)
              .values({
                organisationId: ctx.orgId,
                siteId: input.siteId,
                ...values,
              })
              .returning({ id: greenhouses.id });
            await writeAudit(tx, ctx, {
              action: "farm.createGreenhouse",
              entityType: "greenhouse",
              entityId: ins.id,
              after: values,
            });
            created++;
          }
        }
        revalidateFarm();
        return { created, updated };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", DUP_GREENHOUSE);
      throw e;
    }
  },
});

// ===================================================================== zones

const DUP_ZONE = "This greenhouse already has a zone with this name.";

async function assertGreenhouseInOrg(tx: Tx, orgId: string, greenhouseId: string) {
  const gh = await tx.query.greenhouses.findFirst({
    where: and(
      eq(greenhouses.id, greenhouseId),
      eq(greenhouses.organisationId, orgId),
    ),
    columns: { id: true },
  });
  if (!gh) throw new DomainError("NOT_FOUND", "Greenhouse not found.");
}

export const createZone = defineAction({
  name: "farm.createZone",
  schema: zoneCreateSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        await assertGreenhouseInOrg(tx, ctx.orgId, input.greenhouseId);
        const [{ next }] = await tx
          .select({ next: sql<number>`coalesce(max(${zones.position}), -1) + 1` })
          .from(zones)
          .where(
            and(
              eq(zones.organisationId, ctx.orgId),
              eq(zones.greenhouseId, input.greenhouseId),
            ),
          );
        const [row] = await tx
          .insert(zones)
          .values({
            organisationId: ctx.orgId,
            greenhouseId: input.greenhouseId,
            name: input.name,
            position: Number(next),
          })
          .returning({ id: zones.id });
        await writeAudit(tx, ctx, {
          action: "farm.createZone",
          entityType: "zone",
          entityId: row.id,
          after: { greenhouseId: input.greenhouseId, name: input.name },
        });
        revalidateFarm();
        return { id: row.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", DUP_ZONE);
      throw e;
    }
  },
});

export const renameZone = defineAction({
  name: "farm.renameZone",
  schema: zoneRenameSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const before = await tx.query.zones.findFirst({
          where: and(eq(zones.id, input.id), eq(zones.organisationId, ctx.orgId)),
        });
        if (!before) throw new DomainError("NOT_FOUND", "Zone not found.");
        await tx
          .update(zones)
          .set({ name: input.name })
          .where(and(eq(zones.id, input.id), eq(zones.organisationId, ctx.orgId)));
        await writeAudit(tx, ctx, {
          action: "farm.renameZone",
          entityType: "zone",
          entityId: input.id,
          before: { name: before.name },
          after: { name: input.name },
        });
        revalidateFarm();
        return { id: input.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", DUP_ZONE);
      throw e;
    }
  },
});

/** Swap a zone with its neighbour (up = lower position). */
export const moveZone = defineAction({
  name: "farm.moveZone",
  schema: zoneMoveSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const zone = await tx.query.zones.findFirst({
        where: and(eq(zones.id, input.id), eq(zones.organisationId, ctx.orgId)),
      });
      if (!zone) throw new DomainError("NOT_FOUND", "Zone not found.");
      const up = input.direction === "up";
      const neighbour = await tx.query.zones.findFirst({
        where: and(
          eq(zones.organisationId, ctx.orgId),
          eq(zones.greenhouseId, zone.greenhouseId),
          up ? lt(zones.position, zone.position) : gt(zones.position, zone.position),
        ),
        orderBy: up ? desc(zones.position) : asc(zones.position),
      });
      if (!neighbour) return { id: input.id, moved: false };
      await tx
        .update(zones)
        .set({ position: neighbour.position })
        .where(and(eq(zones.id, zone.id), eq(zones.organisationId, ctx.orgId)));
      await tx
        .update(zones)
        .set({ position: zone.position })
        .where(and(eq(zones.id, neighbour.id), eq(zones.organisationId, ctx.orgId)));
      await writeAudit(tx, ctx, {
        action: "farm.moveZone",
        entityType: "zone",
        entityId: zone.id,
        before: { position: zone.position },
        after: { position: neighbour.position },
      });
      revalidateFarm();
      return { id: input.id, moved: true };
    }),
});

export const deleteZone = defineAction({
  name: "farm.deleteZone",
  schema: idSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const before = await tx.query.zones.findFirst({
        where: and(eq(zones.id, input.id), eq(zones.organisationId, ctx.orgId)),
      });
      if (!before) throw new DomainError("NOT_FOUND", "Zone not found.");
      // crop_cycles.zone_id is ON DELETE SET NULL — history is kept.
      await tx
        .delete(zones)
        .where(and(eq(zones.id, input.id), eq(zones.organisationId, ctx.orgId)));
      await writeAudit(tx, ctx, {
        action: "farm.deleteZone",
        entityType: "zone",
        entityId: input.id,
        before: { greenhouseId: before.greenhouseId, name: before.name },
      });
      revalidateFarm();
      return { id: input.id };
    }),
});

// ==================================================================== stores

const DUP_STORE = "A store with this name already exists.";

/** Lock the org's store rows so the "exactly one default" rule holds. */
async function lockStores(tx: Tx, orgId: string) {
  return tx
    .select({ id: stores.id, isDefault: stores.isDefault })
    .from(stores)
    .where(eq(stores.organisationId, orgId))
    .for("update");
}

async function clearOtherDefaults(tx: Tx, orgId: string, keepId: string) {
  await tx
    .update(stores)
    .set({ isDefault: false })
    .where(
      and(
        eq(stores.organisationId, orgId),
        ne(stores.id, keepId),
        eq(stores.isDefault, true),
      ),
    );
}

export const createStore = defineAction({
  name: "farm.createStore",
  schema: storeCreateSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        await assertSiteInOrg(tx, ctx.orgId, input.siteId);
        const current = await lockStores(tx, ctx.orgId);
        const makeDefault = input.isDefault || !current.some((s) => s.isDefault);
        const [row] = await tx
          .insert(stores)
          .values({
            organisationId: ctx.orgId,
            siteId: input.siteId,
            name: input.name,
            type: input.type,
            isDefault: makeDefault,
          })
          .returning({ id: stores.id });
        if (makeDefault) await clearOtherDefaults(tx, ctx.orgId, row.id);
        await writeAudit(tx, ctx, {
          action: "farm.createStore",
          entityType: "store",
          entityId: row.id,
          after: { ...input, isDefault: makeDefault },
        });
        revalidateFarm();
        return { id: row.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", DUP_STORE);
      throw e;
    }
  },
});

export const updateStore = defineAction({
  name: "farm.updateStore",
  schema: storeUpdateSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        await lockStores(tx, ctx.orgId);
        const before = await tx.query.stores.findFirst({
          where: and(eq(stores.id, input.id), eq(stores.organisationId, ctx.orgId)),
        });
        if (!before) throw new DomainError("NOT_FOUND", "Store not found.");
        await assertSiteInOrg(tx, ctx.orgId, input.siteId);
        if (before.isDefault && !input.isDefault) {
          throw new DomainError(
            "DEFAULT_REQUIRED",
            "One store must be the default. Make another store the default instead.",
          );
        }
        await tx
          .update(stores)
          .set({
            siteId: input.siteId,
            name: input.name,
            type: input.type,
            isDefault: input.isDefault,
          })
          .where(and(eq(stores.id, input.id), eq(stores.organisationId, ctx.orgId)));
        if (input.isDefault) await clearOtherDefaults(tx, ctx.orgId, input.id);
        await writeAudit(tx, ctx, {
          action: "farm.updateStore",
          entityType: "store",
          entityId: input.id,
          before: {
            siteId: before.siteId,
            name: before.name,
            type: before.type,
            isDefault: before.isDefault,
          },
          after: input,
        });
        revalidateFarm();
        return { id: input.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", DUP_STORE);
      throw e;
    }
  },
});

export const deleteStore = defineAction({
  name: "farm.deleteStore",
  schema: idSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const current = await lockStores(tx, ctx.orgId);
        const before = await tx.query.stores.findFirst({
          where: and(eq(stores.id, input.id), eq(stores.organisationId, ctx.orgId)),
        });
        if (!before) throw new DomainError("NOT_FOUND", "Store not found.");
        if (before.isDefault && current.length > 1) {
          throw new DomainError(
            "DEFAULT_REQUIRED",
            "This is the default store. Make another store the default first.",
          );
        }
        await tx
          .delete(stores)
          .where(and(eq(stores.id, input.id), eq(stores.organisationId, ctx.orgId)));
        await writeAudit(tx, ctx, {
          action: "farm.deleteStore",
          entityType: "store",
          entityId: input.id,
          before: { name: before.name, type: before.type, isDefault: before.isDefault },
        });
        revalidateFarm();
        return { id: input.id };
      });
    } catch (e) {
      if (isFkViolation(e)) {
        throw new DomainError(
          "IN_USE",
          "This store has stock or produce history, so it cannot be deleted.",
        );
      }
      throw e;
    }
  },
});

/**
 * Wizard step 3: make sure a store of each picked type exists (standard
 * names). Idempotent; keeps exactly one default (the Input Store when there
 * is none yet).
 */
export const ensureStores = defineAction({
  name: "farm.ensureStores",
  schema: ensureStoresSchema,
  roles: [...FARM_ROLES],
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        await assertSiteInOrg(tx, ctx.orgId, input.siteId);
        await lockStores(tx, ctx.orgId);
        const existing = await tx
          .select({ id: stores.id, type: stores.type, isDefault: stores.isDefault })
          .from(stores)
          .where(eq(stores.organisationId, ctx.orgId));
        let hasDefault = existing.some((s) => s.isDefault);
        let created = 0;
        // Input store first so it becomes the default when there is none.
        const ordered = STORE_TYPES.filter((t) => input.types.includes(t));
        for (const type of ordered) {
          if (existing.some((s) => s.type === type)) continue;
          const makeDefault = !hasDefault;
          const [row] = await tx
            .insert(stores)
            .values({
              organisationId: ctx.orgId,
              siteId: input.siteId,
              name: DEFAULT_STORE_NAMES[type],
              type,
              isDefault: makeDefault,
            })
            .returning({ id: stores.id });
          hasDefault = true;
          created++;
          await writeAudit(tx, ctx, {
            action: "farm.createStore",
            entityType: "store",
            entityId: row.id,
            after: { name: DEFAULT_STORE_NAMES[type], type, isDefault: makeDefault },
          });
        }
        revalidateFarm();
        return { created };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError(
          "DUPLICATE",
          "A store with one of these names already exists with a different type. Rename it in Settings → Farm.",
        );
      }
      throw e;
    }
  },
});
