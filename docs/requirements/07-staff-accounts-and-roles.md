# Staff accounts & least-privilege roles

**Effort: L** (design + schema helpers; policy cutover is XL and is sequenced separately)

> Design spec produced during the July 2026 audit continuation, from the owner
> requirements note and the integration plan in `README.md`.
> **Design only — not yet implemented. Do not apply schema from this document
> until the acceptance criteria and owner decisions below are signed off.**

## Summary

Today XERT has exactly two account kinds: `member` and `admin`.
`public.is_admin()` is a STABLE SECURITY DEFINER helper that returns true when
`profiles.role = 'admin'` (`src/supabase/booking_schema.sql`,
`src/supabase/rls_policies.sql`). Roughly every admin RLS policy and admin RPC
in `supabase/migrations/` and `src/supabase/` calls it. The Command Centre gate
is the same binary: `SupabaseAuthContext` exposes `isAdmin: profile?.role ===
'admin'`, and `AdminRoute` trusts that flag.

That binary is now a blocker. Spec 02 needs a coach who can see a
session-scoped safety band without inheriting clinical-record access. Spec 03
needs a coach login that sees only that coach's clients and rent statements.
Spec 05 needs a front-desk operator who can clear a door exception without also
holding Stripe refunds and the payment activation switch. Specs 01 and 04
already note the missing coach role and work around it by treating "coach" as
"whoever is signed in as admin".

This spec defines the least-privilege role model those features share: a small
fixed role set, a capability matrix, an invite/provisioning flow, and a
migration plan that keeps `is_admin()` true for today's owners for the entire
compatibility window so a careless cutover cannot lock the owner out of
production admin.

## Recommendation

**ONE approach: expand `profiles.role` to a fixed staff set, keep the stored
value `'admin'` as the owner role for compatibility, add narrow helper
functions for the new roles, and leave every existing `is_admin()` call site
untouched until each policy/RPC is deliberately remapped.**

Product language vs stored values:

| Product label | `profiles.role` value | Notes |
|---|---|---|
| Member | `member` | Default for every new signup. Unchanged. |
| Front desk | `front_desk` | Door desk, roll-call assist, member lookup. New. |
| Coach | `coach` | Class delivery + own-client scope. New. |
| Ops (optional) | `ops` | Day-to-day operations without money or clinical detail. Deferred unless the owner wants it in v1. |
| Owner | `admin` | **Keep the stored value `admin`.** UI copy says "Owner". Renaming the column value is a separate, later cutover — never part of the first migration. |

Why this and not the alternatives:

1. **Do not invent a free-form ACL editor.** A gym this size needs four (or five)
   named roles with a published matrix, not a permission grid an owner can
   misconfigure into "front desk can refund Stripe". Capabilities are derived
   from role in code (`has_capability(...)`), not edited per user in v1.

2. **Do not rename `admin` → `owner` in the first migration.** Every policy,
   every Vercel admin route that checks `profiles.role === 'admin'`, and
   `src/lib/memberAdmin.js`'s whitelist would have to flip in the same deploy.
   Miss one and the owner is locked out. Keep the stored value; change the
   label in the UI.

3. **Do not make coaches keep `role = 'member'` (spec 03's workaround).** Spec
   03 avoided a third role because this document did not exist. That workaround
   is superseded here. Commercial coach identity (`coach_engagements`, ABN,
   rent) stays on the engagement spine from spec 03; login privilege is
   `profiles.role = 'coach'`. A person can be both a paying member and a coach —
   the role is what they may do as staff; membership entitlements stay on
   `credit_batches` / billing as today.

4. **Do not give the lobby kiosk a staff login.** Spec 05 is right: the
   `/checkin` kiosk authenticates with a device key and never holds a Supabase
   session. Front-desk *role* is for a staffed phone or back-of-house iPad used
   to resolve exceptions, run manual search, and take roll — not for the
   always-on lobby scanner.

5. **`is_admin()` must keep meaning "owner" and must never become true for
   coach or front desk.** Spec 02 already depends on this. During the
   compatibility window the function body may be rewritten as a derived check
   over the new model, but its truth set for existing owner accounts must be
   identical before and after the rewrite. Coaches inherit nothing from the
   ~fifty existing `is_admin()` policies.

## Capability matrix

Capabilities are the unit sibling specs should name in their RPC guards.
Roles grant a fixed set. "—" means never; "scoped" means row- or
time-bounded as noted.

| Capability | Member | Front desk | Coach | Ops (if enabled) | Owner (`admin`) |
|---|---|---|---|---|---|
| Book / manage own classes | yes | yes* | yes* | yes* | yes* |
| Open Command Centre (full) | — | — | — | partial | yes |
| CMS / site content / coaches marketing | — | — | — | — | yes |
| Products, Stripe refunds, payment switch | — | — | — | — | yes |
| Grant / adjust credits | — | limited† | — | limited† | yes |
| Member directory (name, email, phone) | — | desk lookup | own clients / own class roster | yes | yes |
| Roll call / attendance | — | yes | own assigned class | yes | yes |
| Door exceptions, excuse no-show, check-out | — | yes | — | yes | yes |
| Register / revoke kiosk devices | — | — | — | — | yes |
| Clinical health detail (APSS answers, etc.) | self only | — | — | — | audited RPC only |
| Safety band + activity advice + emergency contact | self | compliance flags only‡ | scoped to assigned class window | compliance flags only‡ | yes (detail still audited) |
| Set activity advice / record doctor clearance | — | — | — | — | yes |
| Coach clients & facility slots (spec 03) | — | — | own engagement | — | all |
| Own rent statements / invoices (spec 03) | — | — | own | — | all |
| Invite / change staff roles | — | — | — | — | yes |
| View role-change + health-access audit | — | — | — | role-change only | yes |

\* Staff accounts remain ordinary bookable members for their own training.
† Front desk / ops may grant a small, settings-capped courtesy credit (e.g. ≤ 2
sessions) with a mandatory reason; anything larger stays owner-only. Exact cap
is an owner decision.
‡ Front desk and ops see `booking_blocked`, waiver/screening currency, and
`safety_band` when it affects the door ("not screened" / "clearance pending").
They do **not** see `activity_advice`, conditions, medications, or APSS answers.

### Who sees what — the three surfaces sibling specs care about

**Health data (spec 02).** Clinical tables stay unreadable through PostgREST for
every role, including owner. Owner reads detail only through
`admin_member_health_record(...)` with a mandatory reason and an append-only
access log. Coach reads `staff_session_safety_roster(session_id)` only for
classes where they are the assigned coach and only inside the class time window
(spec 02's start−12h .. end+12h). Front desk never receives clinical detail;
door decisions use compliance flags only.

**Coach clients (spec 03).** A coach sees facility slots, assigned PT requests,
and rent artefacts for `current_coach_id()` / their engagement only. Owner sees
all engagements. Front desk does not see rent or another coach's client list.
`public.coaches` remains the public marketing row; sensitive commercial columns
stay on `coach_engagements`.

**Kiosk / door (spec 05).** The lobby device keeps using the device-key →
service-role path. Front-desk *people* use authenticated RPCs for manual
check-in, exception resolution and roll-call pre-fill. Owner registers devices
and edits `check_in_settings`. Coach is not a door operator in v1 (they already
have the class roster); revisit only if the owner wants coaches covering desk
shifts.

## Data model (sketch — do not apply yet)

Target migration name when implementation starts:
`supabase/migrations/YYYYMMDDHHMMSS_staff_roles.sql`, mirrored to
`src/supabase/staff_roles_upgrade.sql`. This section is a contract for
implementers, not a paste-ready migration.

### 1. Expand the role domain without renaming owners

```sql
-- Conceptual. Exact migration must also widen admin_role_changes checks and
-- admin_set_role's allow-list in the same transaction as the profiles check.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('member', 'front_desk', 'coach', 'ops', 'admin'));
```

If there is no existing named check constraint (today `role` is unconstrained
text with application-level allow-lists), add one. Backfill is a no-op for
current rows: every owner already has `role = 'admin'`.

### 2. Compatibility definition of `is_admin()`

First migration **rewrites the body only if needed**, preserving the truth set:

```sql
-- Compatibility window: "admin" means owner. Truth set for existing owners
-- must match the pre-migration function exactly.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'          -- owners only; never coach / front_desk / ops
  );
$$;
```

That is intentionally the same predicate as today. The "derived view" promise
in the integration plan is satisfied by making this the *documented* ownership
check that later can read a `staff_assignments` table **only after** every
owner row is backfilled and a pre-flight assertion has verified
`is_admin()` still returns true for each known owner id. Until that day, do
not introduce a second source of truth.

Optional later shape (phase B, after policy audit):

```sql
-- ONLY after staff_assignments is backfilled and verified.
-- select exists (
--   select 1 from public.staff_assignments sa
--   where sa.user_id = auth.uid()
--     and sa.role = 'admin'
--     and sa.revoked_at is null
-- );
```

Phase B is explicitly out of the first ship. The first ship must be boring.

### 3. New helpers (additive; nothing calls them until sibling features land)

```sql
create or replace function public.is_staff()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('front_desk', 'coach', 'ops', 'admin')
  );
$$;

create or replace function public.is_coach()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('coach', 'admin')
  );
$$;

create or replace function public.is_front_desk()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('front_desk', 'ops', 'admin')
  );
$$;

-- Fixed matrix in SQL so RPCs do not re-implement it. v1: no per-user grants.
create or replace function public.has_capability(p_capability text)
returns boolean language sql security definer stable set search_path = public as $$
  select case p_capability
    when 'command_centre' then public.is_admin()
    when 'money_admin' then public.is_admin()
    when 'health_clinical' then public.is_admin()
    when 'health_roster_flags' then public.is_coach()  -- coach + owner
    when 'door_desk' then public.is_front_desk()
    when 'roll_call' then public.is_front_desk() or public.is_coach()
    when 'credit_courtesy_grant' then public.is_front_desk() or public.is_admin()
    when 'staff_invite' then public.is_admin()
    else false
  end;
$$;
```

Revoke/grant pattern matches existing helpers: revoke from `public, anon`;
grant execute to `authenticated`.

### 4. Extend `admin_set_role` without weakening lockout guards

Extend allow-list to the new roles. Keep and generalise the existing guards from
`src/supabase/admin_role_safety_upgrade.sql`:

- `ADMIN_ONLY` — only owners may change roles.
- `CANNOT_DEMOTE_SELF` — an owner cannot remove their own owner role.
- `CANNOT_DEMOTE_LAST_ADMIN` — cannot leave the gym with zero `role = 'admin'`
  rows.
- Widen `admin_role_changes.previous_role` / `new_role` checks to the new enum.
- New: `CANNOT_GRANT_OWNER_WITHOUT_MFA` (application-level until Supabase MFA
  assurance is wired) — see open questions.
- New: promoting to any staff role requires `staff_profiles` / invite acceptance
  (below) so a typo in the member directory cannot silently mint a coach.

### 5. Staff record + invite (lightweight)

```text
staff_invites
  id, email, intended_role, invited_by, token_hash, expires_at,
  accepted_at, accepted_user_id, revoked_at, created_at

staff_profiles   -- optional 1:1 extension; avoid stuffing HR fields onto profiles
  user_id, display_name, job_title, emergency_phone, started_on,
  ended_on, notes_internal, updated_at
```

`staff_invites` is owner-write, accept-via SECURITY DEFINER RPC. On accept: set
`profiles.role` to `intended_role`, insert `admin_role_changes`, mark invite
accepted. Expired or revoked tokens no-op.

Link to spec 03: when `intended_role = 'coach'`, accepting an invite does **not**
by itself create a `coach_engagements` row. The owner still attaches the login
to a marketing `coaches` row / engagement in the coach-rent admin UI. A coach
login without an engagement can open `/coach` safety roster for assigned
classes (once `coach_profile_id` is set) but cannot see rent data — fail closed.

### 6. Capability marker

```sql
insert into public.xert_schema_capabilities (capability)
values ('staff_roles') on conflict (capability) do nothing;
```

Operations Health and release checks already know this pattern.

## Invite / provisioning flow (sketch)

1. **Owner opens Members → Staff** (new admin section). Enters email + role
   (`front_desk` | `coach` | `ops` | `admin`). Cannot invite `admin` unless a
   second-owner confirmation path is enabled (default: allow, but require the
   existing owner to re-enter password / MFA).
2. System creates `staff_invites` row, emails a magic link
   (`/staff/accept?token=…`) via the existing transactional email path the
   product already uses for notices — or, if email send is not ready, shows a
   copy-once invite URL in the admin UI (same pattern as kiosk device keys in
   spec 05).
3. Recipient signs in or registers with that email. Accept RPC checks token,
   email match, expiry; sets role; writes `admin_role_changes`.
4. **Existing member promotion:** owner may also run "Make staff" on a profile
   already in the directory (extends today's `admin_set_role`). Same audits and
   last-owner guards.
5. **Offboarding:** owner sets role back to `member` (or sets
   `staff_profiles.ended_on` and forces `member`). Revokes open invites. Does
   not delete the auth user — they may still train. Coach offboarding also ends
   or suspends `coach_engagements` (spec 03) as a separate explicit action so
   rent and login cannot silently diverge.
6. **MFA:** before go-live of health (spec 02) or door desk (spec 05), every
   `admin` / `coach` / `front_desk` account must have MFA enabled. Enforce in
   app gates (`StaffRoute` / `AdminRoute`) rather than in Postgres on day one.

## Backend / app touchpoints (when implemented)

Not built in this spec. Inventory for the implementation PR:

| Area | Change |
|---|---|
| `admin_set_role` + `admin_role_changes` | Widen allow-list; keep lockout guards |
| `src/lib/memberAdmin.js` | Allow-list new roles; UI labels "Owner" for `admin` |
| `src/lib/SupabaseAuthContext.jsx` | Expose `isAdmin`, `isStaff`, `isCoach`, `isFrontDesk`, `role` |
| `AdminRoute.jsx` | Remains owner-only (`isAdmin`) |
| New `StaffRoute` / `CoachRoute` / `FrontDeskRoute` | Gate `/coach`, desk tools; do not ship Admin Command Centre chunk to them |
| Vercel admin APIs | Keep `profiles.role === 'admin'` for money paths; add explicit checks for desk endpoints |
| Spec 02 RPCs | `is_staff` / `is_admin` as already drafted — align names with this doc |
| Spec 03 | Drop "do not add coach role"; bind `coach_engagements.user_id` to users with `role = 'coach'` (owner may still view as `admin`) |
| Spec 05 | Desk RPCs move from `is_admin()` to `has_capability('door_desk')`; device registration stays `is_admin()` |
| Spec 04 | PB verify may use `has_capability('roll_call')` or owner; stop pretending only admin exists |
| iOS `RootView` | Route by role: owner → Command Centre, coach → coach surfaces, front desk → door/desk, member → member tabs |

## Non-goals

- **No per-user custom permission editor** in v1.
- **No rename of `admin` → `owner` in the database** in v1.
- **No lobby kiosk signed in as a staff user.** Device key only.
- **No unattended door / strike control** (spec 05 non-goal; unchanged).
- **No HRIS:** leave, payroll, certifications tracking — out of scope.
- **No automatic demotion on password reset or email change.**
- **No granting staff roles from iOS in v1** unless the web admin path ships first.
- **No weakening of `CANNOT_DEMOTE_LAST_ADMIN`.** Ever.
- **No schema application from this document alone.** Implementation is a
  separate, rehearsed change with the migration plan below.

## Migration / compatibility plan (must not lock the owner out)

The risk named in `README.md`: every existing RLS policy calls
`public.is_admin()`. A migration that clears roles, renames `admin`, or
redefines `is_admin()` against an empty assignments table takes production
admin to zero.

### Hard rules

1. **Pre-flight snapshot.** Before any role migration in a live project, record
   the set of `profiles.id` where `role = 'admin'`. The migration aborts if
   that set is empty.
2. **Additive first.** Widen checks and add helpers. Do not revoke owner rows.
3. **`is_admin()` truth set unchanged** for those ids in the same transaction
   (assert with a `do $$ … $$` block that raises `OWNER_LOCKOUT_ABORT` if any
   snapshotted owner would see `is_admin()` false under a stolen `auth.uid()`
   simulation, or — simpler — assert row counts:
   `count(*) filter (where role = 'admin')` is unchanged by the DDL).
4. **No mass role rewrite.** Do not `update profiles set role = 'owner'`.
5. **Deploy app allow-lists before or with the migration**, never after: if the
   DB accepts `coach` but `memberAdmin.js` still throws on anything except
   `member|admin`, the owner cannot manage the new roles from the UI (safe but
   confusing). Money APIs must keep treating only `admin` as privileged.
6. **Sibling features adopt helpers; legacy policies stay on `is_admin()`**
   until each is migrated and verified. There is no big-bang policy rewrite.
7. **Rollback.** Restoring the previous `is_admin()` body and re-narrowing
   allow-lists must be possible without data loss. New role values on profiles
   can remain (`front_desk` / `coach` rows simply stop matching old allow-lists
   and become ordinary members for gating purposes until fixed forward).
8. **Rehearse on a Supabase branch** with a copy of production roles before
   production apply. Manual test: owner session still loads Command Centre;
   `admin_set_role` still demotes/promotes with last-admin guard; a test coach
   account cannot call `admin_grant_credits_v2` or open payment settings.

### Suggested phases

| Phase | What ships | Owner impact |
|---|---|---|
| A — helpers dark | Widen enum, `is_staff` / `is_coach` / `is_front_desk` / `has_capability`, extend `admin_set_role`, capability marker | None visible. Owner still `admin`. |
| B — admin UI | Staff section, invite/promote/demote, "Owner" label | Owner can create staff without giving full admin. |
| C — adopt in 02 / 03 / 05 | Those features' RPCs and routes use the new helpers | Real least privilege. |
| D — optional policy harvest | Replace selected operational `is_admin()` call sites with `has_capability(...)` where front desk should operate | Only after C is stable. |
| E — optional rename | `admin` → `owner` value + dual-read `is_admin()` | Separate project; not required. |

Phase A must land before implementation work starts on 02, 03, or 05.

## Security, privacy and compliance

- Staff roles expand the set of people who can see member PII (phone, email,
  emergency contact, safety band). MFA + offboarding checklist are mandatory
  before health enforcement or door desk go live.
- Clinical health remains owner-only via audited RPC; this role model is what
  makes that promise believable.
- Segregation of duties: front desk can run the door; only owner can move money
  and publish legal/health documents.
- Every role change continues to land in `admin_role_changes` (append-only
  audit). Invite accept is a role change and must write the same ledger.
- Do not store invite tokens in plaintext; store a hash. Show the raw token
  once.
- Coaches who are also members keep one auth user; privilege is role-based, not
  a second login. Prefer that over shared owner passwords on the desk iPad.

## Acceptance criteria

1. **Owners unbroken.** After Phase A on a branch with production-like data,
   every previously-admin profile still satisfies `is_admin()` and can load the
   Command Centre and a representative money RPC (`admin` payment health or
   credit grant) without code changes to those RPCs.
2. **Lockout guards hold.** Attempting to demote the last owner raises
   `CANNOT_DEMOTE_LAST_ADMIN`. Attempting to demote self raises
   `CANNOT_DEMOTE_SELF`.
3. **Coach isolation.** A user with `role = 'coach'` receives
   `is_admin() = false`, cannot execute money admin RPCs, cannot select
   clinical health tables through PostgREST, and can only call
   coach-scoped RPCs once spec 02/03 wire them.
4. **Front desk isolation.** A user with `role = 'front_desk'` can be granted
   door-desk capabilities without `is_admin()` becoming true; Stripe refund and
   payment-switch paths still return 403 / `ADMIN_ONLY`.
5. **Matrix is the contract.** `has_capability(...)` matches the table in this
   document; a unit test freezes the matrix (same style as
   `test/booking-error-contract.test.js`).
6. **Invite audit.** Accepting an invite writes `admin_role_changes` with the
   correct previous/new roles and actor.
7. **Sibling specs unblocked.** Specs 02, 03 and 05 can reference this role set
   and helpers by name without each inventing a private role enum.
8. **Ops is optional.** If the owner declines `ops`, the check constraint and
   matrix simply omit it; no dead UI.

## Open questions for the owner

Each has a recommended default; if unanswered, build the default.

1. **Do you need an Ops role in v1, or only Owner / Coach / Front desk?**
   *Recommended:* omit `ops` until a second non-coach staffer needs Command
   Centre slices without money access. Three staff roles plus member is enough
   to unblock 02, 03 and 05.

2. **May front desk grant courtesy credits?**
   *Recommended:* yes, hard-capped (≤ 2 sessions per grant, daily cap per
   staffer), mandatory reason, full credit-grant audit. Owner handles packs and
   refunds.

3. **May coaches take roll call for their own class?**
   *Recommended:* yes, once Phase C lands — attendance is operational, not
   financial. Spec 02 already leaned this way. Owner keeps correction /
   credit-release paths.

4. **Second owner accounts.**
   *Recommended:* allow at most a handful of `admin` rows; MFA required; never
   share one owner login across phones. Last-owner guard stays absolute.

5. **Coach without a facility-rent engagement.**
   *Recommended:* allowed for employed/salaried coaches who only need the
   safety roster and roll call. Rent features stay engagement-gated (spec 03).

6. **Rename `admin` → `owner` in the database later?**
   *Recommended:* not unless the dual-read cost becomes painful. UI label is
   enough.

7. **Staff invite email vs copy-link.**
   *Recommended:* copy-link in v1 if transactional email is not already reliable
   for auth-style messages; add email when the notice pipeline is proven.
