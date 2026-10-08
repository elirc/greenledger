# Brief P1-C — Seed (Phase-1 scope), test factories, tenancy security test

Read first, in order: `agents/_RULES.md`, `docs/DATA-MODEL.md` (§6 seed data requirements),
`docs/ARCHITECTURE.md` (§14 testing), `docs/DECISIONS.md`.

## You own (create/edit ONLY these)
- `src/db/seed.ts` (+ `src/db/seed/` helper files if you want structure — keep the entrypoint)
- `tests/factories/**`
- `tests/security/tenancy.test.ts`

## Tasks
1. **Seed, Phase-1 scope only** (later phases extend it; structure it so extension is additive —
   a `seed/` folder with `01-platform.ts`, `02-org.ts`, `03-structure.ts` run in order is ideal):
   - Deterministic: no randomness in this phase.
   - Wipe-and-reseed: truncate all business + auth tables first (CASCADE), so `pnpm db:seed` is
     idempotent. Guard: refuse to run when `NODE_ENV === 'production'`.
   - Global `plans` rows: starter (5 GH, ₦25,000/mo), growth (20 GH, ₦60,000/mo),
     estate (50 GH, ₦120,000/mo) — kobo!
   - Platform admin: user "Platform Admin", email `admin@greenledger.local`, password `Admin1234!`,
     `is_platform_admin = true`, NO membership.
   - Org **Demo Farms Ltd** (slug `demo-farms`) with `subscriptions` row: plan growth, status
     trialing, `trial_ends_at = seed time + 14 days`.
   - Users + members (DATA-MODEL §6): +2348010000001 Ada Obi (owner, owner@demo.farm),
     ...002 Musa Bello (manager, manager@demo.farm), ...003 Chinedu Eze (storekeeper,
     store@demo.farm), ...004 Blessing Ola (worker, worker@demo.farm) — all password `Demo1234!`,
     phone numbers verified. Worker assigned GH1–GH3 via `greenhouse_assignments`.
   - Structure: site "Main Farm, Ogun State"; greenhouses GH1..GH6 (GH1-4 type greenhouse,
     GH5-6 net_house; 480 m²; capacity 1100; zones A and B each); stores Input Store (default),
     Cold Room, Packhouse.
   - **User creation**: create email+password users via `auth.api.signUpEmail({ body })` so the
     password hash is Better Auth's own, then UPDATE the user rows to set phone_number,
     phone_number_verified, name; create `member` rows directly. (Server-side call: import `auth`
     from `src/lib/auth`; no HTTP.) Set `is_platform_admin` by direct update.
   - Log a summary table at the end (counts per entity + the five logins).
2. **Factories** (`tests/factories/index.ts`): `createTestOrg(db, { name })` → creates org, a
   subscription (active), site, 2 greenhouses, 3 stores, and users for each of the 4 roles with
   members — returning ids + ready-made `Ctx` objects per role (import the real `Ctx` type).
   Pure DB inserts (no Better Auth API — tests don't need real password hashes).
3. **`tests/security/tenancy.test.ts`** (runs under the integration vitest config): create org A
   and org B via the factory; exercise every exported query in `src/modules/farm/queries.ts` and
   `src/modules/users/queries.ts` (import the module, iterate its exports) with an org-A ctx and
   assert no returned row carries an org-B id (walk the result JSON for B's known ids). Also
   assert `requireMember` is NOT bypassable by handing a forged ctx — i.e., test the QUERY layer
   contract: every query takes ctx and filters by ctx.orgId. Keep the test data-driven so later
   modules can be added to its registry with one line.
   DO NOT RUN the suite — the orchestrator runs it (shared test DB). `pnpm exec tsc --noEmit`
   is your only check (ignore errors outside your files).

## Notes
- `src/modules/farm` and `src/modules/users` are being written in parallel by P1-A/P1-B. Code
  against the documented conventions (queries take `ctx` first arg); if an import is missing at
  your tsc run, note it in your report rather than stubbing it yourself.
- Money in kobo bigint; dates via src/lib/dates helpers; every insert carries organisationId.
