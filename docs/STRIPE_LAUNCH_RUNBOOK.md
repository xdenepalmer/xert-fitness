# XERT Stripe Launch Runbook

Use this sequence for the first Stripe integration and again before switching
from test mode to live payments. Never place secret keys in Git, Vite variables,
the iOS project, or Codemagic build logs.

## 1. Prepare Stripe

1. Complete the Australian business profile, bank account and identity checks.
2. Confirm that **Charges enabled** and **Payouts enabled** are both true.
3. Create one one-time Stripe Price in AUD for every active XERT session pack.
4. Copy each `price_...` identifier into **iOS Admin > Session Packs** and save.
5. Do not change the amount or currency of a linked pack. Create a new Stripe
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

Open **iOS Admin > Operations Health** and require all of the following:

- Stripe mode is the intended `TEST` or `LIVE` mode.
- Business verification, charges and payouts are ready.
- Every active pack is Stripe-linked.
- The production webhook is registered and has all required events.
- The database contract is fully installed.

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

If any live check fails, disable public bookings in **Admin > Platform Controls**
and do not delete Stripe records. Preserve orders and webhook history for
reconciliation. Restore the previous Vercel deployment or correct the affected
secret/Price, redeploy, then use **Admin > Finance > Check and reconcile payment**
for any customer whose payment status is uncertain.
