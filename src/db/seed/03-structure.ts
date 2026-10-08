import {
  greenhouseAssignments,
  greenhouses,
  sites,
  stores,
  zones,
} from "../schema";
import { bump, type SeedStep } from "./state";

export const DEMO_SITE = { name: "Main Farm, Ogun State" } as const;

/** GH1-4 greenhouse, GH5-6 net_house; 480 m², capacity 1,100, zones A + B. */
export const DEMO_GREENHOUSES = [1, 2, 3, 4, 5, 6].map((n) => ({
  name: `GH${n}`,
  type: n <= 4 ? ("greenhouse" as const) : ("net_house" as const),
  areaM2: "480.00",
  plantCapacity: 1100,
}));

export const DEMO_ZONES = ["A", "B"] as const;

export const DEMO_STORES = [
  { name: "Input Store", type: "input_store" as const, isDefault: true },
  { name: "Cold Room", type: "cold_room" as const, isDefault: false },
  { name: "Packhouse", type: "packhouse" as const, isDefault: false },
];

/** Worker Blessing Ola is assigned these greenhouses. */
export const WORKER_GREENHOUSES = ["GH1", "GH2", "GH3"] as const;

export const structureStep: SeedStep = {
  name: "farm structure (site, greenhouses, zones, stores, assignments)",
  async run(state) {
    const { db, orgId } = state;

    const [site] = await db
      .insert(sites)
      .values({ organisationId: orgId, name: DEMO_SITE.name })
      .returning({ id: sites.id });
    state.siteId = site.id;
    bump(state, "sites");

    const ghRows = await db
      .insert(greenhouses)
      .values(
        DEMO_GREENHOUSES.map((g) => ({
          organisationId: orgId,
          siteId: site.id,
          ...g,
        })),
      )
      .returning({ id: greenhouses.id, name: greenhouses.name });
    for (const g of ghRows) state.greenhouseIds[g.name] = g.id;
    bump(state, "greenhouses", ghRows.length);

    const zoneRows = await db
      .insert(zones)
      .values(
        ghRows.flatMap((g) =>
          DEMO_ZONES.map((z, position) => ({
            organisationId: orgId,
            greenhouseId: g.id,
            name: z,
            position,
          })),
        ),
      )
      .returning({ id: zones.id, name: zones.name, greenhouseId: zones.greenhouseId });
    const ghNameById = new Map(ghRows.map((g) => [g.id, g.name]));
    for (const z of zoneRows) {
      state.zoneIds[`${ghNameById.get(z.greenhouseId)}/${z.name}`] = z.id;
    }
    bump(state, "zones", zoneRows.length);

    const storeRows = await db
      .insert(stores)
      .values(
        DEMO_STORES.map((s) => ({
          organisationId: orgId,
          siteId: site.id,
          ...s,
        })),
      )
      .returning({ id: stores.id, name: stores.name });
    for (const s of storeRows) state.storeIds[s.name] = s.id;
    bump(state, "stores", storeRows.length);

    const assignRows = await db
      .insert(greenhouseAssignments)
      .values(
        WORKER_GREENHOUSES.map((name) => ({
          organisationId: orgId,
          userId: state.userIds.worker,
          greenhouseId: state.greenhouseIds[name],
        })),
      )
      .returning({ id: greenhouseAssignments.id });
    bump(state, "greenhouse_assignments", assignRows.length);
  },
};
