# XERT Stripe Launch Runbook

Use this sequence for the first Stripe integration and again before switching
from test mode to live payments. Never place secret keys in Git, Vite variables,
the iOS project, or Codemagic build logs.

## 1. Prepare Stripe

1. Apply `supabase/migrations/20260715010000_stripe_payment_fulfillment.sql`
   in the production Supabase SQL Editor. This makes payment settlement atomic
   and prevents delayed webhook retries from reversing refunds.
   Until this capability is installed, `/api/checkout` returns HTTP `503`
   before creating a Stripe session, so no customer can be charged prematurely.
2. Apply `supabase/migrations/20260716010000_guarded_payment_activation.sql`.
   This forces every paused-to-enabled payment transition through the protected
   server preflight while preserving immediate owner shutdown from either admin app.
3. Apply `supabase/migrations/20260716020000_admin_settings_singleton.sql`.
   This repairs the settings version timestamp and guarantees checkout, web and
   iOS all observe one authoritative owner payment switch.
4. Apply `supabase/migrations/20260716030000_stripe_pending_order_guard.sql`.
   This requires the matching XERT pending order before a paid webhook can grant
   credits; out-of-band Stripe sessions cannot synthesize member purchases.
5. Apply `supabase/migrations/20260716040000_stripe_order_terms_snapshot.sql`.
   This records the purchased credit quantity and validity on the pending order,
   makes those terms immutable, and derives expiry inside the settlement transaction.
6. Apply `supabase/migrations/20260716050000_stripe_webhook_ledger.sql`.
   This records every verified delivery attempt, retry, terminal outcome and
   linked order for owner-visible payment operations health.
7. Complete the Australian business profile, bank account and identity checks.
8. Confirm that **Charges enabled** and **Payouts enabled** are both true.
9. Create one one-time Stripe Price in AUD for every active XERT session pack.
10. Copy each `price_...` identifier into **iOS Admin > Session Packs** and save.
11. Do not change the amount or currency of a linked pack. Create a new Stripe
   Price and update the pack instead.

## 2. Configure Vercel

Set these in the Production environment and redeploy:

```text
STRIPE_SECRET_KEY=sk_test_...       # use sk_live_... only at live cutover
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE_KEY=...
APP_BASE_URL=https://xert-fitness.vercel.app
VITE_SUPABASE_URL=https://ugmkwoapjcpiucsrxwzt.supabase.co
```

The secret-key mode and every Stripe Price mode must match. Live checkout is
deliberately blocked when an active pack has no stable Stripe Price ID.

The repository includes an idempotent catalog linker so this does not need to
be a manual copy-and-paste operation. It reads active packs, reuses matching
Stripe Products and one-time Prices, and compare-and-set links each Price ID in
Supabase. It defaults to a read-only dry run:

```bash
npm run stripe:catalog:live
npm run stripe:catalog:live:apply
```

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `STRIPE_SECRET_KEY` in the
operator shell first. `SUPABASE_SERVICE_ROLE_KEY` accepts either the recommended
Supabase `sb_secret_...` key or the legacy service-role JWT; never use a public
key. The script requires the canonical XERT Supabase project and a Stripe key
matching the explicit mode. If replacing existing test Price
IDs during live cutover, review the dry run and then run
`npm run stripe:catalog:live:replace`. The script never prints secret values.
It validates the complete catalog and every existing Stripe link before creating
anything. Database linking compares the loaded pack version, amount, currency,
session count, validity and active state; if a pack changes mid-run, that link is skipped
with an error. Stripe creation is idempotent, so review the changed pack and
rerun the same command rather than manually attaching the partially created Price.
Every created Price is bound to the immutable XERT product ID, slug, credit count
and validity in Stripe metadata. Checkout and release health reject a same-value
Price from another app or an older version of the pack.

## 3. Register The Webhook

Create this endpoint in the same Stripe mode as the secret key:

```text
https://xert-fitness.vercel.app/api/stripe-webhook
```

Subscribe to exactly these required events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.expired
checkout.session.async_payment_failed
charge.refunded
```

Copy that endpoint's `whsec_...` signing secret to Vercel and redeploy.
XERT rejects a signed test event when `STRIPE_SECRET_KEY` is live, and rejects
a signed live event when the key is test. A `500` delivery mentioning an event
mode mismatch means the Vercel key and webhook endpoint were created in
different Stripe modes; correct the environment instead of replaying it across
modes.

## 4. Verify In XERT

Run the read-only production boundary check before opening Stripe or spending a
Codemagic build. It never creates a Checkout Session, refund or database row:

```bash
npm run check:stripe
```

The first check is a body-free `HEAD /api/checkout` environment gate. HTTP
`204` proves the canonical app and Supabase origins plus the required private
Vercel payment settings are present; HTTP `503` reveals no values and prevents
a false-green release audit.

The command must report eleven `PASS` results. A webhook `503` means the Vercel
Stripe service is unavailable, normally because its private secrets are absent;
a missing fulfillment contract means the migration in step 1 has not been
installed. A missing activation guard means the guarded activation migration in
step 2 has not been installed. Keep **Session pack payments** disabled until all
eleven checks pass. A missing settings contract means the migration in step 3
has not repaired the versioned singleton platform settings. A missing recorded-
order guard means the migration in step 4 has not hardened webhook fulfillment.
A missing purchased-terms snapshot means the migration in step 5 has not bound
the credit quantity and validity to the order recorded before payment.
A missing delivery ledger means the migration in step 6 has not installed
durable webhook attempt and outcome tracking.

Open **iOS Admin > Operations Health** and require all of the following:

- Stripe mode is the intended `TEST` or `LIVE` mode.
- Business verification, charges and payouts are ready.
- Every active pack is Stripe-linked.
- The production webhook is registered and has all required events.
- The database contract is fully installed.

Finally, run the combined read-only launch gate from an operator shell containing
the live Stripe and Supabase secrets:

```bash
npm run stripe:launch:check
```

This reruns the eleven deployed boundary checks and inspects every active pack
against live Stripe. It passes only when all packs already have exact, active,
one-time AUD Prices bound to their current XERT product identity, session count
and validity. A dry-run `PLAN` is a release failure: review it, run
`npm run stripe:catalog:live:apply`, and rerun the combined gate until it reports
zero planned changes. The command is read-only and never prints private keys.

## 5. Test Purchase

1. Sign in as a non-admin test member with no special database access.
2. Purchase the lowest-priced pack through the website.
3. Confirm one paid order and exactly one credit batch appear.
4. Repeat from iOS and confirm the app returns to XERT and refreshes credits.
5. Retry or double-tap checkout and confirm XERT reuses the open unpaid session.
6. Refund the test order from **Admin > Finance**.
7. Confirm Stripe, the XERT order, unused credits and future bookings reconcile.
8. Confirm Operations Health remains green.

## 6. Live Cutover

1. Replace test Price IDs with live Price IDs in Session Packs.
2. Replace `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` with live values.
3. Redeploy Vercel.
4. Reopen Operations Health; require `LIVE` and every check green.
5. Run one low-value real card purchase, verify the receipt and refund it.

## Rollback

If any live check fails, disable **Session pack payments** in **Admin > Platform
Controls**. This server-side switch blocks new website and iOS Checkout sessions;
do not delete Stripe records. Preserve orders and webhook history for
reconciliation. Restore the previous Vercel deployment or correct the affected
secret/Price, redeploy, then use **Admin > Finance > Check and reconcile payment**
for any customer whose payment status is uncertain.
