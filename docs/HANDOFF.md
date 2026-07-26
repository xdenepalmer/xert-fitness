# Handoff — XERT audit and owner-requirements programme

**Written for the next agent picking this up.** Read this file end to end before
touching anything. It records what was done, what the code shows is fixed, what
is still open, and the traps that already cost time.

- **Branch:** `cursor/xert-audit-continuation-8c8e` (merged with `main`; includes
  the SQL-drift repair PR and the audit continuation commits)
- **Baseline expectation:** `npm ci` then `npm test`, `npm run lint`,
  `npm run typecheck`, `npm run build` — keep these green before finishing work
- **Working tree may contain uncommitted parallel-agent fixes** (iOS refresh /
  checkout / roster / privacy / cancel-booking / health consent). Do not assume
  they are committed until `git status` is clean.
- **Do not open a pull request unless the user asks.**

---

## 0. First, get the environment working

The container starts with **no `node_modules`**. Every check fails misleadingly
until you fix that. This is not a repo defect:

```bash
cd /workspace   # or the checkout root
npm ci                 # ~20s
npm test
npm run lint
npm run typecheck
npm run build
```

### PostgreSQL is available locally — use it

This is the single highest-value tool for this codebase, because most of the real
defects are in SQL. **Postgres 16 is installed.** It cannot run as root and cannot
use a directory under `/tmp/claude-*` (permissions), so:

```bash
PGD=/var/tmp/pgdata; rm -rf $PGD; mkdir -p $PGD
chown postgres:postgres $PGD; chmod 700 $PGD
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGD -A trust -U postgres"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGD -o '-k /var/tmp -p 5433' -l /var/tmp/pg.log start"
psql -h /var/tmp -p 5433 -U postgres -c 'select 1'
```

SQL fixes on this programme were proven this way before being written, and
re-proven after. **Do the same.** Reasoning about `RETURNING` semantics and
referential actions is exactly where the original code went wrong; do not repeat
that by reasoning instead of executing. Use `text` columns instead of `uuid` in
throwaway repros unless you want to type real UUIDs.

### Agent orchestration limits

Prefer **fewer, deeper agents** and **batch verification** (one verifier per
group of findings, not per finding). Wide fan-out hits session/concurrency caps.

---

## 1. What has been fixed on this branch

The original handoff claimed the 56-item audit queue was never verified. That is
**stale**. Most findings have been verified against code (and many against
PostgreSQL 16) and marked **FIXED** in `docs/audit/remaining-findings.md`.
**48 FIXED / 8 OPEN** as of this update.

### Themes from commits on this branch (after merge with main)

| Theme | Representative commits | What landed |
|---|---|---|
| Credit / checkout correctness | `f64fc78`, `509ffa3`, `8f91413` | Class-cancel refunds, deleted-member order no longer kills store-wide checkout, roll-call correction no longer double-charges |
| Commerce / webhook hardening | `06f2d16` | Aged failed events visible in health; AUD-only currency; signature-failure ledger; Stripe idempotency body without wall-clock `expires_at`; refunds.list fallback; push-token ownership; announcement audience fail-closed; atomic account deletion API path; api typecheck |
| SQL holes confirmed by audit | `2810add` | Public-form staff-column guard; blackout historic edit; public enquiry time guard; `my_bookings` duration; product currency AUD check; signature ledger; atomic `delete_member_account`; roll-call releases pending requests; admin policy scalar subquery; orders `user_id` index |
| Admin / public data-layer UX | `6977063`, `f0b017d`, `02810ae` | Editor identity keys (no silent duplicate create); lead/PT id tiebreaks; bounded public timetable; profile-edit sync; bookings queue filters; dialog Tab vs Radix; lint/typecheck coverage; timetable contrast; canonical URL sanitisation; ops-health error codes |
| Operator SQL drift repair | `14e0e67` … `af3de78` | `src/supabase/` no longer silently downgrades announcement audience RLS, email immutability, or superseded RPC overloads; drift tests enforce it |
| Merge repair | `6d29b25`, `fe83697` | Main merged in; CSV export + announcement policy drift repaired after merge |

### Early substantive bugs (still the pattern to watch)

1. **`admin_cancel_class_session` refunded nothing** — `RETURNING status` after
   cancel never matched the refund filter. Fixed with a pre-update snapshot CTE.
2. **Account deletion always failed** — immutability triggers aborted the
   `ON DELETE SET NULL` updates into audit tables. Guards allow that one update shape.
3. **A deleted member killed checkout for everyone** — NULL `orders.user_id` failed
   fulfilment → permanent checkout kill-switch. NULL buyer now settles without re-grant.
4. **Roll-call corrections double-charged** — `attended`/`no_show` were not treated
   as already holding a credit.
5. **CSV formula injection** — public form text reached admin exports unescaped.

**Pattern worth carrying forward:** credit-accounting errors in SQL around
`credit_batches` remain the highest-risk area. Treat credit correctness as a gate
before anything that mints credits automatically (see §4).

### Working-tree themes (uncommitted at handoff rewrite time)

Parallel agents also changed (verify with `git status` / `git diff`):

- iOS refresh coalescing after book/waitlist/cancel; checkout deep-link forgery
  resistance; class roster scoping; site-content editor stable row identity
- Sign-out pending push unregister + local fail-closed clear
- `cancel_booking` refund when the credit batch has expired (+ migration mirror)
- Member-interest health consent (form, iOS models, SQL, Privacy policy)
- Owner Command Centre nav restored as a visible one-tap entry on iPhone/iPad

These map to findings **5, 6, 7, 10, 26, 28, 36, 41** (and nav UX outside the
numbered queue). Commit them before treating them as shipped.

---

## 2. What is still outstanding

### 2a. Audit queue — 8 still open

Full evidence remains in **`docs/audit/remaining-findings.md`** (auditor quotes
kept; **status** lines are authoritative). Open items:

| # | Severity (claimed) | Why still open |
|---|---|---|
| 16 | high | Audit tables still store name/email/staff notes behind immutability triggers with no correction/erasure path (APP 12/13) |
| 27 | medium | Owner `memberCount` still reads `total_count` from `members[0]`; `resolveOwnerTask` inserts a filtered member at index 0 |
| 29 | medium | `canApplyMemberState` still compares `access_token`, so token refresh aborts post-mutation UI |
| 31 | medium | `AdminLayout` badge refresh effect still depends on `activeSection` without reading it |
| 33 | medium | `admin_update_class_session` still has no optimistic-lock / `expected_updated_at` |
| 49 | low | `requestText` still `JSON.stringify`s a parsed body — risky for Stripe HMAC if a runtime pre-parses |
| 51 | low | Calendar integration still requests full event access on iOS 17+ |
| 52 | low | Sign-out/delete clear push state, but pending checkout / nav pins / admin scene storage are not fully purged |

Do not re-open FIXED findings without new evidence. If unsure, grep the fix
location named in `remaining-findings.md` before changing status again.

#### How to verify one properly (still the right method)

1. Open the cited file. Confirm the quoted evidence still exists **or** that the
   fix location named in the status line is present.
2. Trace the failure path end to end. Grep `supabase/migrations/` and `test/`
   before concluding anything is unguarded.
3. Ask whether it can occur in the deployed system (service-role-only? admin-only
   by design?).
4. For SQL: reproduce in local Postgres before and after. For JS/iOS: add or run
   the contract test that pins the fix.

#### Known false-positive patterns in this codebase

- **"The Supabase anon key is in the client bundle."** Already refuted. That key
  is *designed* to ship to browsers; RLS is the security boundary, and
  `resolvePublicSupabaseConfig` validates it is an anon rather than service key.
- **Advisory-only dependency findings.** Only report with a demonstrated exploit
  path *in this app's code*.
- **Missing security headers.** `vercel.json` already sets CSP (with
  `script-src 'self'`, no unsafe-inline for scripts), HSTS, `X-Frame-Options:
  DENY`, nosniff, Referrer-Policy and Permissions-Policy. Only report a provable
  bypass.

### 2b. Two-SQL-tree drift — largely repaired

Previously: `src/supabase/` could silently downgrade hardened announcement RLS
and `guard_profile_write` email immutability, and re-grant superseded RPCs.

**Current state:** drift repair commits + `test/supabase-operator-script-drift.test.js`
pin the invariants (audience predicate, email immutability, no unconditional
superseded overload grants). Keep that test green whenever you edit operator
scripts. Prefer `supabase/migrations/` as authoritative; still mirror into
`src/supabase/` and the README list until that tree is retired.

### 2c. Two agent jobs that never ran

- **Completeness critic.** Was meant to find what the 13 auditors *missed* —
  especially cross-cutting defects owned by no single dimension.
- **Design integration architect.** Synthesis lives in `docs/requirements/README.md`
  but was not independently reviewed.

---

## 3. The owner-requirements programme

Source: the owner's handwritten note (T&Cs/contracts + "their why", health
waivers, coach gym rent by client volume after 6 months, member accounts,
employee contacts, client PBs + conversion table, digital tag check-in +
pre-registration + book-on-arrival, payment options).

**Six design specs exist in `docs/requirements/`** (~550KB, full Postgres DDL
written against the real schema). They are **proposals, not decisions**, and
**nothing is implemented**:

| # | Spec | Effort |
|---|---|---|
| 01 | Terms & member contracts, versioned acceptance, "my why" | XL |
| 02 | Health waivers & APSS pre-exercise screening | XL |
| 03 | Coach facility licence & client-volume rent | XL |
| 04 | Member personal bests & conversion tables | L |
| 05 | Digital tag check-in & on-arrival booking | XL |
| 06 | Expanded payment options | XL |

### The missing seventh spec — write this first

**Staff/employee accounts and a least-privilege role model was never written.**
It is the highest-priority gap because **specs 02, 03 and 05 all depend on it**:

- 02 needs "which staff role may see health data"
- 03 needs "a coach sees only their own clients"
- 05 needs a front-desk/kiosk role

It is also **the riskiest migration in the whole programme.** Every existing RLS
policy across `supabase/migrations/` calls `public.is_admin()`. A careless cutover
locks the owner out of production admin.

When writing it, cover: staff records distinct from the member profile (a staff
member is usually also a member); emergency/next-of-kin contacts; certifications
with expiry (first aid, CPR, fitness qual, insurance, WWCC) and alerting; concrete
roles (owner, manager, coach, front-desk, contractor-PT) with an explicit
permission matrix against the real workspace list in
`ios/XertFitnessApp/XertFitnessApp/OwnerNavigation.swift` and
`src/lib/adminNavigation.js`; enforcement in **RLS, not just the UI**; audit of
permission changes. Most importantly specify the **migration order**, the
compatibility window where `is_admin()` is derived from the new model so old
policies keep working, how you verify before cutover, and the rollback.

### Integration decisions already made (see `docs/requirements/README.md`)

Do not re-litigate these without reason:

- **Terms acceptance and waiver acceptance are ONE mechanism.** Build the
  document → version → acceptance ledger once; a waiver is a document *kind*.
  Health *answers* stay in their own tightly-scoped tables.
- **Memberships and coach rent share ONE Stripe billing spine.** Two subscription
  systems on one account will diverge.
- **Check-in feeds the existing roll-call**, it does not replace it
  (`src/lib/attendanceDraft.js`, migration `20260714016000`).
- **`credit_batches` stays the single entitlement primitive.** Memberships mint
  credits, so booking/waitlist/cancellation logic is untouched. This is what keeps
  the programme from becoming a rewrite.

---

## 4. Suggested order of work

1. **Commit or discard the working-tree parallel fixes**, then re-run lint/tests/build.
2. **Close the 8 open findings** (§2a), highest severity first (16, then 27/29/31/33).
3. **Write the staff/role model spec (§3).** Unblocks three XL features.
4. **Run the completeness critic (§2c).**
5. Only then start implementing any of specs 01–06, in the phase order in
   `docs/requirements/README.md`: correctness → roles+agreements → health →
   money → operations → engagement.

**Before any work that mints credits automatically (spec 06), harden credit
accounting further.** Several of the worst production bugs were in that path, and
memberships will exercise it continuously rather than occasionally.

---

## 5. Things the owner must decide (not engineering questions)

Raised but unanswered. Blocking where noted:

1. **Are coaches contractors or employees?** *Blocks spec 03.* The note says
   "employment" while describing rent-paying contractors — that is a
   sham-contracting exposure in Australia and needs legal advice, not a
   design decision.
2. **Does incomplete health screening block booking, or just flag it?**
   *Recommended:* flag; block only for an outstanding doctor's clearance.
3. **What exactly is an "active client", over what window?** *Recommended:* at
   least one paid session in the trailing 6 months. It will be disputed by a
   coach one day — write it into the agreement.
4. **Memberships, packs, or both?** *Recommended:* both.
5. **Check-in hardware budget?** *Recommended:* rotating QR on a staff iPad first
   (no per-member cost); fobs only for members without a usable phone.
6. **Do no-shows consume a credit?** *Recommended:* yes, with a staff override.
7. **PB leaderboards on by default?** *Recommended:* off, strictly opt-in.

### Compliance note (partially addressed)

Public member-interest health free-text now requires a separate
`health_info_consent` and Privacy Policy language for sensitive health
information and overseas processing (finding 10/41). Finding **16** (immutable
audit PII with no erasure/correction path) remains a live compliance gap.

---

## 6. Repo conventions to follow

- **Never edit an applied migration.** Add a new one, `YYYYMMDDHHMMSS_name.sql`.
  Recent audit fixes use `2026072600xxxx` / `2026072608xxxx` / `2026072610xxxx`.
- **Mirror each migration into `src/supabase/`** and add it to the README list —
  unless/until the operator-script tree is retired. Keep
  `test/supabase-operator-script-drift.test.js` green.
- Migrations carry a **prose header explaining the defect and why the fix is
  shaped that way.** Match that; the existing ones are the reference.
- Tests are **ESM** (`import`, not `require`) in `test/*.test.js`, run by
  `node --test "test/**/*.test.js"`.
- Many existing tests assert on **source text** rather than behaviour. When you
  assert on SQL text, strip comment lines first — a migration header that quotes
  the old code will otherwise match your "this must be gone" assertion. There is
  a `body()` helper doing exactly this in
  `test/roll-call-correction-credits.test.js`.
- Commit messages: explain the defect, the mechanism, and the evidence. No model
  identifiers in commits or code.

## 7. Useful paths

```
docs/HANDOFF.md                     <- this file
docs/AUDIT_2026-07.md               <- audit report, status-labelled
docs/audit/remaining-findings.md    <- 56 findings with FIXED/OPEN status
docs/requirements/README.md         <- integration plan + owner decisions
docs/requirements/0*.md             <- the six feature specs
supabase/migrations/202607260*.sql  <- audit-era SQL fixes
test/supabase-operator-script-drift.test.js  <- keeps src/supabase/ from regressing
```
