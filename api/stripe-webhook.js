import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { requestHeader, requestText, sendJson, sendText } from './http.js';

// Stripe calls this after a successful checkout. We verify the signature,
// record the paid order, and grant the member their session credits.

export const config = { api: { bodyParser: false } };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FULFILLMENT_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);
const FULFILLABLE_PAYMENT_STATUSES = new Set(['paid', 'no_payment_required']);
const FAILURE_EVENT_TYPES = new Set([
  'checkout.session.expired',
  'checkout.session.async_payment_failed',
]);
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

export function validStripeSignatureHeader(value) {
  const header = String(value || '').trim();
  if (!header || header.length > 4096) return false;
  const parts = header.split(',').map(part => part.trim());
  const timestamp = parts.find(part => part.startsWith('t='))?.slice(2);
  const signatures = parts
    .filter(part => part.startsWith('v1='))
    .map(part => part.slice(3));
  return /^\d+$/.test(timestamp || '')
    && signatures.some(signature => /^[a-f0-9]{16,}$/i.test(signature));
}

export function webhookRequestIssue({ contentType, signature, rawBody }) {
  if (!String(contentType || '').toLowerCase().startsWith('application/json')) {
    return { status: 415, message: 'Webhook content type must be application/json.' };
  }
  if (!validStripeSignatureHeader(signature)) {
    return { status: 400, message: 'Invalid webhook signature.' };
  }
  const bodyBytes = Buffer.byteLength(String(rawBody || ''), 'utf8');
  if (bodyBytes === 0) return { status: 400, message: 'Webhook body is required.' };
  if (bodyBytes > MAX_WEBHOOK_BODY_BYTES) {
    return { status: 413, message: 'Webhook body is too large.' };
  }
  return null;
}

export function stripeModeForSecret(secretKey) {
  if (/^sk_live_/.test(secretKey || '')) return 'live';
  if (/^sk_test_/.test(secretKey || '')) return 'test';
  return 'unknown';
}

export function assertStripeEventMode(event, secretKey) {
  const keyMode = stripeModeForSecret(secretKey);
  if (keyMode === 'unknown') {
    throw new Error('Stripe secret key mode could not be verified.');
  }
  if (typeof event?.livemode !== 'boolean') {
    throw new Error('Stripe event mode is missing.');
  }
  const eventMode = event.livemode ? 'live' : 'test';
  if (eventMode !== keyMode) {
    throw new Error(`Stripe ${eventMode} event does not match the ${keyMode} secret key.`);
  }
  return keyMode;
}

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

  return checkoutFulfillmentForSession(event.data?.object, now);
}

/**
 * Builds the shared, idempotent order/credit payload from a verified Stripe
 * Checkout Session. Webhooks and explicit admin recovery both use this path.
 */
export function checkoutFulfillmentForSession(checkout, now = new Date()) {

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
  const latestCharge = typeof checkout.payment_intent === 'object'
    ? checkout.payment_intent?.latest_charge
    : null;
  const chargeCreated = typeof latestCharge === 'object' ? latestCharge?.created : null;
  const paidAt = Number.isSafeInteger(chargeCreated) && chargeCreated > 0
    ? new Date(chargeCreated * 1000)
    : now;

  if (
    !checkout.id ||
    !metadata.user_id ||
    !metadata.product_id ||
    !sessions ||
    validityDays === null ||
    !Number.isSafeInteger(checkout.amount_total) ||
    checkout.amount_total <= 0 ||
    String(checkout.currency || '').toLowerCase() !== 'aud'
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
      paid_at: paidAt.toISOString(),
    },
    credit: {
      user_id: metadata.user_id,
      product_id: metadata.product_id,
      total: sessions,
      validity_days: validityDays,
      remaining: sessions,
      expires_at:
        validityDays > 0
          ? new Date(paidAt.getTime() + validityDays * 86400000).toISOString()
          : null,
    },
  };
}

export function stripeRefundForEvent(event, now = new Date()) {
  if (event?.type !== 'charge.refunded') return null;
  const charge = event.data?.object;
  const paymentIntentId = typeof charge?.payment_intent === 'string'
    ? charge.payment_intent
    : charge?.payment_intent?.id;
  const refunds = charge?.refunds?.data || [];
  const refund = refunds.find(item => item?.status === 'succeeded') || refunds[0];
  if (charge?.refunded !== true || charge?.amount_refunded !== charge?.amount) return null;
  if (
    !event.id || !charge?.id
    || !Number.isSafeInteger(charge.amount) || charge.amount <= 0
    || !paymentIntentId || !refund?.id
    || !/^[a-z]{3}$/i.test(String(charge.currency || ''))
  ) {
    throw new Error('Full refund data is incomplete or invalid.');
  }
  return {
    p_refund_id: refund.id,
    p_event_id: event.id,
    p_payment_intent_id: paymentIntentId,
    p_charge_id: charge.id,
    p_amount_cents: charge.amount_refunded,
    p_currency: charge.currency,
    p_refunded_at: new Date((refund.created || event.created || Math.floor(now.getTime() / 1000)) * 1000).toISOString(),
  };
}

export async function persistStripeRefund(admin, refund) {
  const { error } = await admin.rpc('reconcile_stripe_order_refund', refund);
  if (error) throw error;
}

/**
 * Both tables are keyed by Stripe/session order IDs. Retried or concurrent
 * webhook deliveries can safely resume a failed grant without duplicating it.
 */
export function checkoutFulfillmentRPCPayload(fulfillment) {
  return {
    p_checkout_session_id: fulfillment.order.stripe_checkout_session_id,
    p_user_id: fulfillment.order.user_id,
    p_product_id: fulfillment.order.product_id,
    p_email: fulfillment.order.email,
    p_amount_cents: fulfillment.order.amount_cents,
    p_currency: fulfillment.order.currency,
    p_payment_intent_id: fulfillment.order.stripe_payment_intent_id,
    p_paid_at: fulfillment.order.paid_at,
    p_credit_total: fulfillment.credit.total,
    p_credit_validity_days: fulfillment.credit.validity_days,
  };
}

export async function persistCheckoutFulfillment(admin, fulfillment) {
  const { data, error } = await admin.rpc(
    'fulfill_stripe_checkout',
    checkoutFulfillmentRPCPayload(fulfillment)
  );
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.fulfilled_order_id || !['paid', 'refunded'].includes(result.final_status)) {
    throw new Error('Stripe fulfillment transaction returned an invalid result.');
  }
  return result;
}

export function checkoutFailureForEvent(event) {
  if (!FAILURE_EVENT_TYPES.has(event?.type)) return null;
  const checkout = event.data?.object;
  if (!checkout?.id || checkout.mode !== 'payment') {
    throw new Error('Failed Checkout Session data is incomplete or invalid.');
  }
  return { stripeCheckoutSessionId: checkout.id };
}

export async function persistCheckoutFailure(admin, failure) {
  const { error } = await admin
    .from('orders')
    .update({ status: 'failed' })
    .eq('stripe_checkout_session_id', failure.stripeCheckoutSessionId)
    .eq('status', 'pending');
  if (error) throw error;
}

export default async function handler(request, response) {
  const text = (body, status = 200) => sendText(response, body, status);
  if (request.method !== 'POST') return text('Method not allowed', 405);

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    return text('Webhook service is unavailable.', 503);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return text('Webhook service is unavailable.', 503);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const signature = requestHeader(request, 'stripe-signature');
  const rawBody = await requestText(request);
  const requestIssue = webhookRequestIssue({
    contentType: requestHeader(request, 'content-type'),
    signature,
    rawBody,
  });
  if (requestIssue) return text(requestIssue.message, requestIssue.status);

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (e) {
    console.warn('Stripe webhook signature rejected.', {
      name: String(e?.name || 'Error'),
      type: String(e?.type || ''),
      code: String(e?.code || ''),
    });
    return text('Invalid webhook signature.', 400);
  }

  try {
    assertStripeEventMode(event, process.env.STRIPE_SECRET_KEY);
    const fulfillment = checkoutFulfillmentForEvent(event);
    if (fulfillment) await persistCheckoutFulfillment(admin, fulfillment);
    const failure = checkoutFailureForEvent(event);
    if (failure) await persistCheckoutFailure(admin, failure);
    const refund = stripeRefundForEvent(event);
    if (refund) await persistStripeRefund(admin, refund);
  } catch (e) {
    console.error('Stripe webhook processing failed.', {
      eventId: String(event?.id || ''),
      eventType: String(event?.type || ''),
      name: String(e?.name || 'Error'),
      code: String(e?.code || ''),
    });
    // A generic 500 makes Stripe retry without exposing provider or SQL details.
    return text('Webhook processing failed.', 500);
  }

  return sendJson(response, { received: true });
}
