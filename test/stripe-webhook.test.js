import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertStripeEventMode,
  beginStripeWebhookEvent,
  checkoutFailureForEvent,
  checkoutFulfillmentForEvent,
  findStripeOrderForReview,
  hasXertCheckoutIdentity,
  persistCheckoutFailure,
  persistCheckoutFulfillment,
  persistStripeRefund,
  processStripeEvent,
  recordStripeOperatorReview,
  finishStripeWebhookEvent,
  stripeRefundForEvent,
  stripeDisputeReviewForEvent,
  stripeOperatorReviewForEvent,
  stripeModeForSecret,
  stripeWebhookErrorCode,
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
          xert_checkout_attempt_id: 'E8C03884-4C1B-4A96-97C1-B0A33F2095B3',
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

test('classifies Stripe metadata as unrelated, valid XERT, or malformed XERT', () => {
  assert.equal(hasXertCheckoutIdentity(undefined), false);
  assert.equal(hasXertCheckoutIdentity({}), false);
  assert.equal(hasXertCheckoutIdentity({
    xert_checkout_attempt_id: 'E8C03884-4C1B-4A96-97C1-B0A33F2095B3',
  }), true);
  assert.throws(
    () => hasXertCheckoutIdentity({ xert_checkout_attempt_id: 'not-a-uuid' }),
    /identity is invalid/i,
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
  assert.match(source, /beginStripeWebhookEvent\(admin, event, receivedAt\)[\s\S]*persistCheckoutFulfillment/);
  assert.match(source, /finishStripeWebhookEvent\(admin,[\s\S]*status: handled \? 'processed' : 'ignored'/);
  assert.match(source, /ledgerStarted[\s\S]*status: 'failed'[\s\S]*stripeWebhookErrorCode\(error\)/);
  assert.match(source, /stripeOperatorReviewForEvent\(event\)[\s\S]*PARTIAL_REFUND_REQUIRES_REVIEW|operatorReview\.errorCode/);
  assert.match(source, /status: 'failed'[\s\S]*requires_review: true/);
  assert.match(source, /stripeDisputeReviewForEvent\(event\)/);
});

test('shared Stripe processor settles retries through the same durable ledger path', async () => {
  const calls = [];
  const admin = {
    async rpc(name, payload) {
      calls.push([name, payload]);
      if (name === 'begin_stripe_webhook_event') {
        return { data: [{ already_finished: false, attempt_count: 2 }], error: null };
      }
      if (name === 'fulfill_stripe_checkout') {
        return { data: [{ fulfilled_order_id: 'order-xert', final_status: 'paid' }], error: null };
      }
      return { data: null, error: null };
    },
  };
  const event = { ...checkoutEvent(), id: 'evt_retry_xert' };

  const result = await processStripeEvent(admin, event, {
    secretKey: 'sk_test_xert', receivedAt: NOW,
  });

  assert.deepEqual(result, {
    duplicate: false, requiresReview: false, handled: true, orderId: 'order-xert',
  });
  assert.deepEqual(calls.map(([name]) => name), [
    'begin_stripe_webhook_event', 'fulfill_stripe_checkout', 'finish_stripe_webhook_event',
  ]);
  assert.equal(calls[2][1].p_status, 'processed');
});

test('shared Stripe processor records a bounded failure and remains retryable', async () => {
  const calls = [];
  const admin = {
    async rpc(name, payload) {
      calls.push([name, payload]);
      if (name === 'begin_stripe_webhook_event') {
        return { data: [{ already_finished: false, attempt_count: 1 }], error: null };
      }
      if (name === 'fulfill_stripe_checkout') {
        return { data: null, error: { code: 'DATABASE_TIMEOUT', message: 'private details' } };
      }
      return { data: null, error: null };
    },
  };
  const event = { ...checkoutEvent(), id: 'evt_retry_failure' };

  await assert.rejects(
    processStripeEvent(admin, event, { secretKey: 'sk_test_xert', receivedAt: NOW }),
  );
  assert.equal(calls.at(-1)[0], 'finish_stripe_webhook_event');
  assert.equal(calls.at(-1)[1].p_status, 'failed');
  assert.equal(calls.at(-1)[1].p_error_code, 'DATABASE_TIMEOUT');
  assert.equal(JSON.stringify(calls).includes('private details'), false);
});

test('creates one durable fulfilment record for a paid checkout', () => {
  const fulfilment = checkoutFulfillmentForEvent(checkoutEvent(), NOW);

  assert.equal(fulfilment.order.status, 'paid');
  assert.equal(fulfilment.order.stripe_checkout_session_id, 'cs_test_xert');
  assert.equal(fulfilment.credit.total, 4);
  assert.equal(fulfilment.credit.validity_days, 28);
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

test('event replay preserves Stripe event time when charge expansion is unavailable', () => {
  const event = { ...checkoutEvent(), created: 1783814400 };
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
  assert.equal(
    checkoutFulfillmentForEvent(checkoutEvent({ metadata: { xert_checkout_attempt_id: '' } }), NOW),
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
  assert.equal(calls[0].payload.p_credit_validity_days, 28);
  assert.equal('p_expires_at' in calls[0].payload, false);
  assert.equal(calls[0].payload.p_amount_cents, 4800);
  assert.equal(result.final_status, 'paid');
});

test('records verified webhook attempts and terminal outcomes without leaking errors', async () => {
  const calls = [];
  const admin = {
    async rpc(name, payload) {
      calls.push({ name, payload });
      if (name === 'begin_stripe_webhook_event') {
        return { data: [{ already_finished: false, attempt_count: 2 }], error: null };
      }
      return { data: null, error: null };
    },
  };
  const event = { id: 'evt_xert_123', type: 'checkout.session.completed', livemode: false };
  assert.deepEqual(await beginStripeWebhookEvent(admin, event, NOW), {
    already_finished: false,
    attempt_count: 2,
  });
  await finishStripeWebhookEvent(admin, {
    eventId: event.id, status: 'processed', orderId: 'order-xert', finishedAt: NOW,
  });
  assert.deepEqual(calls[0], {
    name: 'begin_stripe_webhook_event',
    payload: {
      p_event_id: event.id,
      p_event_type: event.type,
      p_livemode: false,
      p_received_at: NOW.toISOString(),
    },
  });
  assert.equal(calls[1].name, 'finish_stripe_webhook_event');
  assert.equal(calls[1].payload.p_status, 'processed');
  assert.equal(stripeWebhookErrorCode({ code: 'db_timeout' }), 'db_timeout');
  assert.equal(stripeWebhookErrorCode({ code: 'secret value with spaces' }), 'WEBHOOK_PROCESSING_FAILED');
  assert.equal(stripeWebhookErrorCode(Object.assign(new Error('private detail'), { code: 'invalid code' })), 'Error');
  assert.doesNotMatch(stripeWebhookErrorCode({ name: 'secret value with spaces' }), /secret value/);
});

test('expired and delayed-failed checkouts close only their pending order', async () => {
  for (const type of ['checkout.session.expired', 'checkout.session.async_payment_failed']) {
    assert.deepEqual(checkoutFailureForEvent(checkoutEvent({ type })), {
      stripeCheckoutSessionId: 'cs_test_xert',
    });
  }
  assert.equal(checkoutFailureForEvent(checkoutEvent()), null);
  assert.equal(checkoutFailureForEvent(checkoutEvent({
    type: 'checkout.session.expired',
    metadata: { xert_checkout_attempt_id: '' },
  })), null);
  assert.throws(() => checkoutFailureForEvent(checkoutEvent({
    type: 'checkout.session.expired',
    metadata: { xert_checkout_attempt_id: 'not-a-uuid' },
  })), /identity is invalid/i);

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

test('reconciles full refunds and escalates partial refunds for operator review', () => {
  const event = {
    id: 'evt_refund_xert',
    type: 'charge.refunded',
    created: 1783814400,
    data: { object: {
      id: 'ch_xert', payment_intent: 'pi_test_xert', amount: 4800,
      amount_refunded: 4800, currency: 'aud', refunded: true,
      metadata: { xert_checkout_attempt_id: 'E8C03884-4C1B-4A96-97C1-B0A33F2095B3' },
      refunds: { data: [{ id: 're_xert', status: 'succeeded', created: 1783814400 }] },
    } },
  };
  const refund = stripeRefundForEvent(event, NOW);
  assert.equal(refund.p_refund_id, 're_xert');
  assert.equal(refund.p_amount_cents, 4800);
  assert.equal(refund.p_payment_intent_id, 'pi_test_xert');
  const stagedRefund = stripeRefundForEvent({
    ...event,
    data: { object: {
      ...event.data.object,
      refunds: { data: [
        { id: 're_older', status: 'succeeded', created: 1783814300 },
        { id: 're_failed', status: 'failed', created: 1783814500 },
        { id: 're_newest', status: 'succeeded', created: 1783814400 },
      ] },
    } },
  }, NOW);
  assert.equal(stagedRefund.p_refund_id, 're_newest');
  assert.equal(stripeRefundForEvent({ ...event, type: 'charge.updated' }, NOW), null);
  assert.equal(stripeRefundForEvent({
    ...event,
    data: { object: { ...event.data.object, metadata: {} } },
  }, NOW), null);
  assert.throws(() => stripeRefundForEvent({
    ...event,
    data: { object: { ...event.data.object, metadata: { xert_checkout_attempt_id: 'not-a-uuid' } } },
  }, NOW), /identity is invalid/i);
  const partialEvent = {
    ...event,
    data: { object: { ...event.data.object, amount_refunded: 2400, refunded: false } },
  };
  assert.deepEqual(stripeOperatorReviewForEvent(partialEvent), {
    errorCode: 'PARTIAL_REFUND_REQUIRES_REVIEW',
    paymentIntentId: 'pi_test_xert',
  });
  assert.throws(
    () => stripeRefundForEvent(partialEvent, NOW),
    error => error?.code === 'PARTIAL_REFUND_REQUIRES_REVIEW',
  );
  assert.equal(stripeOperatorReviewForEvent(event), null);
  assert.equal(stripeOperatorReviewForEvent({
    ...event,
    data: { object: { ...event.data.object, metadata: {} } },
  }), null);
  assert.throws(() => stripeOperatorReviewForEvent({
    ...partialEvent,
    data: { object: { ...partialEvent.data.object, amount_refunded: 5000 } },
  }), /amount data is incomplete or invalid/i);
  assert.throws(() => stripeRefundForEvent({
    ...event,
    data: { object: { ...event.data.object, refunded: false } },
  }, NOW), /status is incomplete or invalid/i);
  assert.throws(() => stripeRefundForEvent({
    ...event,
    data: { object: { ...event.data.object, refunds: { data: [] } } },
  }, NOW), /data is incomplete or invalid/i);
});

test('links an exceptional Stripe event to its XERT order without exposing member data', async () => {
  const calls = [];
  const orderId = '81fdd46a-d2a9-4ab4-a479-0e687c72c4f2';
  const query = {
    select(columns) { calls.push(['select', columns]); return query; },
    eq(column, value) { calls.push(['eq', column, value]); return query; },
    async maybeSingle() { return { data: { id: orderId }, error: null }; },
  };
  const result = await findStripeOrderForReview({
    from(table) { calls.push(['from', table]); return query; },
  }, 'pi_test_xert');
  assert.equal(result, orderId);
  assert.deepEqual(calls, [
    ['from', 'orders'],
    ['select', 'id'],
    ['eq', 'stripe_payment_intent_id', 'pi_test_xert'],
  ]);
});

test('classifies a complete Stripe dispute for exact-order operator review', () => {
  const event = {
    id: 'evt_dispute_xert',
    type: 'charge.dispute.created',
    data: { object: {
      id: 'dp_xert', payment_intent: 'pi_test_xert', charge: 'ch_xert',
      amount: 4800, currency: 'aud',
    } },
  };
  assert.deepEqual(stripeDisputeReviewForEvent(event), {
    errorCode: 'PAYMENT_DISPUTE_REQUIRES_REVIEW',
    paymentIntentId: 'pi_test_xert',
  });
  assert.equal(stripeDisputeReviewForEvent({ ...event, type: 'charge.dispute.closed' }), null);
  assert.throws(() => stripeDisputeReviewForEvent({
    ...event,
    data: { object: { ...event.data.object, payment_intent: null } },
  }), /dispute data is incomplete or invalid/i);
});

test('records operator review only after applying the event scoping rule', async () => {
  const event = { id: 'evt_review_xert' };
  const review = {
    errorCode: 'PAYMENT_DISPUTE_REQUIRES_REVIEW',
    paymentIntentId: 'pi_test_xert',
  };
  const calls = [];
  const noOrderQuery = {
    select() { return noOrderQuery; },
    eq() { return noOrderQuery; },
    async maybeSingle() { return { data: null, error: null }; },
  };
  const noOrderAdmin = {
    from() { return noOrderQuery; },
    async rpc(name, payload) { calls.push({ name, payload }); return { error: null }; },
  };
  assert.equal(await recordStripeOperatorReview(
    noOrderAdmin, event, review, { requireLinkedOrder: true }
  ), false);
  assert.equal(calls.length, 0);

  assert.equal(await recordStripeOperatorReview(noOrderAdmin, event, review), true);
  assert.equal(calls[0].name, 'finish_stripe_webhook_event');
  assert.equal(calls[0].payload.p_status, 'failed');
  assert.equal(calls[0].payload.p_error_code, 'PAYMENT_DISPUTE_REQUIRES_REVIEW');
  assert.equal(calls[0].payload.p_order_id, null);
});

test('persists refund recovery through the service-role reconciliation RPC', async () => {
  const calls = [];
  const admin = { async rpc(name, payload) { calls.push({ name, payload }); return { error: null }; } };
  const payload = { p_refund_id: 're_xert' };
  await persistStripeRefund(admin, payload);
  assert.deepEqual(calls, [{ name: 'reconcile_stripe_order_refund', payload }]);
});
