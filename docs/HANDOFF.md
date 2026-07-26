# Handoff — XERT audit and owner-requirements programme

**Written for the next agent picking this up.** Read this file end to end before
touching anything. It records what was done, what was proven, what is still
unproven, and the traps that already cost time.

- **Branch:** `cursor/audit-findings-cull-24e8` (continues from
  `claude/ios-operational-page-layout-pskigi`)
- **Baseline right now:** `593 tests pass`, lint clean, typecheck clean
- **Prior branch note:** the earlier handoff asked not to open a PR until asked;
  cloud agents may open a draft for review — leave merging to the owner.

---

## 0. First, get the environment working

The container starts with **no `node_modules`**. Every check fails misleadingly
until you fix that. This is not a repo defect:

```bash
cd /home/user/xert-fitness
npm ci                 # ~20s, 544 packages
npm test               # expect 593 pass
npm run lint           # clean
npm run typecheck      # clean
npm run build          # clean
```

### PostgreSQL is available locally — use it

This is the single highest-value tool for this codebase, because most of the real
defects are in SQL. **Postgres 16 may need installing** in some cloud images; when
present it cannot run as root and cannot use a directory under `/tmp/claude-*`
(permissions), so:

```bash
PGD=/var/tmp/pgdata; rm -rf $PGD; mkdir -p $PGD
chown postgres:postgres $PGD; chmod 700 $PGD
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGD -A trust -U postgres"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGD -o '-k /var/tmp -p 5433' -l /var/tmp/pg.log start"
psql -h /var/tmp -p 5433 -U postgres -c 'select 1'
```

Every SQL fix so far was proven this way before being written, and re-proven
after. **Do the same.** Reasoning about `RETURNING` semantics and referential
actions is exactly where the original code went wrong; do not repeat that by
reasoning instead of executing. Use `text` columns instead of `uuid` in throwaway
repros unless you want to type real UUIDs.

### Agent orchestration limits

The box has **4 cores**, so the Workflow tool caps concurrency at
`min(16, cores-2) = 2`. A 110-agent workflow takes hours and will hit the session
limit — that is exactly what killed the first run. Prefer **fewer, deeper agents**
and **batch verification** (one verifier per group of findings, not per finding).
A ~35-agent run took ~2.3 hours and still lost its last 16 agents to the limit.

---

## 1. What has been fixed (all proven, all pushed)

### Pass A (prior agent) — six commits

Every defect was reproduced before being fixed, and the four SQL ones were
re-verified against PostgreSQL 16 including that their existing guards still
reject bad input.

| # | Commit | Defect |
|---|---|---|
| 1 | `f6f2a30` | iOS: duplicated tab bar + Operations Health title overlap |
| 2 | `f64fc78` | Class cancellation refunded **zero** credits; account deletion **impossible**; CSV formula injection; `npm test` ran nothing |
| 3 | `ace22fd` | Audit report + 6 design specs |
| 4 | `509ffa3` | One deleted member could kill **store-wide checkout** |
| 5 | `8f91413` | Roll-call correction **double-charged** a credit |
| 6 | `d16fba2` | Reconciled the audit report with the fixes |

### The five substantive bugs, in one line each

1. **`admin_cancel_class_session` refunded nothing.** `RETURNING status` after
   `UPDATE ... SET status='cancelled'` yields the *post*-update value, so the
   refund filter `status in ('requested','confirmed')` never matched. Fixed with a
   pre-update snapshot CTE. *Proven: 5 credits before, 5 after; correct is 8.*
2. **Account deletion always failed.** Five audit tables combine
   `on delete set null` → `auth.users` with an unconditional
   `before update or delete` immutability trigger. Postgres implements SET NULL as
   an UPDATE, which the trigger aborted. Guards now allow exactly that one update
   shape. *Proven: `ERROR: BOOKING_AUDIT_IMMUTABLE`, user row survived.*
3. **A deleted member killed checkout for everyone.** `orders.user_id` is
   `on delete set null`; `fulfill_stripe_checkout` rejected the NULL, the event
   went `failed` in the ledger, and `api/checkout.js` gates all purchases on zero
   failed fulfilment events → permanent 503, unrecoverable. Triggered by an
   ordinary Stripe redelivery, no malice needed.
4. **Roll-call corrections double-charged.** `attended`/`no_show` already hold an
   unrefunded credit but weren't in the "already credited" set, so flipping back
   to `confirmed` charged again. *Proven: 9 credits → 8.*
5. **CSV formula injection.** Public form text reached admin exports unescaped.
   Quoting is not a defence — CSV parsing strips quotes before the spreadsheet
   evaluates the cell.

**Pattern worth carrying forward:** four of five were credit-accounting errors in
SQL. `credit_batches` is the entitlement primitive the whole product rests on and
it has been wrong in several directions. Treat credit correctness as a gate before
anything that mints credits automatically (see §4).

### Pass B (this agent) — audit cull + SQL-tree landmines

Verified the critical finding and HIGH findings 2–16 adversarially, then fixed
what survived. Status labels are in `docs/audit/remaining-findings.md`.

| Finding | Verdict | Fix |
|---|---|---|
| #1 class editor duplicate | CONFIRMED | remount key + refuse create-intent under open editor |
| #2 aged-out failed webhook | CONFIRMED | Ops Health lists all failed rows; any failed can be marked handled |
| #3 non-AUD currency strands payment | CONFIRMED | AUD-only in checkout, products.js, DB constraint + admin RPCs |
| #4 webhook signature invisible | CONFIRMED | **not fixed** — needs durable rejection ledger |
| #5 iOS refresh coalescing | unverified here | still open |
| #6 iOS content editor OOB | CONFIRMED | still open (Swift) |
| #7 checkout deeplink forge | PARTIAL | still open (UI griefing, not credit theft) |
| #8 event editor duplicate | CONFIRMED | same remount/intent fix + unsaved guard before same-section nav |
| #9 member drawer race | CONFIRMED | drawer key + in-flight active guard |
| #10 health info consent | CONFIRMED | still open (compliance; do with Privacy.jsx) |
| #11/#12 lead & PT paging | CONFIRMED | `.order('id')` tiebreak |
| #13 public timetable past | CONFIRMED | bound public query + INSERT trigger rejects past sessions |
| #14 account form reset | CONFIRMED | skip sync while editing |
| #15 RLS is_admin wrap | PARTIAL / DEFER | perf, not security bypass |
| #16 immutable audit PII | CONFIRMED | still open (needs redaction RPC) |
| §2b announcement policy drift | CONFIRMED | `booking_schema.sql` hardened; new migration `20260726006000`; email immutability restored in `guard_profile_write` inside booking_schema |

New migrations: `20260726004000` (AUD), `20260726005000` (past bookings),
`20260726006000` (announcement audience policy). Mirrored under `src/supabase/`.

**Do not edit** `announcement_archival_upgrade.sql` or
`catalog_optimistic_locking_upgrade.sql` without also editing their linked
migrations — tests require byte equality. Apply `announcement_select_policy_audience_guard.sql`
after any re-run of the archival upgrade.

---

## 2. What is still outstanding

### 2a. Remaining unverified / open findings — the main queue

Full evidence is in **`docs/audit/remaining-findings.md`**. Pass B cleared the
critical item and most HIGH commerce/admin web defects. Still open of note:
signature-rejection health (#4), iOS items (#5–7), health-consent (#10),
audit-PII redaction (#16), and the MEDIUM/LOW queue.

**These are NOT a defect list.** They are raw swarm output. Of the findings
already examined by hand:

- two had the **right symptom but the wrong mechanism** (the account-deletion one
  blamed an FK restriction; it was actually the immutability trigger — and it
  affected 5 tables, not 1),
- one rated **critical was refuted outright** (below),
- several are **duplicates** of each other reported by different dimensions.

Expect a meaningful false-positive rate. Verify before acting.

#### How to verify one properly

1. Open the cited file at the cited line. **Confirm the quoted evidence exists
   verbatim.** If the quote is paraphrased or the line points elsewhere, reject it.
2. Trace the failure path end to end and hunt for anything that already stops it.
   **This repo puts most of its protection in SQL** — RLS policies, CHECK
   constraints, triggers, UNIQUE indexes, SECURITY DEFINER functions — inside
   `supabase/migrations/` (42 files). Grep there *before* concluding anything is
   unguarded. Also grep `test/` (141 files).
3. Ask whether it can occur in the deployed system. Requires the service-role key?
   Not a finding. Lets an admin touch data admins may already touch? Not a finding.
4. If real, reproduce it (in Postgres for SQL, as a unit test for JS) *before*
   fixing, then re-verify after — including that existing guards still reject bad
   input.

#### Known false-positive patterns in this codebase

- **"The Supabase anon key is in the client bundle."** Already refuted. That key
  is *designed* to ship to browsers; RLS is the security boundary, and
  `resolvePublicSupabaseConfig` validates it is an anon rather than service key.
- **Advisory-only dependency findings.** `npm audit --omit=dev` flags postcss
  (high) and react-router 6.x (2 moderate). The react-router `deserializeErrors`
  one is SSR-hydration-only and this is a client-rendered SPA. Only report these
  with a demonstrated exploit path *in this app's code*.
- **Missing security headers.** `vercel.json` already sets CSP (with
  `script-src 'self'`, no unsafe-inline for scripts), HSTS, `X-Frame-Options:
  DENY`, nosniff, Referrer-Policy and Permissions-Policy. Only report a provable
  bypass.

### 2b. Verified but NOT fixed — the two SQL trees have drifted

**This one is real and I confirmed it by reading both files. It is not in the
triage queue because it is already established.**

The repo maintains two parallel SQL trees by hand:

- `supabase/migrations/` — 42 files, authoritative for `supabase db push`
- `src/supabase/` — 42+ files, documented in `README.md` as the operator
  apply path, run manually in the Supabase SQL editor

They have diverged, and the standalone files are *older*:

1. `src/supabase/booking_schema.sql:1120` drops and recreates
   `member_announcements_select_live_or_admin` **without** the
   `audience` / `member_announcement_targets` predicate that
   `supabase/migrations/20260714015000` added. The file contains **zero**
   occurrences of `audience`. Re-running it — and its own header says
   *"Safe to re-run"*, and the README tells operators to run it — downgrades the
   policy so **every member can read every other member's private targeted
   notices**. `src/supabase/announcement_archival_upgrade.sql` carries the same
   stale policy.
2. `src/supabase/booking_schema.sql:59` ships a `guard_profile_write()` **without**
   the email-immutability branch that `src/supabase/admin_cms_schema.sql:36` and
   `src/supabase/rls_hardening.sql:95` both have. It is a `create or replace`, so
   re-applying silently downgrades the hardened trigger and lets a member rewrite
   `profiles.email`. (Verify the downstream claim about
   `member_pt_request_tracking.sql` reassigning PT requests by email match — that
   part is unverified.)

**Recommended fix:** make `supabase/migrations/` authoritative and either generate
`src/supabase/` from it or retire it. Failing that, add a test asserting the
hardened predicate appears in **every** file that creates the policy, not only the
newest one — the existing `test/class-cancellation-notifications.test.js:45` only
checks `class_cancellation_notifications_upgrade.sql`.

**Note:** the five fixes above were mirrored by hand into `src/supabase/` to keep
parity. If you retire that tree, delete the mirrors too.

### 2c. Two agent jobs that never ran

- **Completeness critic.** Was meant to find what the 13 auditors *missed* —
  especially cross-cutting defects owned by no single dimension: a rule the web
  enforces that iOS does not, a migration that fixed one path but not its parallel,
  a guard present in the admin UI but absent in the API behind it.
- **Design integration architect.** I wrote this synthesis by hand instead; it is
  in `docs/requirements/README.md`. It is sound but was not independently reviewed.

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

**Staff/employee accounts and a least-privilege role model was never written**
(its agent died on the session limit). It is the highest-priority gap because
**specs 02, 03 and 05 all depend on it**:

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

1. **Cull the 56-item queue.** Highest value per hour. Batch-verify by dimension
   (one skeptic per group, not per finding), fix what survives, reproduce first.
2. **Fix the two-SQL-tree drift (§2b).** Real, confirmed, and a live landmine
   every time an operator follows the README.
3. **Write the staff/role model spec (§3).** Unblocks three XL features.
4. **Run the completeness critic (§2c).**
5. Only then start implementing any of specs 01–06, in the phase order in
   `docs/requirements/README.md`: correctness → roles+agreements → health →
   money → operations → engagement.

**Before any work that mints credits automatically (spec 06), harden credit
accounting.** Four of the five bugs found were in that code path, and memberships
will exercise it continuously rather than occasionally.

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

### One live compliance gap, independent of all the above

`src/components/public/MemberInterestForm.jsx` collects **free-text health
information** from the public behind only a "consent to contact" tick, and
`src/pages/Privacy.jsx` does not treat it as sensitive information. Under the
Australian Privacy Act health information is *sensitive* information with stricter
consent and handling duties. This is a **present-day** exposure, not a future one,
and it exists before any of the waiver work ships. Two related unverified findings
sit in the queue (`src/pages/Privacy.jsx:22` on overseas disclosure and silent
UTM/referrer capture; `supabase/migrations/20260714011000:41` on audit-stored PII
being permanently uncorrectable) — verify and address together.

---

## 6. Repo conventions to follow

- **Never edit an applied migration.** Add a new one, `YYYYMMDDHHMMSS_name.sql`.
  Today's convention in use: `20260726000000`, `...001000`, `...002000`,
  `...003000`.
- **Mirror each migration into `src/supabase/`** and add it to the README list —
  unless/until §2b retires that tree.
- Migrations carry a **prose header explaining the defect and why the fix is
  shaped that way.** Match that; the existing ones are the reference.
- Tests are **ESM** (`import`, not `require`) in `test/*.test.js`, run by
  `node --test "test/**/*.test.js"`.
- Many existing tests assert on **source text** rather than behaviour. That is a
  known weakness (it is in the triage queue). When you assert on SQL text, strip
  comment lines first — a migration header that quotes the old code will otherwise
  match your "this must be gone" assertion. There is a `body()` helper doing
  exactly this in `test/roll-call-correction-credits.test.js`.
- Commit messages: explain the defect, the mechanism, and the evidence. No model
  identifiers in commits or code.

## 7. Useful paths

```
docs/HANDOFF.md                     <- this file
docs/AUDIT_2026-07.md               <- audit report, status-labelled
docs/audit/remaining-findings.md    <- the 56 open findings, full evidence
docs/requirements/README.md         <- integration plan + owner decisions
docs/requirements/0*.md             <- the six feature specs
supabase/migrations/2026072600*.sql <- the four fixes landed this pass
```
