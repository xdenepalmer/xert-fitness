import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertFulfillmentMatchesOrder,
  normalizeReconciliationRequest,
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
  };
  assert.doesNotThrow(() => assertFulfillmentMatchesOrder(order, fulfillment));
  assert.throws(() => assertFulfillmentMatchesOrder(order, null), /PAYMENT_NOT_COMPLETE/);
  assert.throws(() => assertFulfillmentMatchesOrder({ ...order, status: 'refunded' }, fulfillment), /ORDER_ALREADY_REFUNDED/);
  for (const mismatch of [
    { user_id: 'other-member' }, { product_id: 'other-product' },
    { amount_cents: 4700 }, { currency: 'usd' }, { stripe_checkout_session_id: 'cs_other' },
  ]) {
    assert.throws(
      () => assertFulfillmentMatchesOrder(order, { order: { ...fulfillment.order, ...mismatch } }),
      /PAYMENT_ORDER_MISMATCH/,
    );
  }
});

test('admin recovery reuses idempotent fulfilment and saves its actor audit', async () => {
  const calls = [];
  const admin = {
    from(table) {
      return {
        select() {
          return {
            eq() { return { async single() { return { data: order, error: null }; } }; },
          };
        },
        upsert(record, options) {
          calls.push({ action: 'upsert', table, record, options });
          if (table === 'orders') {
            return { select() { return { async single() { return { data: { id: ORDER_ID }, error: null }; } }; } };
          }
          return Promise.resolve({ error: null });
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
  assert.equal(calls.filter(call => call.action === 'upsert' && call.table === 'credit_batches').length, 1);
  assert.equal(calls.find(call => call.action === 'update').payload.reconciled_by, 'admin-xert');
  assert.equal(calls.find(call => call.action === 'update').payload.reconciled_at, NOW.toISOString());
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
  assert.match(ui, /Check and Reconcile Payment/);
});
