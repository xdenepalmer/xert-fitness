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
```

Set this non-secret server configuration as well, using the canonical public
website URL (without a trailing slash):

```bash
APP_BASE_URL=https://your-domain.example
```

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` must also be set in Vercel so the
build has them. The serverless functions reuse `VITE_SUPABASE_URL` if
`SUPABASE_URL` is not set.

### Stripe webhook

After deploying, create a Stripe webhook endpoint pointing at
`https://<your-domain>/api/stripe-webhook` for both
`checkout.session.completed` and `checkout.session.async_payment_succeeded`,
then copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

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
- `src/supabase/payment_fulfillment_upgrade.sql` — one-time Stripe safeguard
  that guarantees a paid order grants at most one credit batch
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
- `src/supabase/business_metrics_upgrade.sql` — indexes exact paged revenue and
  active-credit dashboard scans as order volume grows
- `src/supabase/attendance_roll_call_upgrade.sql` — adds atomic class roll call,
  attendance audit metadata, and automatic class completion
- `src/supabase/member_waitlist_upgrade.sql` — lets signed-in members join a
  full class waitlist without consuming a credit
- `src/supabase/member_pt_request_tracking.sql` — links PT requests to signed-in
  members and enforces a trusted initial request status, consent and ownership
- `src/supabase/public_form_integrity_upgrade.sql` — prevents direct clients
  from forging staff-managed lead and booking statuses or bypassing consent
- `src/supabase/seed_events.sql` — the XERT 2026 South East Queensland event calendar

For a fresh database: first create the lead/request tables (`member_interest`,
`trainer_interest`, `partner_interest`, `class_bookings`,
`private_session_requests`, `class_sessions`, `admin_settings`) — these were
originally created through the Supabase dashboard and no checked-in SQL file
creates them, so `rls_policies.sql` will error if they don't exist yet. Then
run `booking_schema.sql`, `admin_cms_schema.sql`, `availability_schema.sql`,
`rls_policies.sql`, `rls_hardening.sql`, and finally
`member_pt_request_tracking.sql` and `public_form_integrity_upgrade.sql`. This
sequence produces the
hardened state: every admin-scope policy checks `public.is_admin()` (a
signed-in user whose `profiles.role` is `'admin'`), never just "any
authenticated user". `rls_hardening.sql` runs last because it also adds the
profile-privilege trigger and the availability/blackout policies.
For the already-deployed XERT database, run `booking_modes_upgrade.sql`,
`payment_fulfillment_upgrade.sql`, `availability_schema.sql`, and
`rls_hardening.sql`, `product_validation_upgrade.sql`, and
`event_goals_upgrade.sql`, `credit_grant_audit_upgrade.sql`, and
`admin_role_safety_upgrade.sql`, `admin_member_search_upgrade.sql`,
`business_metrics_upgrade.sql`, and
`admin_member_directory_upgrade.sql`, `admin_member_notes_upgrade.sql`,
`attendance_roll_call_upgrade.sql`, and
`member_waitlist_upgrade.sql` after
those prerequisites, followed by `member_pt_request_tracking.sql` and
`public_form_integrity_upgrade.sql`. The scripts are idempotent;
run them in the Supabase SQL editor (or apply via the project's Postgres
connection).

Operations Health and the TestFlight release workflow verify the
`admin_role_safety`, `booking_waitlist_withdrawal`, `member_waitlist_join`,
`attendance_roll_call`, `member_pt_request_tracking`, and
`public_form_integrity` capability markers. A release intentionally stops until
all six current upgrade scripts have been run. Run
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
