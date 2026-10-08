# Brief P1-B — Farm structure + onboarding + setup wizard

Read first, in order: `agents/_RULES.md`, `docs/ARCHITECTURE.md` (§3, §4, §5), `docs/DATA-MODEL.md`
(§4.1 farm structure, §4.2 crops), `docs/DECISIONS.md`.
Reference module to imitate: `src/modules/suppliers/` and its pages under `src/app/(app)/store/suppliers/`.

## You own (create/edit ONLY these)
- `src/modules/farm/` (actions.ts, queries.ts, schema.ts, components/)
- `src/modules/crops/schema.ts + actions.ts + queries.ts` (crops & varieties CRUD only — pages come in Phase 3, the wizard uses the actions)
- `src/app/onboarding/page.tsx` (+ components) — create-farm screen. NOTE: this lives OUTSIDE
  the `(app)` group (the app layout redirects no-org users here; keeping it outside avoids a
  redirect loop). Give it a minimal centered-card layout like the auth screens; check the
  session yourself via `auth.api.getSession` and redirect signed-out users to `/sign-in`.
- `src/app/(app)/setup/**` — the setup wizard
- `src/app/(app)/settings/farm/**` — manage site(s), greenhouses (+zones), stores after setup

## Tasks
1. **Onboarding** (`/onboarding`): shown to a signed-in user with no organisation (the app layout
   redirects here — do not add redirects yourself). Form: farm name → server action that calls
   `auth.api.createOrganization({ body: { name, slug }, headers: await headers() })` (slugify the
   name, suffix a random 4-char on collision), then `auth.api.setActiveOrganization`, then creates
   the org's `subscriptions` row (status `trialing`, `trial_ends_at = now + 14 days`, plan =
   seeded `growth` plan id via lookup by code) and a default site named after the farm +
   a default "Input Store". Then redirect to `/setup`. NOTE: this action CANNOT use
   `requireMember` (no org yet) — use `auth.api.getSession` directly; it is the one exception.
2. **Farm module** (all through `defineAction`, roles owner/manager unless noted):
   - sites: create/rename (v1: single-site UX, but model supports many).
   - greenhouses: CRUD (name, type enum, area m², plant capacity, site, active flag) + zones
     (add/rename/remove, position) inline per greenhouse.
   - stores: CRUD (name, type input_store/cold_room/packhouse, default flag — exactly one default).
   - All writes audited; unique names per org handled as friendly field errors (catch pg 23505).
3. **Setup wizard** (`/setup`, owner only): stepper UI, steps:
   1 Farm site (name, address) → 2 Greenhouses (repeatable rows: name, type, area, capacity;
   bulk-add "GH1..GHn" helper) → 3 Stores (prefilled Input Store/Cold Room/Packhouse checkboxes) →
   4 Varieties (pick crop tomato/pepper — create the two `crops` rows for the org with their
   default shelf lives 7/10 if missing — then add varieties: name, days to first harvest,
   harvest weeks, expected yield kg/plant) → 5 Items & opening stock: locked card
   "Available after the store module (Phase 2)" → 6 Done (summary + "Go to dashboard").
   Each step saves via the farm/crops actions (idempotent re-entry: wizard reads current org
   state and pre-fills). Progress persisted implicitly by data presence; `/setup` jumps to the
   first incomplete step.
4. **Settings → Farm structure** (`/settings/farm`): tabs Site | Greenhouses | Stores reusing the
   same module components (list + edit dialogs/sheets, mobile-first).

## Conventions that will fail review if missed
- defineAction + zod schema in module `schema.ts`; shared with forms via zodResolver.
- loading/error/empty states on every page; 44px targets; no raw hex colors.
- Greenhouse delete: only when no crop cycles reference it — otherwise deactivate (`is_active=false`)
  with a toast explaining why.
- Scope every query by `ctx.orgId`; audit every write.
