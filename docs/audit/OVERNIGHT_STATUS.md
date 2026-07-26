# Overnight status — 26 July 2026

Branch: `cursor/xert-audit-continuation-8c8e`.

Audit queue remains **56 FIXED / 0 OPEN**. Completeness-critic items from
HANDOFF §2c stay closed. Staff roles (spec 07) were **not** implemented —
owner/legal gates and `INTEGRATION_REVIEW.md` §5 still block 01–07 feature build.

---

## Full overnight story (chronological)

### 1. Close the last open audit findings → handoff refresh
- Concurrent class edits: optimistic locking so silent overwrites stop.
- Highest-value remaining audit defects advanced and marked FIXED.
- Handoff rewritten once the 56-item queue hit **0 OPEN**.

### 2. Completeness-critic money holes (`b89a900`)
- Deleted-member fulfillment had landed on a **dead overload**; live
  `p_credit_validity_days` path now settles null buyers without granting credits.
- Checkout pauses when Ops Health already sees signature/delivery gaps.
- Expired packs reactivate on every refund path (including class cancel after
  early roll-call) via `credit_batch_refund_reactivation`.

### 3. Completeness-critic privacy + admin races (`4daeae1`)
- Older operator scripts skip replacing newer deletion / PII-redaction shapes.
- Account deletion erases email-matched public leads and anonymous PT rows.
- Health consent on PT/booking free-text; Privacy honest about injuries.
- Class/event rosters and member detail loads scoped so late responses cannot
  paint the wrong person; drafts wired into unsaved-changes guards.

### 4. Owner-requirements + design review (`137d202`, `c1dc708`)
- Specs 01–07 aligned to `INTEGRATION_REVIEW.md` (no feature build).
- Waitlist skip concurrency, product dirty guard, design-review notes.

### 5. Commerce kill-switch + waitlist skip hardening (`c09ea0e`, `52fa571`)
- Skip refuses to cancel a booking that is no longer the waitlisted head.
- Legacy account deletion matches email exactly (no `ilike` wildcards).
- Reconcile no longer pauses the store via a fake delivery gap; empty ledgers
  and already-parsed Stripe bodies become visible Ops incidents correctly.

### 6. Reconcile deleted buyers, admin 500 traces, InitPlan (`652eb83`)
- Admin reconcile recovers payments after buyer account deletion.
- Admin/push 500s carry a request id for Ops.
- Re-running older RLS operator scripts no longer undoes scalar `is_admin`
  InitPlan wraps.

### 7. Ops apply order, push toasts, live settings (`df10774`)
- README apply order documents waitlist skip.
- `availability_schema` stops undoing scalar `is_admin` InitPlans.
- Swallowed broadcast APNs failures surface; soft-launch edits require an
  explicit payment pause while checkout is live.

### 8. Revenue, privacy, roster race (`b21a2ce`)
- Pending-order write failure no longer expires the Stripe session (poisoned
  idempotency); clients clear `CHECKOUT_ATTEMPT_STALE`.
- iOS PT / class-interest notes + Rehab goal require health consent; SQL +
  Privacy aligned (`pt_rehab_goal_health_consent`).
- Class roster refresh skipped after the operator switches session.

### 9. This batch — adversarial credit / erasure pass
| Area | Defect | Fix |
|---|---|---|
| Privacy / fulfillment | After `delete_member_account` nulled `orders.email`, a late `fulfill_stripe_checkout` (webhook or reconcile) wrote Stripe’s `p_email` back onto the orphaned order | `email = null` when `orders.user_id is null` |
| Credits | Stripe full refund left attended/no_show rows holding `credit_batch_id`; later cancel / class-cancel / roll-call release restored credits onto an already-refunded pack | `refund_credits_to_batch` and bulk refund paths skip `orders.status = 'refunded'` |
| Erasure (rollout) | Legacy piecemeal delete path never called `redact_audit_subject_pii` | `api/delete-account.js` redacts before Auth delete; missing routine tolerated |
| Release gate | New capabilities missing from readiness contract | `stripe_fulfillment_deleted_email_erasure` + `refund_skips_stripe_refunded_batches` synced in `schemaCapabilities.js` + `release_readiness_check.sql` |

Migration / operator mirror:
`supabase/migrations/20260726112000_fulfillment_erasure_and_refunded_pack_guard.sql`
↔ `src/supabase/fulfillment_erasure_and_refunded_pack_guard.sql`.

---

## Morning next steps

1. Apply `20260726112000_fulfillment_erasure_and_refunded_pack_guard.sql` (and any
   earlier overnight migrations not yet in production). Confirm
   `release_readiness_check.sql` shows both new capabilities installed.
2. Smoke: delete account → delayed `checkout.session.completed` settles paid with
   **null** order email and no credit grant.
3. Smoke: Stripe-refunded pack + admin cancel of an attended booking does **not**
   increase `credit_batches.remaining`.
4. Smoke: failed checkout recording retries with the same attempt; stale-attempt
   clears and recovers on the next tap (from batch 8).
5. Do **not** implement staff roles yet — owner/legal gates in
   `docs/requirements/INTEGRATION_REVIEW.md` §5 still block 01–07 feature build.
