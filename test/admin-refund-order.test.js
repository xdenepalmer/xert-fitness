import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertCreatedRefundMatchesOrder,
  assertRefundableOrder,
  normalizeRefundRequest,
  performAdminRefund,
} from '../api/admin-refund-order.js';

const ORDER_ID = '6c7bc779-4e22-4f38-88af-c15f2f94ee5a';
const order = {
  id: ORDER_ID,
  status: 'paid',
  amount_cents: 4800,
  currency: 'aud',
  stripe_payment_intent_id: 'pi_xert',
};
const paymentIntent = { id: 'pi_xert', status: 'succeeded', amount_received: 4800, currency: 'aud', latest_charge: 'ch_xert' };
const charge = { id: 'ch_xert', payment_intent: 'pi_xert', amount: 4800, amount_refunded: 0, refunded: false, currency: 'aud' };

test('refund requests require an explicit confirmation, known reason, and UUID', () => {
  assert.deepEqual(normalizeRefundRequest({ order_id: ORDER_ID, reason: 'duplicate', confirmation: 'REFUND' }), {
    orderId: ORDER_ID,
    reason: 'duplicate',
  });
  assert.throws(() => normalizeRefundRequest({ order_id: ORDER_ID }), /REFUND_NOT_CONFIRMED/);
  assert.throws(() => normalizeRefundRequest({ order_id: '../order', confirmation: 'REFUND' }), /INVALID_ORDER_ID/);
  assert.throws(() => normalizeRefundRequest({ order_id: ORDER_ID, reason: 'fraudulent', confirmation: 'REFUND' }), /INVALID_REFUND_REASON/);
});

test('Stripe payment identity, amount, currency, and paid state must match the order', () => {
  assert.doesNotThrow(() => assertRefundableOrder(order, paymentIntent, charge));
  assert.throws(() => assertRefundableOrder({ ...order, status: 'refunded' }, paymentIntent, charge), /ORDER_NOT_REFUNDABLE/);
  assert.throws(() => assertRefundableOrder(order, { ...paymentIntent, amount_received: 4700 }, charge), /PAYMENT_ORDER_MISMATCH/);
  assert.throws(() => assertRefundableOrder(order, { ...paymentIntent, currency: 'usd' }, charge), /PAYMENT_ORDER_MISMATCH/);
  assert.throws(() => assertRefundableOrder(order, paymentIntent, { ...charge, amount_refunded: 1000 }), /CHARGE_NOT_FULLY_REFUNDABLE/);
});

test('created refund must preserve the complete order payment identity', () => {
  const refund = {
    id: 're_xert', status: 'succeeded', amount: 4800, currency: 'aud',
    payment_intent: 'pi_xert', charge: 'ch_xert',
  };
  assert.doesNotThrow(() => assertCreatedRefundMatchesOrder(refund, order, paymentIntent, charge));
  assert.throws(() => assertCreatedRefundMatchesOrder({ ...refund, status: 'pending' }, order, paymentIntent, charge), /REFUND_PENDING/);
  for (const mismatch of [
    { amount: 4700 },
    { currency: 'usd' },
    { payment_intent: 'pi_other' },
    { charge: 'ch_other' },
    { id: '' },
  ]) {
    assert.throws(
      () => assertCreatedRefundMatchesOrder({ ...refund, ...mismatch }, order, paymentIntent, charge),
      /REFUND_RESULT_MISMATCH/,
    );
  }
});

test('admin refund uses a stable Stripe idempotency key then reconciles through one RPC', async () => {
  const calls = { refunds: [], rpc: [] };
  const admin = {
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        async single() { return { data: order, error: null }; },
      };
      return query;
    },
    async rpc(name, payload) {
      calls.rpc.push({ name, payload });
      return { data: [{ order_id: ORDER_ID, credits_revoked: 3, credits_consumed: 1, bookings_cancelled: 1 }], error: null };
    },
  };
  const stripe = {
    paymentIntents: { async retrieve() { return paymentIntent; } },
    charges: { async retrieve() { return charge; } },
    refunds: {
      async create(payload, options) {
        calls.refunds.push({ payload, options });
        return {
          id: 're_xert', status: 'succeeded', amount: 4800, currency: 'aud',
          payment_intent: 'pi_xert', created: 1783814400, charge: 'ch_xert',
        };
      },
    },
  };

  const result = await performAdminRefund({ admin, stripe, orderId: ORDER_ID, reason: 'requested_by_customer', userId: 'admin-id' });
  assert.equal(calls.refunds[0].options.idempotencyKey, `xert-order-refund-${ORDER_ID}`);
  assert.equal(calls.refunds[0].payload.payment_intent, 'pi_xert');
  assert.equal(calls.rpc[0].name, 'reconcile_stripe_order_refund');
  assert.equal(calls.rpc[0].payload.p_amount_cents, 4800);
  assert.equal(result.credits_revoked, 3);
});

test('refund database contract is service-only, atomic, idempotent, and auditable', () => {
  for (const path of [
    '../supabase/migrations/20260713020000_stripe_refund_reconciliation.sql',
    '../src/supabase/booking_schema.sql',
  ]) {
    const sql = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, /create or replace function public\.reconcile_stripe_order_refund/i);
    assert.match(sql, /auth\.role\(\) is distinct from 'service_role'/i);
    assert.match(sql, /credit_batches[\s\S]*for update/i);
    assert.match(sql, /set status = 'refunded'/i);
    assert.match(sql, /set remaining = 0/i);
    assert.match(sql, /session_bookings[\s\S]*set status = 'cancelled'/i);
    assert.match(sql, /stripe_refunds[\s\S]*order_id uuid not null unique/i);
    assert.match(sql, /grant execute on function public\.reconcile_stripe_order_refund[\s\S]*to service_role/i);
  }
});
