import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { requestHeader, requestJson, sendJson } from './http.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REFUND_REASONS = new Set(['requested_by_customer', 'duplicate']);

export function normalizeRefundRequest(body) {
  const orderId = String(body?.order_id || '').trim();
  const reason = String(body?.reason || 'requested_by_customer').trim();
  if (body?.confirmation !== 'REFUND') throw new Error('REFUND_NOT_CONFIRMED');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new Error('INVALID_ORDER_ID');
  }
  if (!REFUND_REASONS.has(reason)) throw new Error('INVALID_REFUND_REASON');
  return { orderId, reason };
}

export function assertRefundableOrder(order, paymentIntent, charge) {
  if (!order || order.status !== 'paid' || !order.stripe_payment_intent_id) {
    throw new Error('ORDER_NOT_REFUNDABLE');
  }
  if (
    !paymentIntent
    || paymentIntent.id !== order.stripe_payment_intent_id
    || paymentIntent.status !== 'succeeded'
    || paymentIntent.amount_received !== order.amount_cents
    || String(paymentIntent.currency || '').toLowerCase() !== String(order.currency || '').toLowerCase()
  ) {
    throw new Error('PAYMENT_ORDER_MISMATCH');
  }
  const latestChargeId = typeof paymentIntent.latest_charge === 'string'
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id;
  if (
    !charge || !latestChargeId || charge.id !== latestChargeId
    || (typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id) !== paymentIntent.id
    || charge.amount !== order.amount_cents
    || charge.amount_refunded !== 0
    || charge.refunded === true
    || String(charge.currency || '').toLowerCase() !== String(order.currency || '').toLowerCase()
  ) {
    throw new Error('CHARGE_NOT_FULLY_REFUNDABLE');
  }
}

export async function performAdminRefund({ admin, stripe, orderId, reason, userId, now = new Date() }) {
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id,status,amount_cents,currency,stripe_payment_intent_id')
    .eq('id', orderId)
    .single();
  if (orderError || !order) throw new Error('ORDER_NOT_FOUND');
  if (order.status !== 'paid' || !order.stripe_payment_intent_id) throw new Error('ORDER_NOT_REFUNDABLE');

  const paymentIntent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
  const chargeId = typeof paymentIntent.latest_charge === 'string'
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id;
  if (!chargeId) throw new Error('CHARGE_NOT_FULLY_REFUNDABLE');
  const charge = await stripe.charges.retrieve(chargeId);
  assertRefundableOrder(order, paymentIntent, charge);

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntent.id,
    reason,
    metadata: { xert_order_id: order.id, initiated_by: userId },
  }, { idempotencyKey: `xert-order-refund-${order.id}` });
  if (refund.status !== 'succeeded') throw new Error('REFUND_PENDING');

  const refundedAt = new Date((refund.created || Math.floor(now.getTime() / 1000)) * 1000).toISOString();
  const { data, error } = await admin.rpc('reconcile_stripe_order_refund', {
    p_refund_id: refund.id,
    p_event_id: `admin:${userId}:${refund.id}`,
    p_payment_intent_id: paymentIntent.id,
    p_charge_id: typeof refund.charge === 'string' ? refund.charge : refund.charge?.id || null,
    p_amount_cents: refund.amount,
    p_currency: paymentIntent.currency,
    p_refunded_at: refundedAt,
  });
  if (error) throw error;
  return { refund_id: refund.id, refunded_at: refundedAt, ...(data?.[0] || {}) };
}

export default async function handler(request, response) {
  const json = (body, status = 200) => sendJson(response, body, status);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = requestHeader(request, 'authorization');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return json({ error: 'Not authenticated.' }, 401);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Supabase is not configured.' }, 500);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: 'Invalid or expired session.' }, 401);
    const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profileError) return json({ error: 'Could not verify admin access.' }, 500);
    if (profile?.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
    if (!process.env.STRIPE_SECRET_KEY) return json({ error: 'Stripe is not configured.' }, 500);
    const { orderId, reason } = normalizeRefundRequest(await requestJson(request));

    const result = await performAdminRefund({
      admin,
      stripe: new Stripe(process.env.STRIPE_SECRET_KEY),
      orderId,
      reason,
      userId: user.id,
    });
    return json({ refunded: true, ...result });
  } catch (error) {
    const message = error.message || '';
    if (message === 'REFUND_NOT_CONFIRMED') return json({ error: 'Type REFUND to confirm.' }, 400);
    if (['INVALID_ORDER_ID', 'INVALID_REFUND_REASON'].includes(message)) return json({ error: 'Refund request is invalid.' }, 400);
    if (['ORDER_NOT_FOUND', 'ORDER_NOT_REFUNDABLE', 'PAYMENT_ORDER_MISMATCH', 'CHARGE_NOT_FULLY_REFUNDABLE'].includes(message)) {
      return json({ error: 'This order cannot be safely refunded.' }, 409);
    }
    if (message === 'REFUND_PENDING') return json({ error: 'Stripe is still processing this refund. Refresh shortly.' }, 409);
    return json({ error: 'Refund state could not be confirmed. Refresh Orders and Stripe before retrying.' }, 500);
  }
}
