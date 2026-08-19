# XERT Fitness

Vite/React frontend for the XERT Fitness website and admin tools. The app is intended to deploy on Vercel and use Supabase for auth, form submissions, class sessions, bookings and admin settings.

> Deployment note: the Vercel project runs on a Hobby plan, which only
> auto-deploys this repository while it is public. If pushes stop deploying
> and Vercel shows "Deployment Blocked", check the repo has not been switched
> to private (that silently blocked every deploy between 13–19 Aug 2026).

## Prerequisites

1. Install Node.js.
2. Install dependencies:

```bash
npm install
```

## Environment

The app talks to the **XERT FITNESS** Supabase project (ref `ugmkwoapjcpiucsrxwzt`).

### Client (browser) — required for `npm run dev` and the Vite build

```bash
VITE_SUPABASE_URL=https://ugmkwoapjcpiucsrxwzt.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_public_key
```

The anon/publishable key is safe to expose in the browser. Find it in
Supabase → Project Settings → API → Project API keys → `anon public`.

### Server (Vercel serverless `/api` — Stripe checkout & webhook)

Set these in **Vercel Project Settings → Environment Variables** (Production +
Preview). They are secret and must never be committed or exposed to the client:

```bash
SUPABASE_SERVICE_ROLE_KEY=...   # Supabase → Settings → API → service_role (SECRET)
STRIPE_SECRET_KEY=sk_live_...   # or sk_test_... while testing
STRIPE_WEBHOOK_SECRET=whsec_...  # from the Stripe webhook endpoint you create
# Optional only during signing-secret rotation:
STRIPE_WEBHOOK_SECRET_PREVIOUS=whsec_...
```

Set this non-secret server configuration as well, using the canonical public
website URL (without a trailing slash):

```bash
APP_BASE_URL=https://xert-fitness.vercel.app
```

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` must also be set in Vercel so the
build has them. The serverless functions reuse `VITE_SUPABASE_URL` if
`SUPABASE_URL` is not set.

### Stripe webhook

After deploying, create a Stripe webhook endpoint pointing at
`https://<your-domain>/api/stripe-webhook` for both
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.expired`, `checkout.session.async_payment_failed`,
`charge.refunded`, `charge.dispute.created`, and `charge.dispute.closed`,
then copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

Use [docs/STRIPE_LAUNCH_RUNBOOK.md](docs/STRIPE_LAUNCH_RUNBOOK.md) for the
complete test-mode setup, owner health checks, purchase/refund proof, live
cutover and rollback sequence.

Use [docs/LAUNCH_DAY_RUNBOOK.md](docs/LAUNCH_DAY_RUNBOOK.md) for the complete
owner go/no-go check, member smoke path, kill switches, incident response and
evidence checklist for public launch day.

The live cutover uses two read-only gates: `npm run stripe:launch:check` requires
checkout to remain paused while configuration is verified, then
`npm run stripe:launch:verify` proves guarded activation is retained and has a
matching immutable admin audit receipt before the first real card purchase.
Checkout also pauses automatically when a paid-session webhook has failed or
remained in processing for ten minutes, and resumes only after Operations Health
has safely settled the durable delivery record.

For zero-downtime webhook secret rotation, first move the currently active
secret into `STRIPE_WEBHOOK_SECRET_PREVIOUS`, install the new endpoint secret as
`STRIPE_WEBHOOK_SECRET`, and redeploy. After Stripe deliveries verify against
the new secret, remove `STRIPE_WEBHOOK_SECRET_PREVIOUS` and redeploy again. The
two values must be distinct; the previous slot is optional and never a permanent
substitute for the primary secret.

## Database

The Supabase schema is defined in:

- `src/supabase/rls_policies.sql` — Row Level Security for the lead/booking
  form tables and admin settings; admin access is role-gated via
  `public.is_admin()` (aligned with `rls_hardening.sql`, so re-running it never
  downgrades a hardened database)
- `src/supabase/booking_schema.sql` — members, session packs, orders, credits,
  bookings, coaches, events, and the booking functions
- `src/supabase/admin_cms_schema.sql` — CMS, member/admin actions and class
  roster functions
- `src/supabase/availability_schema.sql` — staff availability and blackout
  records, validation, and admin-only access
- `src/supabase/rls_hardening.sql` — role-gated admin RLS policies and profile
  privilege protection; re-run it after pulling security updates
- `src/supabase/booking_modes_upgrade.sql` — one-time upgrade for an existing
  deployment: instant bookings, staff-confirmed requests, and interest-only
  classes now behave differently end to end; re-run it to add transactional
  staff class cancellation with automatic member credit returns
- `src/supabase/stripe_payment_fulfillment_upgrade.sql` — one-time Stripe safeguard
  that guarantees a paid recorded order grants at most one credit batch and
  rejects webhook fulfillment without checkout's pending order; it also snapshots
  immutable credit quantity and validity terms and derives expiry transactionally
- `src/supabase/stripe_webhook_ledger_upgrade.sql` — durable, admin-readable
  Stripe delivery attempts, retries, failures, terminal outcomes and order links
- `src/supabase/guarded_payment_activation_upgrade.sql` — requires a fresh
  protected Stripe preflight before checkout can move from paused to enabled
- `src/supabase/admin_settings_singleton_upgrade.sql` — repairs the launch
  settings version and enforces one authoritative platform/payment switch
- `src/supabase/product_validation_upgrade.sql` — validates product price,
  currency, credit count, and expiry before checkout can use a pack
- `src/supabase/event_goals_upgrade.sql` — lets members choose a calendar event
  to train toward and gives admins a contactable roster for each training group
- `src/supabase/credit_grant_audit_upgrade.sql` — makes manual admin credit
  grants retry-safe and records who granted them and why
- `src/supabase/admin_role_safety_upgrade.sql` — prevents the final admin from
  being demoted and records every privilege change
- `src/supabase/admin_member_search_upgrade.sql` — adds bounded server-side
  member search for the admin command palette
- `src/supabase/admin_member_directory_upgrade.sql` — adds server-filtered
  member directory paging, exact member deep links and complete paged exports
- `src/supabase/admin_member_notes_upgrade.sql` — adds an admin-only member
  servicing timeline with immutable authorship and reversible archiving
- `src/supabase/admin_member_follow_up_upgrade.sql` — adds a bounded queue for
  first-booking, inactive-credit and renewal follow-up with a contact cooldown
- `src/supabase/business_metrics_upgrade.sql` — indexes exact paged revenue and
  active-credit dashboard scans as order volume grows
- `src/supabase/attendance_roll_call_upgrade.sql` — adds atomic class roll call,
  attendance audit metadata, and automatic class completion
- `supabase/migrations/20260713000000_class_session_update_guard.sql` — prevents class edits from
  bypassing credit-safe cancellation, roll-call completion, or roster capacity
- `src/supabase/member_waitlist_upgrade.sql` — lets signed-in members join a
  full class waitlist without consuming a credit
- `src/supabase/waitlist_fifo_promotion_upgrade.sql` — displays member queue
  positions and atomically promotes only the next waitlisted member, with a
  bounded operational waitlist desk for admins
- `src/supabase/member_pt_request_tracking.sql` — links PT requests to signed-in
  members and enforces a trusted initial request status, consent and ownership
- `src/supabase/public_form_integrity_upgrade.sql` — prevents direct clients
  from forging staff-managed lead and booking statuses or bypassing consent
- `src/supabase/admin_request_status_audit_upgrade.sql` — makes booking and PT
  status/notes changes atomic and records immutable administrator history
- `src/supabase/member_push_notifications_upgrade.sql` — stores protected iOS
  device subscriptions and APNs delivery history for published member notices
- `src/supabase/announcement_archival_upgrade.sql` — preserves published notice
  history through archive/restore and records immutable administrator actions
- `src/supabase/lead_pipeline_audit_upgrade.sql` — makes individual and bulk
  lead-pipeline changes atomic and records immutable administrator history
- `src/supabase/schedule_change_audit_upgrade.sql` — records immutable class,
  availability and blackout lifecycle history for operational accountability
- `src/supabase/content_change_audit_upgrade.sql` — records immutable CMS,
  coach, event, session-pack and launch-setting administrator history
- `src/supabase/booking_lifecycle_audit_upgrade.sql` — records immutable member,
  administrator and system booking, waitlist, cancellation and attendance history
- `src/supabase/class_cancellation_notifications_upgrade.sql` — creates private,
  durable member notices and targeted Apple push delivery when staff cancel a class
- `src/supabase/admin_daily_operations_upgrade.sql` — powers an admin-only,
  Brisbane-local daily class desk with bounded roster, queue and attendance counts
- `src/supabase/shared_admin_optimistic_locking_upgrade.sql` — prevents stale CMS,
  launch-setting and announcement actions from overwriting another administrator's work
- `src/supabase/catalog_optimistic_locking_upgrade.sql` — adds version-aware coach,
  event and session-pack editing so concurrent administrators cannot overwrite newer catalogue work
- `supabase/migrations/20260720000000_product_commercial_terms_guard.sql` — prevents an active pack
  from losing its Stripe Price ID and requires a replacement Price when amount, currency, credits or validity change
- `src/supabase/member_booking_switch_guard_upgrade.sql` — makes the owner
  booking switch authoritative for new member places at the database boundary
- `src/supabase/member_onboarding_upgrade.sql` — adds privacy-minimised member
  readiness: an emergency contact, immutable versioned acknowledgements,
  append-only acceptance receipts, completion-only owner summaries and audited
  deliberate emergency-contact reveals; it stores no screening answers, date of
  birth, diagnoses, injuries, free-text safety notes, waiver or clearance outcome
- `supabase/migrations/20260721020000_member_activation_cockpit.sql` — adds an
  admin-only, derived 30-day activation journey and bounded follow-up queue for
  current readiness, training access, first booking and recorded attendance;
  it exposes no emergency-contact values or document contents
- `supabase/migrations/20260722010000_owner_stripe_price_provisioning.sql` — lets the authenticated owner create or reuse an exact Stripe Price from Command Centre and atomically link it to the unchanged private draft without publishing it
- `supabase/migrations/20260811010000_xert_forms_surveys.sql` — adds the owner Forms & Surveys builder, bounded public submissions, response workflows and analytics storage for web and iOS; it intentionally contains no client linking or competition draw data
- `src/supabase/targeted_member_notices_upgrade.sql` — lets administrators send one member a private,
  auditable in-app notice with optional APNs delivery and read/dismiss history
- `src/supabase/staff_assisted_booking_upgrade.sql` — lets Class Desk safely
  confirm or FIFO-waitlist an existing member with atomic capacity and credit
  enforcement, retry receipts, and a private member notice
- `src/supabase/class_cancellation_credit_refund_fix.sql` — repairs the class-cancellation
  refund so members get their credit back when staff cancel a class (the original refund
  filtered on the post-update status and therefore always refunded nothing)
- `src/supabase/audit_immutability_account_deletion_fix.sql` — lets an account with audit
  history actually be deleted, by allowing the referential `on delete set null` update
  through the five audit-immutability triggers while still blocking any content change
- `src/supabase/stripe_fulfillment_deleted_member_fix.sql` — stops one deleted member's
  order from failing fulfilment forever and gating checkout for every other member
- `src/supabase/roll_call_correction_double_credit_fix.sql` — stops a roll-call
  correction from charging the member a second credit for the same class
- `src/supabase/sql_drift_repair.sql` — prevents re-running documented setup
  files from exposing private member notices or weakening member email protection
- `src/supabase/workout_of_the_day_upgrade.sql` — one workout per day for the
  in-club TV display (`/display`); `workout_date` is the primary key so a second
  workout can never exist for the same day, published rows are readable by anon
  because a television cannot sign in, and drafts stay admin-only
- `src/supabase/seed_events.sql` — the XERT 2026 South East Queensland event calendar

For a fresh database: first create the lead/request tables (`member_interest`,
`trainer_interest`, `partner_interest`, `class_bookings`,
`private_session_requests`, `class_sessions`, `admin_settings`) — these were
originally created through the Supabase dashboard and no checked-in SQL file
creates them, so `rls_policies.sql` will error if they don't exist yet. Then
run `booking_schema.sql`, `admin_cms_schema.sql`, `availability_schema.sql`,
`rls_policies.sql`, `rls_hardening.sql`, and finally
`member_pt_request_tracking.sql`, `public_form_integrity_upgrade.sql`, and
`admin_request_status_audit_upgrade.sql`, then
`member_push_notifications_upgrade.sql`, then
`announcement_archival_upgrade.sql`, then
`lead_pipeline_audit_upgrade.sql`, then
`schedule_change_audit_upgrade.sql`, then
`content_change_audit_upgrade.sql`, then
`booking_lifecycle_audit_upgrade.sql`, then
`class_cancellation_notifications_upgrade.sql`, then
`admin_daily_operations_upgrade.sql`, then
`shared_admin_optimistic_locking_upgrade.sql`, then
`catalog_optimistic_locking_upgrade.sql`, then
`supabase/migrations/20260720000000_product_commercial_terms_guard.sql`, then
`targeted_member_notices_upgrade.sql`, then
`waitlist_promotion_notifications_upgrade.sql`, then
`guarded_payment_activation_upgrade.sql`, then
`admin_settings_singleton_upgrade.sql`, then
`member_booking_switch_guard_upgrade.sql`, then
`member_onboarding_upgrade.sql`, then
`supabase/migrations/20260721020000_member_activation_cockpit.sql`. This sequence produces the
hardened state: every admin-scope policy checks `public.is_admin()` (a
signed-in user whose `profiles.role` is `'admin'`), never just "any
authenticated user". `rls_hardening.sql` runs last because it also adds the
profile-privilege trigger and the availability/blackout policies.
For the already-deployed XERT database, run `booking_modes_upgrade.sql`,
`stripe_payment_fulfillment_upgrade.sql`, `availability_schema.sql`, and
`rls_hardening.sql`, `product_validation_upgrade.sql`, and
`event_goals_upgrade.sql`, `credit_grant_audit_upgrade.sql`, and
`admin_role_safety_upgrade.sql`, `admin_member_search_upgrade.sql`,
`business_metrics_upgrade.sql`, and
`admin_member_directory_upgrade.sql`, `admin_member_notes_upgrade.sql`,
`admin_member_follow_up_upgrade.sql`,
`attendance_roll_call_upgrade.sql`, the class-session, product, and Stripe refund reconciliation migrations, and
`member_waitlist_upgrade.sql`, `waitlist_fifo_promotion_upgrade.sql` after
those prerequisites, followed by `member_pt_request_tracking.sql` and
`public_form_integrity_upgrade.sql`, then
`admin_request_status_audit_upgrade.sql` and
`member_push_notifications_upgrade.sql`, then
`announcement_archival_upgrade.sql`, then
`lead_pipeline_audit_upgrade.sql`, then
`schedule_change_audit_upgrade.sql`, then
`content_change_audit_upgrade.sql`, then
`booking_lifecycle_audit_upgrade.sql`, then
`class_cancellation_notifications_upgrade.sql`, then
`admin_daily_operations_upgrade.sql`, then
`shared_admin_optimistic_locking_upgrade.sql`, then
`catalog_optimistic_locking_upgrade.sql`, then
`supabase/migrations/20260720000000_product_commercial_terms_guard.sql`, then
`targeted_member_notices_upgrade.sql`, then
`waitlist_promotion_notifications_upgrade.sql`, then
`guarded_payment_activation_upgrade.sql`, then
`admin_settings_singleton_upgrade.sql`, then
`member_booking_switch_guard_upgrade.sql`, then
`member_onboarding_upgrade.sql`, then
`supabase/migrations/20260721020000_member_activation_cockpit.sql`, then
`supabase/migrations/20260722010000_owner_stripe_price_provisioning.sql`. The scripts are idempotent;
run them in the Supabase SQL editor (or apply via the project's Postgres
connection).

Operations Health and the TestFlight release workflow verify every database
capability declared in `src/lib/schemaCapabilities.js`, including booking,
waitlist, attendance, commerce, announcements, admin notes, operational request
and schedule audit, booking lifecycle, content/configuration history, member
onboarding, member push delivery, daily class operations, schedule integrity,
public-form integrity, and database security hardening. Stripe and APNs service
readiness are required launch gates: APNs also requires a production owner device
and a successful private owner push test from the last 24 hours. A release
intentionally stops until every required migration and service proof is current. Run
`src/supabase/release_readiness_check.sql` in the production SQL editor first;
every row must show `installed = true` and `release_ready = true`.

The admin Event Calendar also has a **Load 2026 Calendar** action that inserts
any missing XERT calendar events for an authenticated admin.

## iOS App

A SwiftUI companion app lives in `ios/XertFitnessApp`. It includes
native Home, Book, Events and Account tabs, Supabase auth, Keychain token
storage, an optional Face ID/Touch ID privacy lock, class booking RPC support,
confirmed-class device reminders and Vercel checkout launch. See
`ios/XertFitnessApp/README.md` for Xcode setup.

## Run Locally

```bash
npm run dev
```

Open the local URL printed by Vite.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run typecheck` checks the JavaScript/JSX sources with TypeScript and should pass alongside lint and the production build.

## Deploy

Deploy through the existing Vercel project.

Recommended Vercel settings:

- Framework preset: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

## Supabase

Database and RLS policy notes live in `src/supabase/rls_policies.sql` and
`src/supabase/rls_hardening.sql`.
