import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Vercel serverless function (Web Handler signature).
// Stripe calls this after a successful checkout. We verify the signature,
// record the paid order, and grant the member their session credits.
//
// The Web Handler signature gives us the raw request body via request.text(),
// which is required for Stripe signature verification.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FULFILLMENT_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);
const FULFILLABLE_PAYMENT_STATUSES = new Set(['paid', 'no_payment_required']);

function parseNonNegativeInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Returns the durable order and credit records for a Stripe event, or null
 * when the event does not represent a completed XERT payment.
 */
export function checkoutFulfillmentForEvent(event, now = new Date()) {
  if (!FULFILLMENT_EVENT_TYPES.has(event?.type)) return null;

  const checkout = event.data?.object;
  if (
    !checkout ||
    checkout.mode !== 'payment' ||
    !FULFILLABLE_PAYMENT_STATUSES.has(checkout.payment_status)
  ) {
    return null;
  }

  const metadata = checkout.metadata || {};
  const sessions = parseNonNegativeInteger(metadata.sessions_count);
  const validityDays = parseNonNegativeInteger(metadata.validity_days);

  if (
    !checkout.id ||
    !metadata.user_id ||
    !metadata.product_id ||
    !sessions ||
    validityDays === null
  ) {
    throw new Error('Checkout metadata is incomplete or invalid.');
  }

  return {
    order: {
      user_id: metadata.user_id,
      product_id: metadata.product_id,
      email: checkout.customer_details?.email || checkout.customer_email || null,
      amount_cents: checkout.amount_total,
      currency: checkout.currency || 'aud',
      status: 'paid',
      stripe_checkout_session_id: checkout.id,
      stripe_payment_intent_id:
        typeof checkout.payment_intent === 'string'
          ? checkout.payment_intent
          : checkout.payment_intent?.id || null,
      paid_at: now.toISOString(),
    },
    credit: {
      user_id: metadata.user_id,
      product_id: metadata.product_id,
      total: sessions,
      remaining: sessions,
      expires_at:
        validityDays > 0
          ? new Date(now.getTime() + validityDays * 86400000).toISOString()
          : null,
    },
  };
}

/**
 * Both tables are keyed by Stripe/session order IDs. Retried or concurrent
 * webhook deliveries can safely resume a failed grant without duplicating it.
 */
export async function persistCheckoutFulfillment(admin, fulfillment) {
  const { data: order, error: orderError } = await admin
    .from('orders')
    .upsert(fulfillment.order, { onConflict: 'stripe_checkout_session_id' })
    .select('id')
    .single();
  if (orderError || !order) {
    throw orderError || new Error('Could not record the paid order.');
  }

  const { error: creditError } = await admin
    .from('credit_batches')
    .upsert(
      { ...fulfillment.credit, order_id: order.id },
      { onConflict: 'order_id', ignoreDuplicates: true }
    );
  if (creditError) throw creditError;
}

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    return new Response('Stripe is not configured.', { status: 500 });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response('Supabase is not configured.', { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const signature = request.headers.get('stripe-signature');
  const rawBody = await request.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (e) {
    return new Response(`Webhook signature verification failed: ${e.message}`, { status: 400 });
  }

  try {
    const fulfillment = checkoutFulfillmentForEvent(event);
    if (fulfillment) await persistCheckoutFulfillment(admin, fulfillment);
  } catch (e) {
      // 500 makes Stripe retry delivery.
      return new Response(`Handler error: ${e.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
