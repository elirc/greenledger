# Brief P1-A — Auth screens + staff management

Read first, in order: `agents/_RULES.md` (absolute rules), `docs/ARCHITECTURE.md` (§3 auth/tenancy,
§4 actions, §5 route map/UI states), `docs/DATA-MODEL.md` (§2 auth tables), `docs/DECISIONS.md`.
Reference module to imitate: `src/modules/suppliers/` and its pages under `src/app/(app)/store/suppliers/`.

## You own (create/edit ONLY these)
- `src/app/(auth)/sign-in/page.tsx`, `src/app/(auth)/verify/page.tsx`, `src/app/(auth)/layout.tsx`
- `src/modules/users/` (actions.ts, queries.ts, schema.ts, components/)
- `src/app/(app)/settings/page.tsx` (settings hub: links to Users, Farm structure, Billing placeholder)
- `src/app/(app)/settings/users/**` (list, add, edit pages + loading/error)
- `tests/unit/rbac.test.ts`

## Tasks
1. **Sign-in** (`/sign-in`): phone-first form (Nigerian format; normalize to E.164 `+234...` —
   accept `0803...`, `803...`, `+234803...`). Submit → `authClient.phoneNumber.sendOtp({ phoneNumber })`
   → route to `/verify?phone=...`. Toggle link "Use email and password instead" revealing
   email+password form → `authClient.signIn.email(...)`. On success `router.push('/')`.
   Mock-mode hint box: when `process.env.NEXT_PUBLIC_APP_URL` host is localhost, show
   "Dev build: the code is always 123456".
2. **Verify** (`/verify`): 6-digit OTP input (single input, inputMode numeric, autoComplete
   one-time-code), resend button with 60s countdown, submit →
   `authClient.phoneNumber.verify({ phoneNumber, code })` → on success `router.push('/')`.
   Handle error states (wrong code, too many attempts) with clear messages.
3. **(auth) layout**: centered card on the green-tinted background, GreenLedger wordmark, no nav.
4. **Staff management** (`/settings/users`, roles owner only — enforce `roles: ['owner']` in every
   action; page queries via `requireMember({ roles: ['owner'] })`):
   - List members: name, phone, role badge, assigned greenhouses count (workers), joined date.
   - **Add staff**: form (name, phone, role select, and when role=worker a greenhouse multi-select
     from the org's greenhouses). Server action `createStaff`: normalize phone; create the `user`
     row directly in the DB (id `crypto.randomUUID()`, temp email `<digits>@phone.greenledger.local`,
     `phoneNumberVerified` false), create `member` row with the role, insert `greenhouse_assignments`
     for workers — all in one transaction + audit row. If a user with that phone already exists,
     just add the membership. (Better Auth reads these same tables; the person then signs in by
     phone OTP. Do NOT use Better Auth invitation APIs — email-centric, wrong fit.)
   - **Edit**: change role, change greenhouse assignments, remove from farm (delete member +
     assignments; never delete the user row). All audited.
5. `tests/unit/rbac.test.ts`: assert the permissions matrix constants — ROLES content, ROLE_LABELS,
   and that `roles.worker` statements contain only `logs:create` (import from `src/lib/permissions`).

## Conventions that will fail review if missed
- Every action via `defineAction` with zod schema in `src/modules/users/schema.ts`; forms use the
  same schema with react-hook-form + zodResolver.
- Every list page: `loading.tsx`, `error.tsx`, EmptyState when zero rows. Touch targets ≥44px.
- Phone normalization helper lives in your `schema.ts` (pure, exported) — unit-test-friendly.
- No price/money anywhere in this module.
