# GreenLedger — Binding reconciliation decisions

DATA-MODEL.md and ARCHITECTURE.md were written in parallel. Where they differ, THIS file wins.
Builders: read ARCHITECTURE.md for conventions, DATA-MODEL.md for tables, this file for the tie-breaks.

1. **Module layout**: `src/modules/<feature>/{actions.ts, queries.ts, logic.ts, schema.ts, components/}`
   per ARCHITECTURE §1. BUILD-PLAN's `src/server/**` paths are superseded — read them as
   `src/modules/<feature>/`.
2. **Role codes**: `owner | manager | storekeeper | worker` (ARCHITECTURE wins over DATA-MODEL's
   `farm_manager`). Display names: Owner, Farm manager, Storekeeper, Worker. Stored in Better Auth
   `member.role`.
3. **Offline idempotency table**: named `sync_ops`, with the richer columns from DATA-MODEL's
   `client_mutations`: `id uuid PK` (the client mutation id), `organisation_id`, `user_id`, `kind text`,
   `status text ('applied'|'failed')`, `result jsonb?`, `error text?`, `applied_at timestamptz default now()`.
   Insert-first `ON CONFLICT (id) DO NOTHING`. NO per-table `client_id` columns — offline-created
   business rows simply use the client UUID as their PK where the op maps 1:1 to a row.
4. **Worker greenhouse scoping**: table `greenhouse_assignments` (org, user_id, greenhouse_id) per
   DATA-MODEL — NOT `member_greenhouses`.
5. **Tenant/billing**: Better Auth `organization` table gets NO business columns (DATA-MODEL wins).
   Billing state lives in `subscriptions`; `requireMember` joins it and computes
   `org.status: 'trial' | 'active' | 'read_only'` from the read-only predicate in DATA-MODEL §4.12.
6. **Transfer pairing column**: `transfer_id` (not `transfer_group`).
7. **Safety state**: `application_items` snapshot `phi_days_snapshot`/`rei_hours_snapshot`;
   `applications` store their own `entry_safe_at`/`harvest_safe_date`; AND `greenhouses` carry
   denormalized `entry_safe_at timestamptz?` + `harvest_safe_date date?` updated with
   GREATEST(existing, new) inside the application-posting transaction (spec: "a spray sets the
   greenhouse's entry-safe time and harvest-safe date"). Status chips & harvest guard read the
   greenhouse columns.
8. **notifications**: per-user rows (`user_id` NOT NULL), plus `dedup_key text?` with unique index
   `(organisation_id, user_id, dedup_key) WHERE dedup_key IS NOT NULL`; scan jobs insert
   `ON CONFLICT DO NOTHING`. Types are text constants (DATA-MODEL's list).
9. **Units**: five base units (`kg, g, l, ml, pcs`) per DATA-MODEL; items pick ONE as their base;
   conversion only within a dimension (g↔kg, ml↔l).
10. **Dates lib**: date-fns v4 + **date-fns-tz** (`formatInTimeZone`, `toZonedTime`) — NOT
    `@date-fns/tz` (not installed). All display through `src/lib/dates.ts`.
11. **Zod v4 is installed** (4.6.x). Use v4 APIs (`z.uuid()`, `z.email()`, `z.enum([...])`,
    `error` param instead of `message` where applicable). Forms share schemas from
    `src/modules/<f>/schema.ts`.
12. **Drizzle**: `casing: 'snake_case'` in both drizzle.config.ts and the client; camelCase TS keys.
    Money columns `bigint({ mode: 'number' })`; rates `numeric(16,6)` read as string → parse.
13. **Installed versions to code against** (do not assume older APIs): next 16.4, react 19.3,
    better-auth 1.7.7, drizzle-orm 0.45, zod 4.6, pg-boss 12.x, @tanstack/react-table 9.x,
    recharts 3.x, serwist 9.5, dexie 4.4, @react-pdf/renderer 4.9, exceljs 4.4, tailwindcss 4.3.
14. **TypeScript pinned 5.9.3** (do not upgrade to 7.x — its tsc output is unreliable on this box).
15. **ID types (final)**: the Better Auth generator emitted `text` PKs for user/session/account/
    verification/organization/member/invitation — we keep them. Therefore every business-table
    FK to `organization.id` (`organisation_id`) or `user.id` is `text`. Business-table PKs and
    business-to-business FKs are `uuid`. Values are UUIDs either way
    (`advanced.database.generateId = crypto.randomUUID`).
16. **`server-only` package is NOT used** (the worker is a plain tsx process and would crash on
    import). Boundary rules instead: client components never import `@/db` or `*/queries.ts`;
    the worker imports only `@/db`, `@/adapters/*` and pure libs (`money/units/dates/alerts`) —
    never `@/lib/guard`, `@/lib/auth` or `src/modules/*`.
17. **Handlers layer (Phase 6)**: offline-capable modules will expose their `(input, ctx)`
    handlers from a plain `handlers.ts` (NOT 'use server') so the /api/sync route can dispatch
    to them; `actions.ts` wraps the same handlers with defineAction. Until then, replayed
    clientIds surface as pg 23505 → `DUPLICATE` via the movement PK (belt-and-braces path);
    the `sync_ops` insert-first contract arrives with Phase 6.
18. **Mock SMS/email assertions**: mock drivers log one line and push to an exported in-memory
    array (`sentSms`, `sentEmails`) — they do NOT write notifications rows (adapters have no org
    context). The notifications table is written by jobs/actions, not adapters.
