import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertStripeEventMode,
  checkoutFailureForEvent,
  checkoutFulfillmentForEvent,
  persistCheckoutFailure,
  persistCheckoutFulfillment,
  persistStripeRefund,
  stripeRefundForEvent,
  stripeModeForSecret,
  validStripeSignatureHeader,
  webhookRequestIssue,
} from '../api/stripe-webhook.js';

const NOW = new Date('2026-07-12T00:00:00.000Z');

function checkoutEvent({ type = 'checkout.session.completed', paymentStatus = 'paid', metadata = {} } = {}) {
  return {
    livemode: false,
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

test('fails closed when Stripe event and secret-key modes do not match', () => {
  assert.equal(stripeModeForSecret('sk_test_xert'), 'test');
  assert.equal(stripeModeForSecret('sk_live_xert'), 'live');
  assert.equal(assertStripeEventMode(checkoutEvent(), 'sk_test_xert'), 'test');
  assert.throws(
    () => assertStripeEventMode({ ...checkoutEvent(), livemode: true }, 'sk_test_xert'),
    /does not match/i
  );
  assert.throws(() => assertStripeEventMode(checkoutEvent(), 'invalid'), /could not be verified/i);
  assert.throws(
    () => assertStripeEventMode({ ...checkoutEvent(), livemode: undefined }, 'sk_test_xert'),
    /mode is missing/i
  );
});

test('webhook validates a bounded signed JSON envelope before Stripe parsing', () => {
  const signature = `t=1783814400,v1=${'a'.repeat(64)}`;
  assert.equal(validStripeSignatureHeader(signature), true);
  assert.equal(validStripeSignatureHeader(`v1=${'a'.repeat(64)}`), false);
  assert.equal(validStripeSignatureHeader('t=1783814400,v1=short'), false);
  assert.equal(validStripeSignatureHeader('x'.repeat(4097)), false);
  assert.equal(webhookRequestIssue({ contentType: 'application/json', signature, rawBody: '{}' }), null);
  assert.deepEqual(webhookRequestIssue({ contentType: 'text/plain', signature, rawBody: '{}' }), {
    status: 415,
    message: 'Webhook content type must be application/json.',
  });
  assert.deepEqual(webhookRequestIssue({ contentType: 'application/json', signature: '', rawBody: '{}' }), {
    status: 400,
    message: 'Invalid webhook signature.',
  });
  assert.deepEqual(webhookRequestIssue({ contentType: 'application/json', signature, rawBody: '' }), {
    status: 400,
    message: 'Webhook body is required.',
  });
  assert.deepEqual(webhookRequestIssue({
    contentType: 'application/json; charset=utf-8',
    signature,
    rawBody: 'x'.repeat(1024 * 1024 + 1),
  }), {
    status: 413,
    message: 'Webhook body is too large.',
  });
});

test('webhook public failures never echo Stripe or database exception messages', async () => {
  const source = await readFile(new URL('../api/stripe-webhook.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /signature verification failed: \$\{e\.message\}/);
  assert.doesNotMatch(source, /Handler error: \$\{e\.message\}/);
  assert.match(source, /return text\('Invalid webhook signature\.', 400\)/);
  assert.match(source, /return text\('Webhook processing failed\.', 500\)/);
  assert.match(source, /Webhook service is unavailable\.[\s\S]*503/);
});

test('creates one durable fulfilment record for a paid checkout', () => {
  const fulfilment = checkoutFulfillmentForEvent(checkoutEvent(), NOW);

  assert.equal(fulfilment.order.status, 'paid');
  assert.equal(fulfilment.order.stripe_checkout_session_id, 'cs_test_xert');
  assert.equal(fulfilment.credit.total, 4);
  assert.equal(fulfilment.credit.remaining, 4);
  assert.equal(fulfilment.credit.expires_at, '2026-08-09T00:00:00.000Z');
});

test('manual recovery preserves Stripe charge time for revenue and expiry', () => {
  const event = checkoutEvent();
  event.data.object.payment_intent = {
    id: 'pi_test_xert',
    latest_charge: { id: 'ch_test_xert', created: 1783814400 },
  };
  const fulfilment = checkoutFulfillmentForEvent(event, new Date('2026-07-20T00:00:00Z'));
  assert.equal(fulfilment.order.paid_at, '2026-07-12T00:00:00.000Z');
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
  assert.throws(
    () => checkoutFulfillmentForEvent({
      ...checkoutEvent(),
      data: { object: { ...checkoutEvent().data.object, currency: 'usd' } },
    }, NOW),
    /metadata is incomplete or invalid/i
  );
});

test('settles the order and credit grant through one database transaction', async () => {
  const calls = [];
  const admin = {
    async rpc(name, payload) {
      calls.push({ name, payload });
      return { data: [{ fulfilled_order_id: 'order-xert', final_status: 'paid', credit_created: true }], error: null };
    },
  };

  const result = await persistCheckoutFulfillment(admin, checkoutFulfillmentForEvent(checkoutEvent(), NOW));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'fulfill_stripe_checkout');
  assert.equal(calls[0].payload.p_checkout_session_id, 'cs_test_xert');
  assert.equal(calls[0].payload.p_payment_intent_id, 'pi_test_xert');
  assert.equal(calls[0].payload.p_credit_total, 4);
  assert.equal(calls[0].payload.p_amount_cents, 4800);
  assert.equal(result.final_status, 'paid');
});

test('expired and delayed-failed checkouts close only their pending order', async () => {
  for (const type of ['checkout.session.expired', 'checkout.session.async_payment_failed']) {
    assert.deepEqual(checkoutFailureForEvent(checkoutEvent({ type })), {
      stripeCheckoutSessionId: 'cs_test_xert',
    });
  }
  assert.equal(checkoutFailureForEvent(checkoutEvent()), null);

  const calls = [];
  const query = {
    update(payload) { calls.push({ action: 'update', payload }); return query; },
    eq(column, value) { calls.push({ action: 'eq', column, value }); return query; },
    then(resolve) { resolve({ error: null }); },
  };
  await persistCheckoutFailure({ from(table) { calls.push({ action: 'from', table }); return query; } }, {
    stripeCheckoutSessionId: 'cs_test_xert',
  });
  assert.deepEqual(calls, [
    { action: 'from', table: 'orders' },
    { action: 'update', payload: { status: 'failed' } },
    { action: 'eq', column: 'stripe_checkout_session_id', value: 'cs_test_xert' },
    { action: 'eq', column: 'status', value: 'pending' },
  ]);
});

test('accepts only a complete full charge refund for reconciliation', () => {
  const event = {
    id: 'evt_refund_xert',
    type: 'charge.refunded',
    created: 1783814400,
    data: { object: {
      id: 'ch_xert', payment_intent: 'pi_test_xert', amount: 4800,
      amount_refunded: 4800, currency: 'aud', refunded: true,
      refunds: { data: [{ id: 're_xert', status: 'succeeded', created: 1783814400 }] },
    } },
  };
  const refund = stripeRefundForEvent(event, NOW);
  assert.equal(refund.p_refund_id, 're_xert');
  assert.equal(refund.p_amount_cents, 4800);
  assert.equal(refund.p_payment_intent_id, 'pi_test_xert');
  assert.equal(stripeRefundForEvent({ ...event, type: 'charge.updated' }, NOW), null);
  assert.equal(stripeRefundForEvent({
    ...event,
    data: { object: { ...event.data.object, amount_refunded: 2400, refunded: false } },
  }, NOW), null);
});

test('persists refund recovery through the service-role reconciliation RPC', async () => {
  const calls = [];
  const admin = { async rpc(name, payload) { calls.push({ name, payload }); return { error: null }; } };
  const payload = { p_refund_id: 're_xert' };
  await persistStripeRefund(admin, payload);
  assert.deepEqual(calls, [{ name: 'reconcile_stripe_order_refund', payload }]);
});
