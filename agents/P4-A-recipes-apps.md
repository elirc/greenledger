# Brief P4-A — Recipes + application logging

Read first: `agents/_RULES.md`, this file, `docs/ARCHITECTURE.md` (§4, §5), `docs/DATA-MODEL.md`
(§4.6), `docs/DECISIONS.md`. Imitate `src/modules/suppliers/**`.
Foundation (read, never edit): `src/modules/applications/logic.ts` (scaleRecipe, computeSafety),
`src/modules/applications/post.ts` (postApplication — THE posting path), `src/modules/stock/*`.

## You own
- `src/modules/recipes/` (schema.ts, queries.ts, actions.ts, components/)
- `src/modules/applications/` EXCEPT logic.ts and post.ts (add schema.ts, queries.ts,
  actions.ts, components/)
- `src/app/(app)/recipes/**` (list, new, [id] edit)
- `src/app/(app)/applications/**` (list, new)

## Tasks
1. **Recipes** (owner/manager): CRUD — name, type (fertigation|spray), description, active
   flag; lines: item combobox (fertigation → fertilisers+consumables; spray → agrochemicals;
   both allow any category, filtered by default) + quantity per 1,000 L with the item's unit
   label. Deleting a recipe used by applications → deactivate instead (IN_USE pattern like
   greenhouses). Duplicate-name → friendly DUPLICATE field error.
2. **Log application** (`/applications/new`, roles owner/manager/worker — workers only
   assigned greenhouses, call assertGreenhouse): form flow — greenhouse → active cycle in it
   (auto-selected when only one) → type → optional recipe picker (filtered by type) → water
   volume litres → live preview table of scaled lines via `scaleRecipe` (editable: user can
   adjust quantities or add/remove lines before posting) → store select (default store) →
   applied-at datetime (default now) → notes. For sprays show a notice computed client-side
   from the selected items' PHI/REI: "This spray will lock entry until … and harvest until …".
   Action (schema takes `clientId: z.uuid()` passed as post id): `db.transaction(tx =>
   postApplication(tx, ctx, {...}))`. Map NO_STOCK / INSUFFICIENT_STOCK / EXPIRED_BATCH to
   clear user messages naming the item. Workers may log applications but see NO costs anywhere.
3. **Applications list** (`/applications`): filterable by greenhouse + type; rows show date,
   greenhouse+cycle code, type badge, recipe name or "custom", volume, operator; spray rows
   show the safety windows (entry-safe until / harvest-safe from). Detail can be a sheet or
   an expandable row — include the issued lines (item, quantity, batch) from
   application_items; costs ONLY via ctx.canSeeMoney.
4. Queries: `listApplications(ctx, filters?)`, `getApplication(ctx, id)`,
   `listRecipeOptions(ctx, type?)`, `getApplicationFormRefs(ctx)` (greenhouses workers may
   use, active cycles, recipes, stores, items with phi/rei for preview) — all org-scoped,
   money-stripped for workers.

Check commands: `pnpm exec tsc --noEmit` (your files only) + `pnpm exec eslint <your files>`.
Report files, exact commands + real exit codes, assumptions, out-of-ownership needs.
