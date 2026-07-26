import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertCheckoutMatchesOrder,
  assertFulfillmentMatchesOrder,
  normalizeReconciliationRequest,
  orderBuyerMatchesStripe,
  reconcileCheckoutOrder,
} from '../api/admin-reconcile-order.js';

const ORDER_ID = '6c7bc779-4e22-4f38-88af-c15f2f94ee5a';
const USER_ID = 'c5747dad-2e89-4d55-ad63-5732d8d67a60';
const PRODUCT_ID = '4d8177b3-6ae6-4f77-bb57-59315dc1ad81';
const NOW = new Date('2026-07-13T03:00:00.000Z');
const order = {
  id: ORDER_ID,
  user_id: USER_ID,
  product_id: PRODUCT_ID,
  status: 'pending',
  amount_cents: 4800,
  currency: 'aud',
  credit_total: 4,
  credit_validity_days: 28,
  stripe_checkout_session_id: 'cs_xert',
};
const checkout = {
  id: 'cs_xert',
  mode: 'payment',
  payment_status: 'paid',
  amount_total: 4800,
  currency: 'aud',
  customer_email: 'member@example.com',
  payment_intent: 'pi_xert',
  metadata: {
    xert_checkout_attempt_id: 'e8c03884-4c1b-4a96-97c1-b0a33f2095b3',
    user_id: USER_ID,
    product_id: PRODUCT_ID,
    sessions_count: '4',
    validity_days: '28',
  },
};

test('reconciliation accepts only a UUID order identity', () => {
  assert.deepEqual(normalizeReconciliationRequest({ order_id: ORDER_ID }), { orderId: ORDER_ID });
  assert.throws(() => normalizeReconciliationRequest({ order_id: '../order' }), /INVALID_ORDER_ID/);
});

test('Stripe fulfilment must match the complete pending order identity', () => {
  const fulfillment = {
    order: {
      stripe_checkout_session_id: 'cs_xert', user_id: USER_ID, product_id: PRODUCT_ID,
      amount_cents: 4800, currency: 'aud',
    },
    credit: { total: 4, validity_days: 28 },
  };
  assert.doesNotThrow(() => assertFulfillmentMatchesOrder(order, fulfillment));
  assert.throws(() => assertFulfillmentMatchesOrder(order, null), /PAYMENT_NOT_COMPLETE/);
  assert.throws(() => assertFulfillmentMatchesOrder({ ...order, status: 'refunded' }, fulfillment), /ORDER_ALREADY_REFUNDED/);
  for (const mismatch of [
    { user_id: 'other-member' }, { product_id: 'other-product' },
    { amount_cents: 4700 }, { currency: 'usd' }, { stripe_checkout_session_id: 'cs_other' },
  ]) {
    assert.throws(
      () => assertFulfillmentMatchesOrder(order, { ...fulfillment, order: { ...fulfillment.order, ...mismatch } }),
      /PAYMENT_ORDER_MISMATCH/,
    );
  }
  for (const credit of [{ total: 99, validity_days: 28 }, { total: 4, validity_days: 365 }]) {
    assert.throws(
      () => assertFulfillmentMatchesOrder(order, { ...fulfillment, credit }),
      /PAYMENT_ORDER_MISMATCH/,
    );
  }
});

test('deleted-buyer orders still reconcile when Stripe keeps the original user id', () => {
  // Account deletion nulls orders.user_id; Stripe metadata still names the buyer.
  // Rejecting that pair stranded paid recoveries that webhook fulfilment already settles.
  assert.equal(orderBuyerMatchesStripe(null, USER_ID), true);
  assert.equal(orderBuyerMatchesStripe(USER_ID, USER_ID), true);
  assert.equal(orderBuyerMatchesStripe(USER_ID, 'other-member'), false);
  assert.equal(orderBuyerMatchesStripe(null, null), false);

  const deletedBuyerOrder = { ...order, user_id: null };
  const fulfillment = {
    order: {
      stripe_checkout_session_id: 'cs_xert', user_id: USER_ID, product_id: PRODUCT_ID,
      amount_cents: 4800, currency: 'aud',
    },
    credit: { total: 4, validity_days: 28 },
  };
  assert.doesNotThrow(() => assertFulfillmentMatchesOrder(deletedBuyerOrder, fulfillment));
  assert.doesNotThrow(() => assertCheckoutMatchesOrder(deletedBuyerOrder, checkout));
  assert.throws(
    () => assertFulfillmentMatchesOrder(
      deletedBuyerOrder,
      { ...fulfillment, order: { ...fulfillment.order, user_id: null } },
    ),
    /PAYMENT_ORDER_MISMATCH/,
  );
});

test('expired checkout cleanup requires the complete pending order identity', () => {
  const expired = { ...checkout, status: 'expired', payment_status: 'unpaid' };
  assert.doesNotThrow(() => assertCheckoutMatchesOrder(order, expired));
  for (const mismatch of [
    { id: 'cs_other' },
    { amount_total: 4700 },
    { currency: 'usd' },
    { mode: 'subscription' },
    { metadata: { ...expired.metadata, user_id: 'other-member' } },
    { metadata: { ...expired.metadata, sessions_count: '99' } },
  ]) {
    assert.throws(
      () => assertCheckoutMatchesOrder(order, { ...expired, ...mismatch }),
      /PAYMENT_ORDER_MISMATCH/,
    );
  }
});

test('admin recovery reuses idempotent fulfilment and saves its actor audit', async () => {
  const calls = [];
  const admin = {
    async rpc(name, payload) {
      calls.push({ action: 'rpc', name, payload });
      return { data: [{ fulfilled_order_id: ORDER_ID, final_status: 'paid', credit_created: true }], error: null };
    },
    from(table) {
      return {
        select() {
          return {
            eq() { return { async single() { return { data: order, error: null }; } }; },
          };
        },
        update(payload) {
          calls.push({ action: 'update', table, payload });
          return { async eq(column, value) { calls.push({ action: 'where', column, value }); return { error: null }; } };
        },
      };
    },
  };
  const stripeCalls = [];
  const stripe = { checkout: { sessions: { async retrieve(id, options) { stripeCalls.push({ id, options }); return checkout; } } } };

  const result = await reconcileCheckoutOrder({ admin, stripe, orderId: ORDER_ID, userId: 'admin-xert', now: NOW });

  assert.equal(result.status, 'paid');
  assert.equal(result.credits_granted, 4);
  assert.deepEqual(stripeCalls[0], { id: 'cs_xert', options: { expand: ['payment_intent.latest_charge'] } });
  assert.equal(calls.filter(call => call.action === 'rpc' && call.name === 'fulfill_stripe_checkout').length, 1);
  assert.equal(calls.find(call => call.action === 'update').payload.reconciled_by, 'admin-xert');
  assert.equal(calls.find(call => call.action === 'update').payload.reconciled_at, NOW.toISOString());
});

test('admin recovery cannot report paid when a concurrent refund wins the order lock', async () => {
  const admin = {
    async rpc() {
      return { data: [{ fulfilled_order_id: ORDER_ID, final_status: 'refunded', credit_created: false }], error: null };
    },
    from() {
      return {
        select() {
          return { eq() { return { async single() { return { data: order, error: null }; } }; } };
        },
      };
    },
  };
  const stripe = { checkout: { sessions: { async retrieve() { return checkout; } } } };
  await assert.rejects(
    reconcileCheckoutOrder({ admin, stripe, orderId: ORDER_ID, userId: 'admin-xert', now: NOW }),
    /ORDER_ALREADY_REFUNDED/
  );
});

test('admin recovery closes an exact expired unpaid checkout without granting credits', async () => {
  const calls = [];
  const updateQuery = {
    eq(column, value) { calls.push(['eq', column, value]); return updateQuery; },
    in(column, values) { calls.push(['in', column, values]); return updateQuery; },
    select(columns) { calls.push(['returning', columns]); return updateQuery; },
    async maybeSingle() { return { data: { id: ORDER_ID, status: 'failed' }, error: null }; },
  };
  const admin = {
    async rpc() { throw new Error('Expired checkout must not grant credits.'); },
    from(table) {
      return {
        select() {
          return { eq() { return { async single() { return { data: order, error: null }; } }; } };
        },
        update(payload) { calls.push(['update', table, payload]); return updateQuery; },
      };
    },
  };
  const expired = { ...checkout, status: 'expired', payment_status: 'unpaid' };
  const stripe = { checkout: { sessions: { async retrieve() { return expired; } } } };

  const result = await reconcileCheckoutOrder({
    admin, stripe, orderId: ORDER_ID, userId: 'admin-xert', now: NOW,
  });

  assert.deepEqual(result, {
    order_id: ORDER_ID,
    status: 'failed',
    checkout_status: 'expired',
    credits_granted: 0,
    already_paid: false,
  });
  assert.deepEqual(calls, [
    ['update', 'orders', {
      status: 'failed', reconciled_at: NOW.toISOString(), reconciled_by: 'admin-xert',
    }],
    ['eq', 'id', ORDER_ID],
    ['in', 'status', ['pending', 'failed']],
    ['returning', 'id,status'],
  ]);
});

test('expired checkout cleanup refuses a concurrent paid or refunded transition', async () => {
  const updateQuery = {
    eq() { return updateQuery; }, in() { return updateQuery; }, select() { return updateQuery; },
    async maybeSingle() { return { data: null, error: null }; },
  };
  const admin = {
    from() {
      return {
        select() { return { eq() { return { async single() { return { data: order, error: null }; } }; } }; },
        update() { return updateQuery; },
      };
    },
  };
  const stripe = { checkout: { sessions: { async retrieve() {
    return { ...checkout, status: 'expired', payment_status: 'unpaid' };
  } } } };
  await assert.rejects(
    reconcileCheckoutOrder({ admin, stripe, orderId: ORDER_ID, userId: 'admin-xert', now: NOW }),
    /ORDER_STATE_CHANGED/,
  );
});

test('fresh and upgrade schemas retain a durable manual reconciliation marker', () => {
  for (const path of [
    '../supabase/migrations/20260713030000_checkout_reconciliation.sql',
    '../src/supabase/booking_schema.sql',
  ]) {
    const sql = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(sql, /reconciled_at\s+timestamptz/i);
    assert.match(sql, /reconciled_by\s+uuid references auth\.users/i);
    assert.match(sql, /orders_unresolved_checkout_idx/i);
    assert.match(sql, /values \('checkout_reconciliation'\)/i);
  }
});

test('orders admin exposes authenticated payment recovery for unresolved checkouts', () => {
  const data = readFileSync(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/components/admin/OrdersManager.jsx', import.meta.url), 'utf8');
  assert.match(data, /fetch\('\/api\/admin-reconcile-order'/);
  assert.match(ui, /\['pending', 'failed'\]\.includes\(selectedOrder\.status\)/);
  assert.match(ui, /Check Stripe Outcome/);
  assert.match(ui, /safely closes an expired unpaid checkout/);
});
