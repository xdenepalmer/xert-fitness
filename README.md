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

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` must also be set in Vercel so the
build has them. The serverless functions reuse `VITE_SUPABASE_URL` if
`SUPABASE_URL` is not set.

### Stripe webhook

After deploying, create a Stripe webhook endpoint pointing at
`https://<your-domain>/api/stripe-webhook` for the `checkout.session.completed`
event, then copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

## Database

The Supabase schema is defined in:

- `src/supabase/rls_policies.sql` — lead/booking tables + Row Level Security
- `src/supabase/booking_schema.sql` — members, session packs, orders, credits,
  bookings, coaches, events, and the booking functions

Both are idempotent; run them in the Supabase SQL editor (or apply via the
project's Postgres connection) to (re)provision the schema.

## Run Locally

```bash
npm run dev
```

Open the local URL printed by Vite.

## Checks

```bash
npm run lint
npm run build
```

`npm run typecheck` exists, but this JavaScript project still has broader typing debt in shared UI/admin files.

## Deploy

Deploy through the existing Vercel project.

Recommended Vercel settings:

- Framework preset: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

## Supabase

Database and RLS policy notes live in `src/supabase/rls_policies.sql`.
