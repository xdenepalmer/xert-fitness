# Overnight status — 26 July 2026

Branch: `cursor/xert-audit-continuation-8c8e` (tip after this batch).

## Closed this batch

| Area | Defect | Fix |
|---|---|---|
| Revenue | Pending-order write failure expired the Stripe session, poisoning the stable idempotency key for ~20 minutes | Leave session open on `CHECKOUT_RECORDING_FAILED`; return `CHECKOUT_ATTEMPT_STALE` when idempotency replays a dead session; clients clear attempt |
| Privacy | iOS PT / class-interest forms collected notes (and PT rehab goal) without health consent; Privacy copy omitted rehab | Web + iOS consent UI/models; `submitForms` + SQL installer guard (`20260726111000_pt_rehab_goal_health_consent.sql`); Privacy disclosure |
| Ops | Class roster/booking status mutations refreshed the old session after the operator switched class | Skip post-mutation `refreshBookings` when `expandedBookings` changed |
| Ops docs | Newest SQL mirrors (through rehab consent) in README apply order | Listed `pt_rehab_goal_health_consent.sql`; older public-form installers keep the rehab clause on re-run |

Audit queue remains **56 FIXED / 0 OPEN**. Completeness-critic items from HANDOFF §2c stay closed.

## Morning next steps

1. Apply `supabase/migrations/20260726111000_pt_rehab_goal_health_consent.sql` (or the `src/supabase/` mirror) in production; confirm `release_readiness_check.sql` shows `pt_rehab_goal_health_consent` installed.
2. Smoke: failed checkout after a recording glitch retries with the same attempt; a stale-attempt response clears and recovers on the next tap.
3. Smoke: iOS PT request with notes or Rehab goal requires the health toggle before send.
4. Do **not** implement staff roles yet — owner/legal gates and spec alignment in `docs/requirements/INTEGRATION_REVIEW.md` §5 still block 01–07 feature build.
