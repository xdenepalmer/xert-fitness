# Owner requirements — design specs and integration plan

These specs were produced from the owner's requirements note:

> TS AND Cs — Contracts for members incl their why
> (gym rent for PT prices might be adjusted according following 6 months of employment, the no of clients u r training in the gym will be taken into consideration against the amount of rent you are paying the xert facility)
> incl Health waivers
>
> Client member accounts
> employee contacts
> — individual client pbs record on accounts, conversion table
> — digital tag recognition, preregistration for classes online, book online when arrive
> — payment options — needs to confirm

| # | Spec | Effort |
|---|---|---|
| 01 | [Terms & member contracts, versioned acceptance, "my why"](01-terms-and-member-contracts.md) | XL |
| 02 | [Health waivers & APSS pre-exercise screening](02-health-waivers-and-screening.md) | XL |
| 03 | [Coach facility licence & client-volume rent](03-coach-facility-rent.md) | XL |
| 04 | [Member personal bests & conversion tables](04-member-personal-bests.md) | L |
| 05 | [Digital tag check-in & on-arrival booking](05-digital-checkin.md) | XL |
| 06 | [Expanded payment options](06-payment-options.md) | XL |
| 07 | [Staff accounts & least-privilege roles](07-staff-accounts-and-roles.md) | L (design; policy cutover XL) |

**These are proposals, not decisions.** Each was written independently against the
current schema. Nothing here is implemented. Read this integration plan before
building any of it, because several specs want the same mechanism.

**Design integration review (2026-07-26):** see
[INTEGRATION_REVIEW.md](INTEGRATION_REVIEW.md) — whether these decisions still
hold after the audit/completeness work, cross-spec conflicts, whether spec 07
unblocks 02/03/05, build-order adjustments, owner gates, and risks from recent
credit/deletion/privacy fixes. **Documentation alignment patches** from that
review’s §8 are applied on the specs (see the checklist at the end of
INTEGRATION_REVIEW.md) — still design-only; no schema implementation.

---

## 1. Conflicts and overlaps to resolve first

### Terms acceptance and waiver acceptance are one mechanism, not two

Spec 01 designs a document → version → acceptance-ledger triple. Spec 02 needs
exactly the same thing for the liability waiver. **Build the ledger once.** A
waiver is a document *kind*, not a separate subsystem.

The important split: the *acceptance record* (which version, when, from what IP
and device) belongs in the shared ledger. The *health answers* do not — those are
sensitive information and live in their own tightly-scoped tables per spec 02.

Both specs correctly follow the existing snapshot precedent in
`supabase/migrations/20260716040000_stripe_order_terms_snapshot.sql`. Keep that.

### The role model is a prerequisite — spec now written

Spec 02 (who may see health data), spec 03 (a coach sees only their own clients)
and spec 05 (a front-desk role) all need roles finer than the current
binary member/admin flag. **That design is now in
[07 — Staff accounts & least-privilege roles](07-staff-accounts-and-roles.md).**

Nothing in 02, 03 or 05 should start until Phase A of 07 lands. The migration
remains the riskiest in the programme: done carelessly it locks the owner out of
production admin, because the existing RLS policies throughout
`supabase/migrations/` call `public.is_admin()`. Spec 07 keeps `is_admin()`
meaning owner (`profiles.role = 'admin'`) for the whole compatibility window,
adds narrow helpers for coach / front desk, and forbids renaming or mass
rewriting owner rows in the first ship.

### Coach rent and memberships both want Stripe recurring billing

Spec 06 proposes a billing spine (`billing_plans` → `billing_subscriptions` →
`billing_periods`) on Stripe Billing. Spec 03 needs recurring invoicing for coach
facility rent. **Build the spine once** and make coach rent a consumer of it, not
a parallel Stripe integration. Two independent subscription systems against one
Stripe account will diverge and produce reconciliation bugs.

### Check-in must feed the existing roll-call, not replace it

Spec 05 correctly extends `src/lib/attendanceDraft.js` and the daily operations
work in `20260714016000_admin_daily_operations.sql`. Hold it to that. A second
attendance source of truth would break the existing admin desk.

### The unifying primitive is `credit_batches`

Spec 06's best decision is minting a normal `credit_batches` row when a membership
invoice is paid, leaving `book_session`, waitlist promotion, cancellation and
roll-call untouched. Spec 05's on-arrival booking rides the same rail. **Preserve
this.** It is what keeps the programme from becoming a rewrite.

Note this makes credit correctness load-bearing for everything. The class
cancellation refund bug fixed in July 2026 (see `../AUDIT_2026-07.md`) is exactly
the class of defect that becomes far more expensive once memberships are minting
credits continuously.

---

## 2. Shared foundations, in build order

1. **Role model + staff records** — blocks 02, 03, 05. See [spec 07](07-staff-accounts-and-roles.md).
2. **Agreement ledger** (documents, versions, acceptances) — serves 01 and 02.
3. **Billing spine** on Stripe Billing — serves 06 and 03.
4. **Movement/test catalogue** — serves 04 only; independent, can run in parallel.

---

## 3. Suggested sequencing

Ordered by dependency and by what a gym about to launch actually needs.

**Phase 0 — correctness.** Land the audit fixes. Credits must be trustworthy
before anything mints them automatically.

**Phase 1 — roles + agreements.** Staff/role model, then the agreement ledger,
then T&Cs and "my why" (spec 01).
*After this the gym can:* onboard a member against a specific, provable version of
its terms, and give staff appropriately scoped access.

**Phase 2 — health.** APSS screening and waivers (spec 02) on top of the ledger
and the role model.
*After this the gym can:* legally and safely screen members before they train, and
give coaches a safety flag without exposing medical detail.

**Phase 3 — money.** Billing spine and memberships (spec 06), then coach rent
(spec 03) as a consumer of it.
*After this the gym can:* sell recurring memberships on BECS direct debit and bill
coaches their facility rent automatically.

**Phase 4 — operations.** Check-in and on-arrival booking (spec 05).
*After this the gym can:* run the front door without staff manually marking a roll.

**Phase 5 — engagement.** Personal bests (spec 04). Genuinely valuable but the
only one with no compliance or revenue dependency, so it goes last unless the
owner wants a visible member-facing win sooner.

---

## 4. Risk register

| Risk | Guardrail |
|---|---|
| **Health data breach.** Sensitive information under the Privacy Act; strictest handling in the product. | Dedicated tables, read-level audit trail, minimum-necessary role scoping. Must **not** live in `admin_member_notes` (`20260714003000`), which has no health-grade protection. |
| **Role migration locks the owner out of admin.** Every existing RLS policy calls `is_admin()`. | Compatibility window with `is_admin()` derived from the new model; verify every policy before cutover; rehearse the rollback. |
| **Contract unenforceability.** A member disputes terms they "never agreed to". | Immutable version rows; acceptance snapshots the version identity and content hash, never the mutable body. |
| **Sham contracting.** The note says "employment" while describing a rent-paying contractor. Misclassification is a real exposure in Australia. | Get advice before spec 03 ships. This is a legal question, not an engineering one. |
| **Taking money incorrectly.** BECS settles over days and fails differently from cards. | Model the settlement delay explicitly; never grant entitlement on submission, only on `invoice.paid`. |
| **Cooling-off and ACL.** Fitness-industry contract rules constrain how memberships may be sold. | Confirm current Queensland requirements before launch. |

**Already live, independent of this programme:** the public member interest form
collects free-text health information behind only a "consent to contact" tick,
and the privacy policy does not treat it as sensitive information. That is a
present-day compliance gap, not a future one. See `../AUDIT_2026-07.md`.

---

## 5. Decisions needed from the owner

Each spec's own "Open questions" section has the detail. The ones that block
engineering:

1. **Does incomplete health screening block booking, or just flag it?**
   *Recommended:* flag first, block only for members with an outstanding doctor's
   clearance. Blocking everyone costs bookings.
2. **Coach rent: what exactly is an "active client", and over what window?**
   *Recommended (aligned with [spec 03](03-coach-facility-rent.md)):* a distinct
   client with **at least two (2) qualifying facility sessions** in a Brisbane
   calendar month; the 6-month average of those monthly counts drives the rent
   tier. Write it into the agreement — it will be disputed.
3. **Are coaches contractors or employees?** Blocks spec 03. Needs legal advice.
4. **Memberships, packs, or both?** *Recommended:* both — memberships on BECS for
   regulars, packs retained for casuals.
5. **Check-in hardware budget?** *Recommended:* rotating QR on a staff iPad first
   (no per-member cost), fobs only for members without a usable phone.
6. **Do no-shows consume a credit?** *Recommended:* yes, with a staff override.
   Members will complain; it is the only thing that makes no-shows stop.
7. **Are PB leaderboards on by default?** *Recommended:* off, strictly opt-in.
