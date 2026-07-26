# XERT Fitness

Vite/React frontend for the XERT Fitness website and admin tools. The app is intended to deploy on Vercel and use Supabase for auth, form submissions, class sessions, bookings and admin settings.

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

Every script below is idempotent and safe to re-run in any order. That is only
true because no script recreates a policy, function or grant in a weaker form
than a later script installs: where the hardened form needs schema a later
script adds, the earlier script emits it conditionally. `npm test` enforces this
(`test/supabase-operator-script-drift.test.js`), so add a case there whenever a
new script hardens something an existing one also defines.

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
- `src/supabase/targeted_member_notices_upgrade.sql` — lets administrators send one member a private,
  auditable in-app notice with optional APNs delivery and read/dismiss history
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
- `src/supabase/public_form_staff_column_guard.sql` — moves the five public form
  insert policies into one installer and stops an anonymous submission arriving
  with a staff servicing note already filled in
- `src/supabase/schedule_blackout_historic_edit_fix.sql` — lets a finished class
  still be edited after a blackout is recorded over it, while a blackout still
  cannot be recorded over a class that has yet to run
- `src/supabase/public_enquiry_time_guard.sql` — refuses a public "Request spot"
  enquiry against a class that has already run
- `src/supabase/my_bookings_duration.sql` — returns the real class length so the
  client's booking-overlap check matches the conflict trigger
- `src/supabase/product_currency_aud_only.sql` — refuses a session pack priced in
  a currency fulfilment can never settle, before a member is charged for it
- `src/supabase/stripe_signature_failure_ledger.sql` — records rejected webhook
  deliveries so a broken signing secret is visible to Operations Health
- `src/supabase/atomic_account_deletion.sql` — deletes a member in one
  transaction, including the legacy enquiry rows keyed only by email
- `src/supabase/roll_call_releases_pending_requests.sql` — returns the credit held
  by a booking request nobody actioned before the class was completed
- `src/supabase/admin_policy_scalar_subquery.sql` — evaluates `public.is_admin()`
  once per admin query instead of once per scanned row
- `src/supabase/member_history_index.sql` — indexes a member's own orders so the
  account page stops scanning the whole table
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
`targeted_member_notices_upgrade.sql`, then
`guarded_payment_activation_upgrade.sql`, then
`admin_settings_singleton_upgrade.sql`. Finally apply the July 2026 audit
fixes in filename order: `public_form_staff_column_guard.sql`,
`schedule_blackout_historic_edit_fix.sql`, `public_enquiry_time_guard.sql`,
`my_bookings_duration.sql`, `product_currency_aud_only.sql`,
`stripe_signature_failure_ledger.sql`, `atomic_account_deletion.sql`,
`roll_call_releases_pending_requests.sql`, `admin_policy_scalar_subquery.sql`
and `member_history_index.sql`. This sequence produces the
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
`targeted_member_notices_upgrade.sql`, then
`guarded_payment_activation_upgrade.sql`, then
`admin_settings_singleton_upgrade.sql`. Finally apply the July 2026 audit
fixes in filename order: `public_form_staff_column_guard.sql`,
`schedule_blackout_historic_edit_fix.sql`, `public_enquiry_time_guard.sql`,
`my_bookings_duration.sql`, `product_currency_aud_only.sql`,
`stripe_signature_failure_ledger.sql`, `atomic_account_deletion.sql`,
`roll_call_releases_pending_requests.sql`, `admin_policy_scalar_subquery.sql`
and `member_history_index.sql`. The scripts are idempotent;
run them in the Supabase SQL editor (or apply via the project's Postgres
connection).

Operations Health and the TestFlight release workflow verify every database
capability declared in `src/lib/schemaCapabilities.js`, including booking,
waitlist, attendance, commerce, announcements, admin notes, operational request
and schedule audit, booking lifecycle, content/configuration history, member push delivery, daily class operations, schedule integrity, public-form integrity, and database security hardening. Stripe and APNs service readiness are reported separately as release warnings until their Vercel secrets are installed. A release intentionally
stops until every required migration has been applied. Run
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
