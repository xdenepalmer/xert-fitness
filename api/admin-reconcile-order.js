import { createClient } from '@supabase/supabase-js';
import {
  checkoutFulfillmentForSession,
  persistCheckoutFulfillment,
} from './stripe-webhook.js';
import { createRequestTrace, requestHeader, requestJson } from './http.js';
import { inspectCommerceRuntimeEnvironment } from '../src/lib/commerceRuntime.js';
import { createXertStripeClient } from '../src/lib/serverStripeClient.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeReconciliationRequest(body) {
  const orderId = String(body?.order_id || '').trim();
  if (!UUID_PATTERN.test(orderId)) throw new Error('INVALID_ORDER_ID');
  return { orderId };
}

export function assertFulfillmentMatchesOrder(order, fulfillment) {
  const paidOrder = fulfillment?.order;
  const credit = fulfillment?.credit;
  if (!order || !paidOrder || !credit) throw new Error('PAYMENT_NOT_COMPLETE');
  if (order.status === 'refunded') throw new Error('ORDER_ALREADY_REFUNDED');
  if (
    paidOrder.stripe_checkout_session_id !== order.stripe_checkout_session_id
    || paidOrder.user_id !== order.user_id
    || paidOrder.product_id !== order.product_id
    || Number(paidOrder.amount_cents) !== Number(order.amount_cents)
    || String(paidOrder.currency || '').toLowerCase() !== String(order.currency || '').toLowerCase()
    || credit.total !== order.credit_total
    || credit.validity_days !== order.credit_validity_days
  ) {
    throw new Error('PAYMENT_ORDER_MISMATCH');
  }
}

export function assertCheckoutMatchesOrder(order, checkout) {
  const metadata = checkout?.metadata || {};
  if (!order || order.status === 'refunded') throw new Error('ORDER_ALREADY_REFUNDED');
  if (
    !checkout
    || checkout.id !== order.stripe_checkout_session_id
    || checkout.mode !== 'payment'
    || metadata.user_id !== order.user_id
    || metadata.product_id !== order.product_id
    || Number(checkout.amount_total) !== Number(order.amount_cents)
    || String(checkout.currency || '').toLowerCase() !== String(order.currency || '').toLowerCase()
    || metadata.sessions_count !== String(order.credit_total)
    || metadata.validity_days !== String(order.credit_validity_days)
  ) {
    throw new Error('PAYMENT_ORDER_MISMATCH');
  }
}

export async function reconcileExpiredCheckout(admin, order, checkout, userId, now = new Date()) {
  assertCheckoutMatchesOrder(order, checkout);
  if (checkout.status !== 'expired' || checkout.payment_status !== 'unpaid') {
    throw new Error('PAYMENT_NOT_COMPLETE');
  }
  if (!['pending', 'failed'].includes(order.status)) throw new Error('ORDER_STATE_CHANGED');

  const { data, error } = await admin
    .from('orders')
    .update({
      status: 'failed',
      reconciled_at: now.toISOString(),
      reconciled_by: userId,
    })
    .eq('id', order.id)
    .in('status', ['pending', 'failed'])
    .select('id,status')
    .maybeSingle();
  if (error) throw new Error('CHECKOUT_EXPIRY_RECONCILIATION_FAILED');
  if (data?.id !== order.id || data?.status !== 'failed') throw new Error('ORDER_STATE_CHANGED');
  return {
    order_id: order.id,
    status: 'failed',
    checkout_status: 'expired',
    credits_granted: 0,
    already_paid: false,
  };
}

export async function reconcileCheckoutOrder({ admin, stripe, orderId, userId, now = new Date() }) {
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id,user_id,product_id,status,amount_cents,currency,credit_total,credit_validity_days,stripe_checkout_session_id')
    .eq('id', orderId)
    .single();
  if (orderError || !order) throw new Error('ORDER_NOT_FOUND');
  if (!order.stripe_checkout_session_id) throw new Error('CHECKOUT_SESSION_NOT_RECORDED');

  const checkout = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id, {
    expand: ['payment_intent.latest_charge'],
  });
  assertCheckoutMatchesOrder(order, checkout);
  const fulfillment = checkoutFulfillmentForSession(checkout, now);
  if (!fulfillment) {
    return reconcileExpiredCheckout(admin, order, checkout, userId, now);
  }
  assertFulfillmentMatchesOrder(order, fulfillment);
  const settlement = await persistCheckoutFulfillment(admin, fulfillment);
  if (settlement.final_status === 'refunded') throw new Error('ORDER_ALREADY_REFUNDED');

  const { error: auditError } = await admin
    .from('orders')
    .update({ reconciled_at: now.toISOString(), reconciled_by: userId })
    .eq('id', order.id);
  if (auditError) throw new Error('RECONCILIATION_AUDIT_FAILED');

  return {
    order_id: order.id,
    status: 'paid',
    credits_granted: fulfillment.credit.total,
    already_paid: order.status === 'paid',
    checkout_status: checkout.status,
  };
}

const SAFE_ERRORS = {
  INVALID_ORDER_ID: ['Order ID is invalid.', 400],
  ORDER_NOT_FOUND: ['Order was not found.', 404],
  ORDER_ALREADY_REFUNDED: ['Refunded orders cannot be reconciled.', 409],
  CHECKOUT_SESSION_NOT_RECORDED: ['This order has no Stripe Checkout Session.', 409],
  PAYMENT_NOT_COMPLETE: ['Stripe does not report this checkout as paid yet.', 409],
  PAYMENT_ORDER_MISMATCH: ['Stripe payment details do not match this order.', 409],
  ORDER_STATE_CHANGED: ['This order changed while Stripe was being checked. Refresh before retrying.', 409],
  CHECKOUT_EXPIRY_RECONCILIATION_FAILED: ['Stripe reports this checkout expired, but XERT could not close the pending order. Refresh before retrying.', 500],
  RECONCILIATION_AUDIT_FAILED: ['Payment was fulfilled but its admin audit marker could not be saved. Refresh before retrying.', 500],
};

export default async function handler(request, response) {
  const trace = createRequestTrace(response);
  const { json } = trace;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!inspectCommerceRuntimeEnvironment(process.env).ready) {
    return json({ error: 'Payment operations are unavailable.' }, 503);
  }

  const authHeader = requestHeader(request, 'authorization');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return json({ error: 'Not authenticated.' }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return json({ error: 'Invalid or expired session.' }, 401);
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return json({ error: 'Could not verify admin access.' }, 500);
  if (profile?.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  try {
    const { orderId } = normalizeReconciliationRequest(await requestJson(request));
    const result = await reconcileCheckoutOrder({
      admin,
      stripe: createXertStripeClient(process.env.STRIPE_SECRET_KEY),
      orderId,
      userId: user.id,
    });
    return json(result);
  } catch (error) {
    const [message, status] = SAFE_ERRORS[error.message] || ['Order reconciliation failed.', 500];
    if (status >= 500) {
      console.error('Admin order reconciliation failed.', {
        requestId: trace.requestId,
        code: String(error?.code || error?.message || 'UNEXPECTED_RECONCILIATION_ERROR'),
        stripeRequestId: String(error?.requestId || ''),
      });
    }
    return json({ error: message }, status);
  }
}
