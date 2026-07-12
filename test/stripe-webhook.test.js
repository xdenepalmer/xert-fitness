import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkoutFulfillmentForEvent,
  persistCheckoutFulfillment,
} from '../api/stripe-webhook.js';

const NOW = new Date('2026-07-12T00:00:00.000Z');

function checkoutEvent({ type = 'checkout.session.completed', paymentStatus = 'paid', metadata = {} } = {}) {
  return {
    type,
    data: {
      object: {
        id: 'cs_test_xert',
        mode: 'payment',
        payment_status: paymentStatus,
        amount_total: 4800,
        currency: 'aud',
        customer_email: 'member@example.com',
        payment_intent: 'pi_test_xert',
        metadata: {
          user_id: 'C5747DAD-2E89-4D55-AD63-5732D8D67A60',
          product_id: '6C7BC779-4E22-4F38-88AF-C15F2F94EE5A',
          sessions_count: '4',
          validity_days: '28',
          ...metadata,
        },
      },
    },
  };
}

test('creates one durable fulfilment record for a paid checkout', () => {
  const fulfilment = checkoutFulfillmentForEvent(checkoutEvent(), NOW);

  assert.equal(fulfilment.order.status, 'paid');
  assert.equal(fulfilment.order.stripe_checkout_session_id, 'cs_test_xert');
  assert.equal(fulfilment.credit.total, 4);
  assert.equal(fulfilment.credit.remaining, 4);
  assert.equal(fulfilment.credit.expires_at, '2026-08-09T00:00:00.000Z');
});

test('waits for delayed payments to succeed before granting credits', () => {
  assert.equal(
    checkoutFulfillmentForEvent(checkoutEvent({ paymentStatus: 'unpaid' }), NOW),
    null
  );

  const fulfilment = checkoutFulfillmentForEvent(
    checkoutEvent({ type: 'checkout.session.async_payment_succeeded' }),
    NOW
  );
  assert.equal(fulfilment.credit.total, 4);
});

test('ignores non-payment Checkout events and rejects malformed metadata', () => {
  assert.equal(
    checkoutFulfillmentForEvent(checkoutEvent({ type: 'checkout.session.expired' }), NOW),
    null
  );

  assert.throws(
    () => checkoutFulfillmentForEvent(checkoutEvent({ metadata: { sessions_count: '0' } }), NOW),
    /metadata is incomplete or invalid/i
  );
});

test('persists the order first and makes the credit grant idempotent', async () => {
  const calls = [];
  const admin = {
    from(table) {
      return {
        upsert(record, options) {
          calls.push({ table, record, options });
          if (table === 'orders') {
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: 'order-xert' }, error: null };
                  },
                };
              },
            };
          }
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  await persistCheckoutFulfillment(admin, checkoutFulfillmentForEvent(checkoutEvent(), NOW));

  assert.equal(calls[0].table, 'orders');
  assert.equal(calls[0].options.onConflict, 'stripe_checkout_session_id');
  assert.equal(calls[1].table, 'credit_batches');
  assert.equal(calls[1].record.order_id, 'order-xert');
  assert.equal(calls[1].options.onConflict, 'order_id');
  assert.equal(calls[1].options.ignoreDuplicates, true);
});
