# Brief P3-C — Scouting (photos), tasks + calendar, Phase-3 seed + tests

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§4, §5, §7 storage adapter),
`docs/DATA-MODEL.md` (§4.3, §4.10, §6), `docs/DECISIONS.md`. Imitate `src/modules/suppliers/**`.
Foundation (read, never edit): `src/adapters/storage` (put/getUrl), `src/app/api/uploads/[...key]/route.ts`
(serves files), `src/modules/cycles/{status,transplant}.ts`, seed structure `src/db/seed/*`.

## You own
- `src/modules/scouting/` (schema.ts, queries.ts, actions.ts, components/)
- `src/modules/tasks/` (schema.ts, queries.ts, actions.ts, components/)
- `src/app/(app)/cycles/[id]/scouting/**` (list + new under the cycle)
- `src/app/(app)/tasks/**` (list + calendar toggle + new/edit)
- `src/db/seed/05-crops.ts` + its one wiring line in `src/db/seed/index.ts`
- `tests/unit/cycle-status.test.ts`

## Tasks
1. **Scouting** (roles OMW; workers assigned-greenhouse only): list under the cycle (date,
   pest/disease, severity badge, thumbnail, action taken); "Log scouting" form: date, pest or
   disease text, severity (low/med/high), photo (one image, <input type=file accept=image/*
   capture=environment>), action taken. Server action receives FormData: validate type
   (jpeg/png/webp) + size ≤5MB, `storage.put` under key `scouting/<orgId>/<uuid>.<ext>`,
   insert `files` row + scouting_logs row (schema takes clientId uuid as PK) in one
   transaction + audit. Thumbnails via `/api/uploads/<key>` (plain <img>, lazy).
2. **Tasks** (all roles; workers: only tasks assigned to them or their greenhouses):
   - List: open tasks sorted by due date (overdue first, red badge), done under a collapsed
     section; filters: mine / all (OM only), greenhouse.
   - Calendar: month grid built with date-fns (no external calendar lib), dots per day,
     tapping a day lists its tasks; prev/next month.
   - Create/edit (OM; assign to user select + optional greenhouse/cycle, due date, description).
   - Complete action (any role on their own/assigned tasks): schema takes clientId
     (idempotent complete is fine to re-run), sets status done + completedAt/By, audit.
   - Reopen + cancel (OM).
3. **Seed `05-crops.ts`** (deterministic; follow DATA-MODEL §6): varieties (Padma F1, Cobra F1
   tomato ~4.5kg/75d/10wk; California Wonder, Habanero Red, Tatashe, Chilli Long Slim pepper
   ~2.0kg/70d/12wk); 2 finished nursery batches + 1 open; 4 ACTIVE cycles (GH1 Padma growing,
   GH2 Cobra harvesting, GH3 California Wonder harvesting, GH4 Habanero growing) with
   transplant dates 10–14 weeks ago — create them via `transplantToCycle` inside
   db.transaction with a hand-built Ctx (see how 04-items builds one), then bump GH2/GH3 to
   harvesting via direct status update; plant losses sprinkled so alive ≈ 950–990 (insert
   losses THROUGH the losses action handler if exported, else direct inserts + matching
   plants_alive decrements in the same tx — the invariant alive = transplanted − Σlosses MUST
   hold); 2 planned cycles (GH5, GH6), 1 closed historic (GH1 last season); ~15 tasks in
   mixed states incl. overdue. NOTE: P3-A/P3-B build the modules in parallel — if an action
   you want isn't importable yet, write the seed against direct inserts but KEEP the
   invariant, and say so in your report.
4. **`tests/unit/cycle-status.test.ts`**: full matrix of canTransition/assertTransition
   (every from→to pair), ACTIVE_CYCLE_STATUSES content, DomainError codes.

Check commands: `pnpm exec tsc --noEmit` (your files only) + `pnpm exec eslint <your files>`.
Report files, exact commands + real exit codes, assumptions, out-of-ownership needs.
