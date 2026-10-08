# RULES — read first, they override everything below your brief

You are one of several agents building GreenLedger in one shared workspace.
These rules are absolute. Violating them destroys other agents' work.

## File ownership

1. Create or edit ONLY the paths listed under "You own" in your brief. Not
   one file more — no "drive-by fixes", no formatting passes, no renames
   outside your list.
2. You may READ anything in the repo. Follow `docs/ARCHITECTURE.md`,
   `docs/DATA-MODEL.md` and `docs/DECISIONS.md` (tie-breaker) exactly; imitate
   the reference module named in your brief. Invent no new conventions,
   helpers, folders, or dependencies. Zod is v4 — use v4 APIs. When unsure of
   a library API, read its docs in node_modules, not memory.
3. If you believe a file outside your ownership must change (schema, lib,
   config, another module), STOP work on that item and report the needed
   change in your final message instead. The orchestrator will make it.
4. Never touch: `package.json`, the lockfile, any config file, `src/db/schema/**`,
   `src/lib/**`, `src/adapters/**`, `src/components/ui/**`, `src/app/globals.css`,
   root/app-shell layouts, `.env*`, `docker-compose.yml`, `Dockerfile*`.

## Commands

5. NO package installs or removals, ever (`pnpm add/remove/install` is
   forbidden, even if something seems missing — report it instead).
6. NO vitest, NO playwright, NO dev servers, NO `pnpm build`, NO drizzle-kit.
   The shared DB and low-RAM box make parallel runs destroy each other.
7. The ONLY check commands you may run:
   - `pnpm exec tsc --noEmit`
   - `pnpm exec eslint <your own files>`

## Server code (every action / route handler you write)

8. Validate ALL input with zod before use.
9. Call the canonical guard from `src/lib` (session + role + org) at the top
   of every action; scope EVERY query by `organisationId`. No exceptions.
10. Stock changes go ONLY through the canonical movement poster in
    `src/modules/stock` (or produce equivalent) — never insert into movement
    tables directly, never update a quantity column. Stock can never go
    negative; corrections are new movements.
11. Write an `audit_log` row for every create, update, override and approval
    via the lib helper.
12. Money is integer kobo (bigint). Quantities are stored in the item's base
    unit (kg, g, L, mL, pieces). Timestamps stored UTC, displayed
    Africa/Lagos. Use the lib converters; never hand-roll.
13. Workers must never receive price/cost fields — use the price-stripping
    helpers / role-aware selects from the lib.

## UI code

14. Mobile-first at 360 px, large touch targets (≥44 px), works gloved.
15. Every screen has loading, empty and error states.
16. Use the design tokens and `src/components/ui` primitives only — no raw
    hex colors, no new CSS files, no inline style objects.
17. Forms: react-hook-form + zodResolver with the SAME zod schema the action
    uses (import it from the module's `schema.ts`).

## Reporting

18. Your final report must list: every file you created/edited; the EXACT
    commands you ran with their REAL exit codes (capture them — do not pipe
    through anything that masks `$?`); every TODO, assumption, or needed
    out-of-ownership change.
19. Never fabricate or round up a result. "tsc had 3 errors in files I don't
    own" is a fine report; a false "all green" is not. If you ran nothing,
    say so.
