# Design Integration Architect review

**Date:** 2026-07-26  
**Branch:** `cursor/xert-audit-continuation-8c8e`  
**Scope:** Cross-check `docs/requirements/README.md` and specs 01–07 against the live schema after the audit / completeness work. Design review only — nothing implemented.

Reviewed against real primitives: `credit_batches`, `public.is_admin()`, `member_onboarding_*` / Stripe order-terms snapshot patterns, `src/lib/attendanceDraft.js`, and Stripe fulfilment (`fulfill_stripe_checkout` + webhook ledger), plus recent deletion / privacy / credit fixes.

---

## Verdict

The README’s four integration decisions still hold. Spec 07 is enough to unblock 02 / 03 / 05 **once Phase A lands and the older specs stop inventing private role enums**. Do not start feature implementation until the owner gates in §5 are answered (or their recommended defaults are explicitly accepted) and the conflicts in §2 are resolved by short alignment patches to the affected specs — not by building around them.

---

## 1. Do the README integration decisions still hold?

| README decision | Still hold? | Notes |
|---|---|---|
| Terms + waiver acceptance = **one** ledger; health *answers* stay separate | **Yes — as intent.** | Specs 01 and 02 currently draft **two** ledgers. Keep the README rule; patch 02 (and trim 01’s `health_declaration` kind) so the waiver is a document *kind* on the shared ledger. |
| Spec 07 role model before 02 / 03 / 05 | **Yes.** | 07 is now written. Phase A of 07 is still the hard prerequisite. |
| One Stripe billing spine for memberships **and** coach rent | **Yes — as intent.** | Spec 06 designs the spine; spec 03 still describes a parallel Stripe Invoicing path. Prefer 06’s spine; make 03 a consumer. |
| Check-in feeds `attendanceDraft` / existing roll-call | **Yes.** | Spec 05 correctly stamps `checked_in_at` and drafts attendance; `admin_record_session_attendance` remains the only status writer. |
| `credit_batches` stays the entitlement primitive | **Yes — load-bearing.** | Spec 06 minting on `invoice.paid` and spec 05 on-arrival booking both ride this. Recent credit bugs prove it must stay correct before anything mints continuously. |

**What changed since the README was written (and must be respected):**

- **Audit queue closed** (56 FIXED). Credit, deletion, privacy, and operator-drift fixes are live; they are constraints on new work, not open defects.
- **Spec 07 exists.** The README already points at it; sibling specs 01–06 still contain pre-07 workarounds that must be retired before coding.
- **Live onboarding foundation** (`20260721010000_member_onboarding_foundation.sql`: `member_onboarding_documents` / `member_onboarding_receipts`, emergency contacts, immutable versions + receipts) was not in the original README synthesis. Spec 01 proposes a parallel `agreement_*` triple. **Extend or supersede the live foundation deliberately — do not ship a second unrelated ledger.**
- **Public health consent is already partial.** `health_info_consent` on leads / booking notes and Privacy overseas/UTM language landed in the completeness work. Spec 02’s plan to *drop* `member_interest.injuries_or_limitations_optional` must be reconciled with that live consent path (see §6).

---

## 2. Conflicts and gaps between specs 01–07

### A. Agreement ledgers (01 vs 02 vs live schema) — **must resolve before build**

| Source | What it proposes |
|---|---|
| README | One document → version → acceptance ledger; waiver is a *kind*; APSS answers are separate. |
| Spec 01 | New `agreement_documents` / `agreement_document_versions` / `member_agreement_acceptances`, including kind `health_declaration`. |
| Spec 02 | Separate `health_document_versions` + `member_liability_waivers` acceptance path. |
| Live DB | `member_onboarding_documents` / `member_onboarding_receipts` already implement versioned acknowledgements (no screening answers, by design). |

**Resolution:** Build one ledger. Prefer evolving the live onboarding foundation (or a single migration that replaces it with the richer 01 shape and migrates any receipts) so 01 and 02 share versions/acceptances. Spec 02 keeps tightly-scoped clinical tables for APSS answers only. Drop 01’s standalone `health_declaration` *kind* once the waiver kind lives on the shared ledger — or keep the kind name but not a second table family.

### B. Role models (02 / 03 / 04 / 05 vs 07) — **must resolve before build**

| Spec | Stale stance |
|---|---|
| 02 | Embeds `member \| coach \| admin` and its own `is_staff()` / `admin_set_role` rewrite. |
| 03 | Coach portal gated on engagement / `current_coach_id()`, not `profiles.role = 'coach'`. |
| 04 | Explicitly “do **not** add a coach role”; verification = `is_admin()` + CMS `coaches` attribution. |
| 05 | Desk RPCs start with `is_admin()`; open Q10 defaults door desk to admin-only; “Phase 5 coach role”. |
| 07 | Canonical: `member \| front_desk \| coach \| ops? \| admin` (stored `admin` = owner); helpers + `has_capability`; Phase A before 02/03/05. |

**Resolution:** Spec 07 wins. Before implementing 02/03/05/04 staff surfaces, patch those specs to reference 07’s role set and helpers by name. Spec 02 must **not** ship its embedded role DDL. Spec 05 desk RPCs use `has_capability('door_desk')` / `'roll_call'`; device registration stays owner-only. Spec 03 binds login privilege to `role = 'coach'` and commercial data to `coach_engagements` (as 07 already says). Spec 04 may use staff/owner verification via `has_capability` once 07 Phase A exists; until then admin-only verification remains acceptable.

### C. Coach rent money path (03 vs 06) — **must resolve before money work**

- Spec 03: Stripe **Invoicing** (`send_invoice` per monthly statement), statement-driven, rate set by 6-month review.
- Spec 06: Stripe **Billing** subscription (`billing_plans.kind = 'coach_rent'`), same spine as memberships; “coaches need no XERT login”.
- README: one spine.

**Resolution:** Keep **one** Stripe integration surface (webhook ledger, customers, BECS mandates, commerce health). Prefer 06’s spine for collection machinery. Spec 03’s engagement / session / review / statement domain still stands — statements become the commercial source that sets or updates the subscription amount (or invoices *through* the shared billing customer/mandate objects), not a second webhook personality. Spec 06’s “no coach login” line is superseded by 07 + 03’s portal need; mandate links may still be emailed, but coach login is required for sessions, safety roster, and rent visibility.

### D. Active-client definition (README vs 03)

- README recommends: ≥1 paid session in trailing 6 months.
- Spec 03 (written into the agreement text): ≥2 qualifying facility sessions in a Brisbane calendar month; 6-month *average* drives the tier.

**Resolution:** Spec 03’s definition is the one that can be audited from facility slots. Update the README recommendation to match 03 (or the owner rejects 03’s threshold). Do not leave both as “the” definition.

### E. Policy switches on `admin_settings` (01 vs 02 / 05 / live guard)

`guard_session_pack_payment_activation` raises `PAYMENT_SETTINGS_CHANGE_REQUIRES_PAUSE` on **any** live `admin_settings` column change while payments are on. Specs 02 and 05 correctly use separate singletons (`health_policy_settings`, `check_in_settings`). Spec 01 still parks `agreement_enforcement` on `admin_settings`.

**Resolution:** Move agreement enforcement to its own singleton (same pattern as 02/05), or accept that every flip requires pausing payments — which is a poor emergency stop for a legal gate.

### F. Minor / sequencing gaps (non-blocking but real)

- Spec 01 and 02 both add `session_bookings` before-insert gates (agreements vs health). Order and failure codes must be composed, not overwritten.
- Spec 06 alters `credit_batches` with `source` / `subscription_id` / `period_id`; live table is still the pack-oriented shape. Additive columns are fine; mint/revoke paths must not disturb pack `order_id` refunds.
- Spec 03’s coach agreement acceptances are a *commercial* ledger (licence / variations). That can stay separate from the member T&Cs ledger; name them clearly so they are not confused with 01/02.
- Spec 04 remains the only truly independent feature; role wording is the only coupling.
- HANDOFF §3 still narrates “six specs / missing seventh” in places; 07 and this review supersede that narrative.

---

## 3. Is spec 07 sufficient to unblock 02 / 03 / 05?

**Yes, for design unblock — with conditions.**

07 supplies what those specs needed:

- Fixed role set including `coach` and `front_desk` (optional `ops`).
- Compatibility rule: `is_admin()` keeps meaning owner; coaches inherit none of the ~50 existing admin policies.
- Capability matrix covering clinical health, coach-scoped clients/rent, and door desk.
- Invite / staff record sketch and a phased migration that forbids renaming `admin` or mass-rewriting owners in the first ship.
- Explicit Phase A → B → C order; Phase A before any 02/03/05 implementation.

**Still required before coding 02/03/05:**

1. Land **07 Phase A** (helpers dark, widen allow-lists, keep owner truth set) on a rehearsed Supabase branch.
2. Apply the alignment patches in §2B so 02/03/05 stop shipping competing DDL and RPC guards.
3. Owner defaults on 07’s open questions (ops in v1?, courtesy credits?, coaches on roll call?) — recommended defaults are fine if explicitly accepted.
4. MFA gate before health enforcement or door desk go live (already called out in 07).

07 does **not** unblock 06 (money) or 01 (agreements) by itself; those depend on the ledger and billing-spine decisions above.

---

## 4. Recommended build-order adjustments

README phases remain sound. Adjustments after audit + 07:

| Phase | Adjustment |
|---|---|
| **0 — correctness** | **Done for the audit queue.** Keep a standing rule: no automatic credit minting (06) until membership mint/revoke paths have Postgres-proven tests alongside the existing cancel / roll-call / deleted-buyer fixes. |
| **1 — roles + agreements** | **07 Phase A first** (schema helpers only). Then **one agreement ledger** that respects live `member_onboarding_*` (extend or replace — pick one). Then spec 01 member UX. Do **not** put enforcement on `admin_settings`. |
| **2 — health** | After 07 Phase A + shared ledger. Strip role DDL from 02. Reconcile lead-health column with live `health_info_consent` (§6). |
| **3 — money** | Billing spine (06) first; coach rent **domain** (03 sessions/reviews) can start in parallel once 07 coach login exists, but **collection** waits for the shared spine decision (§2C). Prefer coach-rent pilot as 06 already sequences. |
| **4 — operations** | Spec 05 after front-desk capability exists (07 Phase B/C). Keep attendanceDraft-only integration. On-arrival booking is a credit consumer — treat like a soft dependency on credit trust (Phase 0). |
| **5 — engagement** | Spec 04 can start earlier for catalogue-only work; verification/leaderboards wait for staff roles if coaches verify. |

**Practical reorder vs README:** insert an explicit **“07 Phase A + ledger unification patch”** checkpoint between Phase 0 and Phase 1 member-facing work. Do not start 02 or 05 schema while 02/05 still embed pre-07 role assumptions.

---

## 5. Explicit “do not build yet” gates

Owner (or legal) decisions that still block engineering. Recommended defaults may be used **only if the owner accepts them in writing**.

| # | Gate | Blocks | Recommended default (from specs / README) |
|---|---|---|---|
| 1 | **Contractors vs employees for coaches?** | Spec 03 (and any rent collection) | Legal advice first; engineering must not encode “employment”. |
| 2 | **Incomplete screening: flag or block?** | Spec 02 enforcement | Flag; block only on outstanding doctor clearance / missing waiver+screen. |
| 3 | **Active-client definition** | Spec 03 rent maths + agreement text | Adopt spec 03’s ≥2 qualifying sessions / month + 6-mo average (update README). |
| 4 | **Memberships, packs, or both?** | Spec 06 catalogue | Both. |
| 5 | **Check-in hardware budget** | Spec 05 Phase 2+ | Rotating QR on staff iPad first; fobs on request. |
| 6 | **No-shows consume credit?** | Spec 05 excuse UX / member comms | Yes (already true today); staff override + publish the rule. |
| 7 | **PB leaderboards default** | Spec 04 | Off; strict opt-in. |
| 8 | **Queensland cooling-off / ACL for memberships** | Spec 06 Phase 3 | Confirm with OFT / lawyer before invite-only launch. |
| 9 | **Solicitor-drafted T&Cs + liability waiver + health notice** | 01 publish / 02 publish | Do not publish engineer-written legal text. |
| 10 | **APSS reproduction / insurer waiver cadence** | Spec 02 Phase 0 | Written permission + insurer confirm before member-facing screen. |
| 11 | **Agreement ledger strategy** | Spec 01 schema | One ledger; decide extend vs replace `member_onboarding_*` before migrations. |
| 12 | **Coach rent collection shape** | 03 + 06 money | One Stripe spine; 03 is consumer (see §2C). |
| 13 | **Ops role in v1?** | Spec 07 enum | Omit `ops` until needed. |

Until gates **1, 8–12** are decided (and **2–7, 13** accepted or overridden), treat the corresponding specs as design only.

---

## 6. Risks from recent credit / deletion / privacy fixes that specs must respect

These are live behaviours. New specs must not regress them.

### Credits and Stripe fulfilment

- **Class-cancel refunds** and **roll-call correction** paths were wrong; fixes assume `attended` / `no_show` already hold a spent credit. Spec 05 must only draft attendance and never invent a second credit mutation on check-in.
- **Deleted buyer fulfilment:** `orders.user_id` may be NULL; `fulfill_stripe_checkout` settles without re-granting credits. Spec 06 membership minting must tolerate deleted / null payers the same way (settle invoice ledger; skip entitlement if no account) or a single deleted member will poison the webhook health gate again.
- **Expired-batch cancel refund** and **credit reactivation** edges exist. Membership batches with `period_id` uniqueness and revoke-on-failure must reuse the same refund/reactivation discipline — not a fork.
- **On-arrival booking (05)** and **membership mint (06)** both write `credit_batches`. Preserve earliest-expiry spend order; add provenance columns additively; never bypass `book_session` capacity / waitlist FIFO.

### Account deletion and retention

- `delete_member_account` is atomic, redacts audit subject PII, clears email-matched public leads (including health free-text) and anonymous PT rows. Specs 01/02 that keep waiver/acceptance evidence after delete (`ON DELETE SET NULL` + identity snapshot) **must** update Privacy / deletion dialog copy the same way — members cannot be told “everything is gone” if legal holds remain.
- Spec 06 already notes cancelling Stripe subscriptions before auth delete; that is mandatory. Also clear or revoke BECS mandates; refuse delete on arrears if that remains policy.
- Spec 05 credentials (`ON DELETE CASCADE` on user) vs 01/02 legal holds: different tables, different rules — document both in Privacy.
- Operator scripts: older `src/supabase/*` must not replace newer `delete_member_account` / redaction guards. Any new upgrade SQL needs the same “skip if newer shape exists” pattern pinned by `test/supabase-operator-script-drift.test.js`.

### Privacy and health consent

- Live path: `health_info_consent` on member interest and on booking / PT free-text notes; admin list/CSV boundaries; audited reveal for lead health. Spec 02’s “null and drop injuries column” **conflicts** with that remediation. Choose one:
  - **Keep** the consented lead field and point members into full APSS later, or
  - **Drop** it only with a migration that also removes the consent column/UI and updates Privacy — do not drop the field while leaving consent machinery orphaned.
- Clinical detail must never land in `admin_member_notes` (unchanged README risk).
- Spec 01 “my why” remains outside the contract and may contain sensitive text — keep optional, capped, and `coach_visible`-gated; do not snapshot it into acceptances.

### `is_admin()` blast radius

- Performance wrappers use `(select public.is_admin())`. Spec 07’s compatibility rewrite must preserve owner truth sets. Specs must not redefine `is_admin()` to mean “any staff”.

---

## 7. Cross-check summary (primitives)

| Primitive | Specs that touch it | Integration rule |
|---|---|---|
| `credit_batches` | 05, 06 (03 rent must **not** mint member credits) | Single entitlement store; mint only on paid settlement; respect deleted-buyer and roll-call invariants. |
| `is_admin()` | all; especially 07 | Means owner forever during compatibility; new work uses `has_capability` / `is_coach` / `is_front_desk`. |
| Agreement / onboarding receipts | 01, 02; live `member_onboarding_*` | One ledger; waiver kind shared; clinical answers separate. |
| `attendanceDraft.js` | 05 | Prefill only; save still `admin_record_session_attendance`. |
| Stripe fulfilment / webhook ledger | 06, 03 | One webhook endpoint and ledger; packs stay `mode=payment` + `fulfill_stripe_checkout`; subscriptions/rent do not bend pack guards. |

---

## 8. Immediate documentation follow-ups (no feature work)

1. Patch specs 02 / 03 / 04 / 05 role sections to defer to 07 (delete competing DDL).
2. Patch 01 to move `agreement_enforcement` off `admin_settings`; decide onboarding foundation strategy.
3. Patch 02 waiver tables to consume the shared ledger; reconcile `member_interest` health field with live consent.
4. Patch 03 collection section to consume 06’s billing spine; patch 06 “no coach login” for rent.
5. Align README active-client recommendation with 03 (or owner override).
6. Keep this file linked from `README.md`; HANDOFF §2c marks the review done.

**Do not implement features from 01–07 until the gates in §5 that apply to the chosen phase are closed.**
