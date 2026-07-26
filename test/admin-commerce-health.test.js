import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import adminCommerceHealthHandler, {
  activateVerifiedProduct,
  activateSessionPackPayments,
  inspectCommerceEnvironment,
  inspectCommerceHealth,
  inspectCommerceProducts,
  inspectPaymentActivationReceipt,
  inspectStripeAccount,
  inspectStripeWebhookEndpoints,
  inspectWebhookDeliveryHealth,
  normalizePaymentActivationRequest,
  normalizeProductActivationRequest,
  normalizeStripeRetryRequest,
  normalizeStripeReviewResolutionRequest,
  retryStripeWebhookEvent,
  resolveStripeOperatorReview,
  stripeIncidentResolution,
} from '../api/admin-commerce-health.js';

const validProduct = {
  id: '00000000-0000-4000-8000-000000000004',
  slug: 'starter-4',
  price_cents: 4800,
  currency: 'aud',
  sessions_count: 4,
  validity_days: 28,
  stripe_price_id: 'price_STARTER4',
};

const validCommerceEnvironment = {
  SUPABASE_URL: 'https://ugmkwoapjcpiucsrxwzt.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-value',
  STRIPE_SECRET_KEY: 'sk_test_secret_value',
  STRIPE_WEBHOOK_SECRET: 'whsec_webhook_value',
  APP_BASE_URL: 'https://xert-fitness.vercel.app',
};

const completeCommerceCapabilities = new Set([
  'stripe_refund_reconciliation', 'checkout_reconciliation',
  'stripe_payment_fulfillment', 'guarded_payment_activation',
  'admin_settings_singleton', 'payment_activation_drift_guard', 'stripe_pending_order_guard',
  'stripe_order_terms_snapshot', 'stripe_webhook_ledger',
]);

const validActivationBody = {
  action: 'activate_payments',
  confirmation: 'ENABLE PAYMENTS',
  settings_id: '81fdd46a-d2a9-4ab4-a479-0e687c72c4f2',
  expected_updated_at: '2026-07-16T03:00:00.000Z',
  settings: {
    target_launch_date: '2026-08-01',
    countdown_enabled: true,
    bookings_enabled: true,
    payments_enabled: true,
    announcement_banner_text: '  Packs are live  ',
    announcement_banner_enabled: true,
  },
};

const validProductActivationBody = {
  action: 'activate_product',
  product_id: validProduct.id,
  expected_updated_at: '2026-07-20T03:00:00.000Z',
  product: {
    name: 'Starter 4',
    description: 'Four coached sessions',
    price_cents: 4800,
    currency: 'AUD',
    sessions_count: 4,
    validity_days: 28,
    stripe_price_id: 'price_STARTER4',
    featured: true,
    active: true,
    sort_order: 10,
  },
};

function paymentActivationAdmin(result) {
  const calls = [];
  return {
    calls,
    admin: {
      async rpc(name, body) {
        calls.push(['rpc', name, body]);
        return result;
      },
    },
  };
}

function capabilityAdmin(capabilities, webhookRows = [], options = {}) {
  const settingsRows = options.settingsRows || [{
    id: validActivationBody.settings_id,
    payments_enabled: false,
    updated_at: validActivationBody.expected_updated_at,
  }];
  const auditRows = options.auditRows || [];
  return {
    from(table) {
      if (table === 'stripe_webhook_events') {
        const query = {
          select() { return query; },
          gte() { return query; },
          eq() { return query; },
          in() { return query; },
          order() { return query; },
          async limit() { return { data: webhookRows, error: null }; },
        };
        return query;
      }
      if (table === 'stripe_webhook_signature_failures') {
        const query = {
          select() { return query; },
          gte() { return query; },
          then(resolve) { return resolve({ data: null, count: options.signatureFailures || 0, error: options.signatureFailureError || null }); },
        };
        return query;
      }
      if (table === 'orders') {
        const query = {
          select() { return query; },
          eq() { return query; },
          is() { return query; },
          gt() { return query; },
          gte() { return query; },
          then(resolve) { return resolve({ data: null, count: options.paidBeyondLedger || 0, error: options.ordersError || null }); },
        };
        return query;
      }
      if (table === 'admin_settings') {
        const query = {
          select() { return query; },
          async limit() { return { data: settingsRows, error: options.settingsError || null }; },
        };
        return query;
      }
      if (table === 'admin_content_changes') {
        const query = {
          select() { return query; },
          eq() { return query; },
          order() { return query; },
          async limit() { return { data: auditRows, error: options.auditError || null }; },
        };
        return query;
      }
      assert.equal(table, 'xert_schema_capabilities');
      let requestedCapability;
      return {
        select() { return this; },
        eq(field, value) {
          assert.equal(field, 'capability');
          requestedCapability = value;
          return this;
        },
        async maybeSingle() {
          return capabilities.has(requestedCapability)
            ? { data: { capability: requestedCapability }, error: null }
            : { data: null, error: null };
        },
      };
    },
  };
}

test('payment activation receipt must match the enabled settings version and actor', () => {
  const settings = [{
    id: validActivationBody.settings_id,
    payments_enabled: true,
    updated_at: '2026-07-16T03:05:00.000Z',
  }];
  const receipt = {
    resource_id: validActivationBody.settings_id,
    action: 'updated',
    changed_by: '9bb45f52-9022-4b5b-933f-d8998dbe659f',
    previous_snapshot: { payments_enabled: false },
    new_snapshot: { payments_enabled: true, updated_at: '2026-07-16T03:05:00.000Z' },
    created_at: '2026-07-16T03:05:00.100Z',
  };

  const verified = inspectPaymentActivationReceipt(settings, null, [receipt], null);
  assert.equal(verified.payment_switch.state, 'enabled');
  assert.equal(verified.activation_receipt.ready, true);
  assert.equal(verified.activation_receipt.actor_recorded, true);
  assert.equal(verified.activation_receipt.activated_at, receipt.created_at);

  const stale = inspectPaymentActivationReceipt(settings, null, [{
    ...receipt,
    new_snapshot: { ...receipt.new_snapshot, updated_at: '2026-07-16T03:04:00.000Z' },
  }], null);
  assert.equal(stale.activation_receipt.ready, false);
  assert.match(stale.activation_receipt.issue, /matching immutable activation receipt/);

  const paused = inspectPaymentActivationReceipt([{ ...settings[0], payments_enabled: false }], null);
  assert.equal(paused.activation_receipt.required, false);
  assert.equal(paused.activation_receipt.ready, true);
});

function readyStripe() {
  return {
    prices: {
      async retrieve(id) {
        return {
          id, active: true, type: 'one_time', recurring: null,
          unit_amount: validProduct.price_cents, currency: 'aud', livemode: false,
          metadata: {
            xert_product_id: validProduct.id,
            xert_catalog_slug: validProduct.slug,
            xert_sessions: String(validProduct.sessions_count),
            xert_validity_days: String(validProduct.validity_days),
          },
        };
      },
    },
    webhookEndpoints: {
      async list() {
        return { data: [{
          url: 'https://xert-fitness.vercel.app/api/stripe-webhook',
          status: 'enabled',
          enabled_events: [
            'checkout.session.completed', 'checkout.session.async_payment_succeeded',
            'checkout.session.expired', 'checkout.session.async_payment_failed', 'charge.refunded',
            'charge.dispute.created', 'charge.dispute.closed',
          ],
        }] };
      },
    },
    accounts: {
      async retrieve() {
        return {
          details_submitted: true, charges_enabled: true, payouts_enabled: true,
          country: 'AU', default_currency: 'aud',
        };
      },
    },
  };
}

test('payment activation accepts only a confirmed bounded platform snapshot', () => {
  assert.deepEqual(normalizePaymentActivationRequest(validActivationBody), {
    settingsId: validActivationBody.settings_id,
    expectedUpdatedAt: validActivationBody.expected_updated_at,
    updates: {
      target_launch_date: '2026-08-01',
      countdown_enabled: true,
      bookings_enabled: true,
      payments_enabled: true,
      announcement_banner_text: 'Packs are live',
      announcement_banner_enabled: true,
    },
  });

  assert.throws(
    () => normalizePaymentActivationRequest({ ...validActivationBody, confirmation: 'yes' }),
    /PAYMENT_ACTIVATION_NOT_CONFIRMED/,
  );
  for (const settings of [
    { ...validActivationBody.settings, payments_enabled: false },
    { ...validActivationBody.settings, bookings_enabled: 'true' },
    { ...validActivationBody.settings, target_launch_date: '2026-02-30' },
    { ...validActivationBody.settings, announcement_banner_text: 'x'.repeat(1_001) },
  ]) {
    assert.throws(
      () => normalizePaymentActivationRequest({ ...validActivationBody, settings }),
      /INVALID_PAYMENT_ACTIVATION/,
    );
  }
  assert.throws(
    () => normalizePaymentActivationRequest({
      ...validActivationBody,
      settings: { ...validActivationBody.settings, bookings_enabled: false },
    }),
    /PAYMENTS_REQUIRE_BOOKINGS/,
  );
});

test('product activation accepts only a bounded active catalogue snapshot', () => {
  const normalized = normalizeProductActivationRequest(validProductActivationBody);
  assert.equal(normalized.productId, validProduct.id);
  assert.equal(normalized.updates.currency, 'aud');
  assert.equal(normalized.updates.active, true);

  for (const product of [
    { ...validProductActivationBody.product, active: false },
    { ...validProductActivationBody.product, price_cents: 2_147_483_648 },
    { ...validProductActivationBody.product, sessions_count: 1_001 },
    { ...validProductActivationBody.product, validity_days: 3_651 },
    { ...validProductActivationBody.product, sort_order: 10_001 },
    { ...validProductActivationBody.product, stripe_price_id: 'prod_wrong' },
  ]) {
    assert.throws(
      () => normalizeProductActivationRequest({ ...validProductActivationBody, product }),
      /INVALID_PRODUCT_ACTIVATION/,
    );
  }
});

test('product activation verifies Stripe identity and terms before optimistic activation', async () => {
  const activation = normalizeProductActivationRequest(validProductActivationBody);
  const current = {
    ...validProduct,
    name: 'Starter 4',
    description: 'Four coached sessions',
    featured: false,
    active: false,
    sort_order: 10,
    updated_at: activation.expectedUpdatedAt,
  };
  const saved = { ...current, ...activation.updates, updated_at: '2026-07-20T03:01:00.000Z' };
  const rpcCalls = [];
  const admin = {
    from(table) {
      assert.equal(table, 'products');
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: current, error: null }; },
      };
    },
    async rpc(name, body) {
      rpcCalls.push([name, body]);
      return { data: saved, error: null };
    },
  };
  const stripe = {
    prices: {
      async retrieve(id) {
        assert.equal(id, 'price_STARTER4');
        return {
          id,
          active: true,
          deleted: false,
          type: 'one_time',
          unit_amount: 4800,
          currency: 'aud',
          livemode: true,
          metadata: {
            xert_product_id: validProduct.id,
            xert_catalog_slug: 'starter-4',
            xert_sessions: '4',
            xert_validity_days: '28',
          },
        };
      },
    },
  };

  assert.deepEqual(
    await activateVerifiedProduct({
      admin,
      stripe,
      activation,
      expectedLivemode: true,
      actorId: '9bb45f52-9022-4b5b-933f-d8998dbe659f',
    }),
    saved,
  );
  assert.deepEqual(rpcCalls, [[
    'admin_apply_verified_product',
    {
      p_product_id: validProduct.id,
      p_product: activation.updates,
      p_expected_updated_at: activation.expectedUpdatedAt,
      p_actor_id: '9bb45f52-9022-4b5b-933f-d8998dbe659f',
    },
  ]]);

  const mismatchedStripe = {
    prices: { async retrieve() { return { ...(await stripe.prices.retrieve('price_STARTER4')), unit_amount: 4900 }; } },
  };
  rpcCalls.length = 0;
  await assert.rejects(
    activateVerifiedProduct({
      admin,
      stripe: mismatchedStripe,
      activation,
      expectedLivemode: true,
      actorId: '9bb45f52-9022-4b5b-933f-d8998dbe659f',
    }),
    /does not match/,
  );
  assert.deepEqual(rpcCalls, []);

  const staleAdmin = {
    ...admin,
    async rpc() { return { data: null, error: { message: 'PRODUCT_STALE' } }; },
  };
  await assert.rejects(
    activateVerifiedProduct({
      admin: staleAdmin,
      stripe,
      activation,
      expectedLivemode: true,
      actorId: '9bb45f52-9022-4b5b-933f-d8998dbe659f',
    }),
    /PRODUCT_STALE/,
  );
});

test('payment activation compare-and-sets the paused settings version', async () => {
  const activation = normalizePaymentActivationRequest(validActivationBody);
  const actorId = '9bb45f52-9022-4b5b-933f-d8998dbe659f';
  const updated = { id: activation.settingsId, payments_enabled: true };
  const { admin, calls } = paymentActivationAdmin({ data: [updated], error: null });
  assert.deepEqual(await activateSessionPackPayments(admin, actorId, activation), updated);
  assert.deepEqual(calls, [
    ['rpc', 'admin_activate_session_pack_payments', {
      p_actor_id: actorId,
      p_settings_id: activation.settingsId,
      p_expected_updated_at: activation.expectedUpdatedAt,
      p_target_launch_date: activation.updates.target_launch_date,
      p_countdown_enabled: activation.updates.countdown_enabled,
      p_bookings_enabled: activation.updates.bookings_enabled,
      p_announcement_banner_text: activation.updates.announcement_banner_text,
      p_announcement_banner_enabled: activation.updates.announcement_banner_enabled,
    }],
  ]);

  const stale = paymentActivationAdmin({ data: null, error: null });
  await assert.rejects(activateSessionPackPayments(stale.admin, actorId, activation), /PAYMENT_ACTIVATION_STALE/);
});

test('commerce readiness cannot pass without the guarded activation capability', async () => {
  const environment = validCommerceEnvironment;
  const products = [validProduct];
  const complete = await inspectCommerceHealth({
    admin: capabilityAdmin(completeCommerceCapabilities),
    products,
    environment,
    stripe: readyStripe(),
  });
  assert.equal(complete.ready, true);
  assert.equal(complete.fulfillment_ready, true);
  assert.equal(complete.refund_reconciliation_ready, true);
  assert.equal(complete.checkout_reconciliation_ready, true);
  assert.equal(complete.activation_guard_ready, true);
  assert.equal(complete.settings_contract_ready, true);
  assert.equal(complete.activation_drift_guard_ready, true);
  assert.equal(complete.pending_order_guard_ready, true);
  assert.equal(complete.order_terms_ready, true);
  assert.equal(complete.webhook_ledger_ready, true);
  assert.equal(complete.webhook_delivery.ready, true);
  assert.equal(complete.payment_switch.state, 'paused');
  assert.equal(complete.activation_receipt.required, false);

  const enabledWithoutReceipt = await inspectCommerceHealth({
    admin: capabilityAdmin(completeCommerceCapabilities, [], {
      settingsRows: [{
        id: validActivationBody.settings_id,
        payments_enabled: true,
        updated_at: '2026-07-16T03:05:00.000Z',
      }],
    }),
    products,
    environment,
    stripe: readyStripe(),
  });
  assert.equal(enabledWithoutReceipt.ready, false);
  assert.equal(enabledWithoutReceipt.activation_receipt.ready, false);
  assert.match(
    enabledWithoutReceipt.issues.find(issue => issue.slug === 'activation-receipt')?.reason || '',
    /matching immutable activation receipt/,
  );

  const missingRefundReconciliation = await inspectCommerceHealth({
    admin: capabilityAdmin(new Set([...completeCommerceCapabilities].filter(capability => capability !== 'stripe_refund_reconciliation'))),
    products,
    environment,
    stripe: readyStripe(),
  });
  assert.equal(missingRefundReconciliation.ready, false);
  assert.equal(missingRefundReconciliation.refund_reconciliation_ready, false);
  assert.match(
    missingRefundReconciliation.issues.find(issue => issue.reason.includes('refund reconciliation'))?.reason || '',
    /not installed/,
  );

  const missingCheckoutReconciliation = await inspectCommerceHealth({
    admin: capabilityAdmin(new Set([...completeCommerceCapabilities].filter(capability => capability !== 'checkout_reconciliation'))),
    products,
    environment,
    stripe: readyStripe(),
  });
  assert.equal(missingCheckoutReconciliation.ready, false);
  assert.equal(missingCheckoutReconciliation.checkout_reconciliation_ready, false);
  assert.match(
    missingCheckoutReconciliation.issues.find(issue => issue.reason.includes('checkout recovery'))?.reason || '',
    /not installed/,
  );

  const missingGuard = await inspectCommerceHealth({
    admin: capabilityAdmin(new Set(['stripe_payment_fulfillment'])),
    products,
    environment,
    stripe: readyStripe(),
  });
  assert.equal(missingGuard.ready, false);
  assert.equal(missingGuard.activation_guard_ready, false);
  assert.match(missingGuard.issues.find(issue => issue.reason.includes('Guarded'))?.reason || '', /not installed/);

  const missingSettingsContract = await inspectCommerceHealth({
    admin: capabilityAdmin(new Set(['stripe_payment_fulfillment', 'guarded_payment_activation'])),
    products,
    environment,
    stripe: readyStripe(),
  });
  assert.equal(missingSettingsContract.ready, false);
  assert.equal(missingSettingsContract.settings_contract_ready, false);
  assert.match(
    missingSettingsContract.issues.find(issue => issue.reason.includes('singleton'))?.reason || '',
    /not installed/,
  );

  const missingDriftGuard = await inspectCommerceHealth({
    admin: capabilityAdmin(new Set([...completeCommerceCapabilities].filter(capability => capability !== 'payment_activation_drift_guard'))),
    products,
    environment,
    stripe: readyStripe(),
  });
  assert.equal(missingDriftGuard.ready, false);
  assert.equal(missingDriftGuard.activation_drift_guard_ready, false);
  assert.match(
    missingDriftGuard.issues.find(issue => issue.reason.includes('drift protection'))?.reason || '',
    /not installed/,
  );

  const missingPendingOrderGuard = await inspectCommerceHealth({
    admin: capabilityAdmin(new Set(['stripe_payment_fulfillment', 'guarded_payment_activation', 'admin_settings_singleton', 'payment_activation_drift_guard'])),
    products,
    environment,
    stripe: readyStripe(),
  });
  assert.equal(missingPendingOrderGuard.ready, false);
  assert.equal(missingPendingOrderGuard.pending_order_guard_ready, false);
  assert.match(
    missingPendingOrderGuard.issues.find(issue => issue.reason.includes('pending-order'))?.reason || '',
    /not installed/,
  );

  const missingOrderTerms = await inspectCommerceHealth({
    admin: capabilityAdmin(new Set(['stripe_payment_fulfillment', 'guarded_payment_activation', 'admin_settings_singleton', 'payment_activation_drift_guard', 'stripe_pending_order_guard'])),
    products,
    environment,
    stripe: readyStripe(),
  });
  assert.equal(missingOrderTerms.ready, false);
  assert.equal(missingOrderTerms.order_terms_ready, false);
  assert.match(
    missingOrderTerms.issues.find(issue => issue.reason.includes('order terms'))?.reason || '',
    /not installed/,
  );

  const missingWebhookLedger = await inspectCommerceHealth({
    admin: capabilityAdmin(new Set(['stripe_payment_fulfillment', 'guarded_payment_activation', 'admin_settings_singleton', 'payment_activation_drift_guard', 'stripe_pending_order_guard', 'stripe_order_terms_snapshot'])),
    products,
    environment,
    stripe: readyStripe(),
  });
  assert.equal(missingWebhookLedger.ready, false);
  assert.equal(missingWebhookLedger.webhook_ledger_ready, false);
  assert.match(
    missingWebhookLedger.issues.find(issue => issue.reason.includes('delivery ledger'))?.reason || '',
    /not installed/,
  );
});

test('webhook delivery health reports retries, failures and stalled processing', async () => {
  const now = new Date('2026-07-16T06:00:00.000Z');
  const healthy = await inspectWebhookDeliveryHealth(capabilityAdmin(new Set(), [
    { status: 'processed', attempts: 2, last_received_at: '2026-07-16T05:59:00.000Z' },
    { status: 'ignored', attempts: 1, last_received_at: '2026-07-16T05:58:00.000Z' },
  ]), now);
  assert.deepEqual(healthy, {
    ready: true, available: true, received: 2, failed: 0,
    stale_processing: 0, signature_failures: 0, delivery_gap: false,
    delivery_probe_failed: false,
    retries: 1, incidents: [], issue: null,
  });

  const unhealthy = await inspectWebhookDeliveryHealth(capabilityAdmin(new Set(), [
    {
      event_id: 'evt_failed_123', event_type: 'checkout.session.completed', status: 'failed', attempts: 3,
      order_id: '81fdd46a-d2a9-4ab4-a479-0e687c72c4f2', last_received_at: '2026-07-16T05:59:00.000Z',
      last_error_code: 'FULFILLMENT_REJECTED',
    },
    {
      event_id: 'evt_stalled_456', event_type: 'charge.refunded', status: 'processing', attempts: 1,
      order_id: 'not-a-uuid', last_received_at: '2026-07-16T05:30:00.000Z', last_error_code: null,
    },
  ]), now);
  assert.equal(unhealthy.ready, false);
  assert.equal(unhealthy.failed, 1);
  assert.equal(unhealthy.stale_processing, 1);
  assert.equal(unhealthy.retries, 2);
  assert.deepEqual(unhealthy.incidents, [
    {
      event_id: 'evt_failed_123', event_type: 'checkout.session.completed', status: 'failed', attempts: 3,
      order_id: '81fdd46a-d2a9-4ab4-a479-0e687c72c4f2', last_received_at: '2026-07-16T05:59:00.000Z',
      error_code: 'FULFILLMENT_REJECTED',
    },
    {
      event_id: 'evt_stalled_456', event_type: 'charge.refunded', status: 'stalled', attempts: 1,
      order_id: null, last_received_at: '2026-07-16T05:30:00.000Z', error_code: null,
    },
  ]);
  assert.match(unhealthy.issue, /unresolved failure/);

  const bounded = await inspectWebhookDeliveryHealth(capabilityAdmin(new Set(), Array.from({ length: 14 }, (_, index) => ({
    event_id: `evt_${index}`, event_type: 'checkout.session.completed', status: 'failed', attempts: 1,
    order_id: null, last_received_at: '2026-07-16T05:59:00.000Z', last_error_code: 'x'.repeat(200),
  }))), now);
  assert.equal(bounded.incidents.length, 10);
  assert.equal(bounded.incidents[0].error_code.length, 120);
});

test('rejected webhook signatures fail delivery health even with an empty ledger', async () => {
  const now = new Date('2026-07-16T06:00:00.000Z');
  const rejected = await inspectWebhookDeliveryHealth(
    capabilityAdmin(new Set(), [], { signatureFailures: 3 }),
    now,
  );
  assert.equal(rejected.signature_failures, 3);
  assert.equal(rejected.ready, false);
  assert.match(rejected.issue, /invalid signature[\s\S]*STRIPE_WEBHOOK_SECRET/);
});

test('paid orders with no matching webhook delivery fail delivery health', async () => {
  const now = new Date('2026-07-16T06:00:00.000Z');
  const gapped = await inspectWebhookDeliveryHealth(
    capabilityAdmin(new Set(), [], { paidBeyondLedger: 2 }),
    now,
  );
  assert.equal(gapped.delivery_gap, true);
  assert.equal(gapped.ready, false);
  assert.match(gapped.issue, /Paid orders exist with no matching Stripe webhook/);
});

test('delivery health stays ready when the signature ledger is not installed yet', async () => {
  const now = new Date('2026-07-16T06:00:00.000Z');
  const rolling = await inspectWebhookDeliveryHealth(
    capabilityAdmin(new Set(), [], {
      signatureFailureError: { code: 'PGRST205', message: 'stripe_webhook_signature_failures not found in schema cache' },
    }),
    now,
  );
  assert.equal(rolling.signature_failures, 0);
  assert.equal(rolling.ready, true);
});

test('partial-refund incidents give owners a concrete recovery instruction', async () => {
  assert.match(stripeIncidentResolution('PARTIAL_REFUND_REQUIRES_REVIEW'), /adjust or revoke the member credits/i);
  assert.equal(stripeIncidentResolution('DATABASE_TIMEOUT'), null);
  const result = await inspectWebhookDeliveryHealth(capabilityAdmin(new Set(), [{
    event_id: 'evt_partial_refund', event_type: 'charge.refunded', status: 'failed', attempts: 1,
    order_id: '81fdd46a-d2a9-4ab4-a479-0e687c72c4f2', last_received_at: '2026-07-16T05:59:00.000Z',
    last_error_code: 'PARTIAL_REFUND_REQUIRES_REVIEW',
  }]), new Date('2026-07-16T06:00:00.000Z'));
  assert.match(result.incidents[0].resolution, /linked order/i);
  assert.match(stripeIncidentResolution('PAYMENT_DISPUTE_REQUIRES_REVIEW'), /preserve the member and order evidence/i);
  assert.match(stripeIncidentResolution('PAYMENT_DISPUTE_LOST_REQUIRES_REVIEW'), /closed this dispute as lost/i);
});

test('owner-review incidents remain visible after the 24-hour delivery window', async () => {
  const oldReview = {
    event_id: 'evt_old_partial_refund', event_type: 'charge.refunded', status: 'failed', attempts: 1,
    order_id: null, last_received_at: '2026-07-10T05:59:00.000Z',
    last_error_code: 'PARTIAL_REFUND_REQUIRES_REVIEW',
  };
  let webhookQueryNumber = 0;
  const admin = {
    from(table) {
      if (table === 'stripe_webhook_signature_failures') {
        return { select() { return this; }, gte() { return this; }, then(resolve) { return resolve({ data: null, count: 0, error: null }); } };
      }
      if (table === 'orders') {
        return {
          select() { return this; },
          eq() { return this; },
          is() { return this; },
          gt() { return this; },
          gte() { return this; },
          then(resolve) { return resolve({ data: null, count: 0, error: null }); },
        };
      }
      webhookQueryNumber += 1;
      const rows = webhookQueryNumber === 1 ? [] : [oldReview];
      const query = {
        select() { return query; }, gte() { return query; }, eq() { return query; },
        in() { return query; }, order() { return query; },
        async limit() { return { data: rows, error: null }; },
      };
      return query;
    },
  };
  const result = await inspectWebhookDeliveryHealth(admin, new Date('2026-07-16T06:00:00.000Z'));
  assert.equal(result.received, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.ready, false);
  assert.equal(result.incidents[0].event_id, oldReview.event_id);
});

test('Stripe review resolution is confirmed, allow-listed, and compare-and-set', async () => {
  const review = normalizeStripeReviewResolutionRequest({
    action: 'resolve_stripe_review', confirmation: 'MARK HANDLED',
    event_id: 'evt_partial_123', error_code: 'PARTIAL_REFUND_REQUIRES_REVIEW',
  });
  assert.deepEqual(review, {
    eventId: 'evt_partial_123', errorCode: 'PARTIAL_REFUND_REQUIRES_REVIEW',
  });
  assert.throws(() => normalizeStripeReviewResolutionRequest({
    action: 'resolve_stripe_review', confirmation: 'MARK HANDLED',
    event_id: 'evt_partial_123', error_code: 'DATABASE_TIMEOUT',
  }), /INVALID_STRIPE_REVIEW_RESOLUTION/);
  assert.deepEqual(normalizeStripeReviewResolutionRequest({
    action: 'resolve_stripe_review', confirmation: 'MARK HANDLED',
    event_id: 'evt_dispute_lost_123', error_code: 'PAYMENT_DISPUTE_LOST_REQUIRES_REVIEW',
  }), {
    eventId: 'evt_dispute_lost_123', errorCode: 'PAYMENT_DISPUTE_LOST_REQUIRES_REVIEW',
  });

  const calls = [];
  const query = {
    update(payload) { calls.push(['update', payload]); return query; },
    eq(column, value) { calls.push(['eq', column, value]); return query; },
    select(columns) { calls.push(['select', columns]); return query; },
    async maybeSingle() { return { data: { event_id: review.eventId, status: 'ignored' }, error: null }; },
  };
  const result = await resolveStripeOperatorReview({ from() { return query; } }, review, new Date('2026-07-16T06:00:00.000Z'));
  assert.equal(result.status, 'ignored');
  assert.deepEqual(calls, [
    ['update', { status: 'ignored', finished_at: '2026-07-16T06:00:00.000Z' }],
    ['eq', 'event_id', 'evt_partial_123'],
    ['eq', 'status', 'failed'],
    ['eq', 'last_error_code', 'PARTIAL_REFUND_REQUIRES_REVIEW'],
    ['select', 'event_id,status'],
  ]);

  const staleQuery = {
    update() { return staleQuery; }, eq() { return staleQuery; }, select() { return staleQuery; },
    async maybeSingle() { return { data: null, error: null }; },
  };
  await assert.rejects(
    resolveStripeOperatorReview({ from() { return staleQuery; } }, review),
    /STRIPE_REVIEW_RESOLUTION_STALE/,
  );
});

test('Stripe recovery accepts only confirmed event identifiers', () => {
  assert.deepEqual(normalizeStripeRetryRequest({
    action: 'retry_stripe_event', confirmation: 'RETRY EVENT', event_id: 'evt_retry_123',
  }), { eventId: 'evt_retry_123' });
  for (const body of [
    { action: 'retry_stripe_event', confirmation: 'RETRY', event_id: 'evt_retry_123' },
    { action: 'retry_stripe_event', confirmation: 'RETRY EVENT', event_id: 'cs_not_an_event' },
    { action: 'resolve_stripe_review', confirmation: 'RETRY EVENT', event_id: 'evt_retry_123' },
  ]) {
    assert.throws(() => normalizeStripeRetryRequest(body), /INVALID_STRIPE_RETRY/);
  }
});

function webhookRetryAdmin(ledgerEvent) {
  const calls = [];
  const query = {
    select(columns) { calls.push(['select', columns]); return query; },
    eq(column, value) { calls.push(['eq', column, value]); return query; },
    async maybeSingle() { return { data: ledgerEvent, error: null }; },
  };
  return {
    calls,
    from(table) { assert.equal(table, 'stripe_webhook_events'); return query; },
    async rpc(name, payload) {
      calls.push(['rpc', name, payload]);
      if (name === 'begin_stripe_webhook_event') {
        return { data: [{ already_finished: false, attempt_count: 2 }], error: null };
      }
      return { data: null, error: null };
    },
  };
}

test('owner recovery retrieves the canonical Stripe event and reuses webhook processing', async () => {
  const ledgerEvent = {
    event_id: 'evt_retry_123', event_type: 'customer.created', livemode: false,
    status: 'failed', last_received_at: '2026-07-16T05:55:00.000Z', last_error_code: 'DATABASE_TIMEOUT',
  };
  const admin = webhookRetryAdmin(ledgerEvent);
  const retrieved = [];
  const stripe = { events: { async retrieve(eventId) {
    retrieved.push(eventId);
    return { id: eventId, type: ledgerEvent.event_type, livemode: false, data: { object: {} } };
  } } };

  const result = await retryStripeWebhookEvent(admin, stripe, { eventId: ledgerEvent.event_id }, {
    secretKey: 'sk_test_xert', now: new Date('2026-07-16T06:10:00.000Z'),
  });
  assert.deepEqual(retrieved, [ledgerEvent.event_id]);
  assert.deepEqual(result, {
    duplicate: false, requiresReview: false, handled: false, orderId: null,
  });
  assert.deepEqual(admin.calls.filter(call => call[0] === 'rpc').map(call => call[1]), [
    'begin_stripe_webhook_event', 'finish_stripe_webhook_event',
  ]);
});

test('owner recovery refuses review incidents, active attempts, and Stripe identity drift', async () => {
  const base = {
    event_id: 'evt_retry_123', event_type: 'customer.created', livemode: false,
    status: 'failed', last_received_at: '2026-07-16T05:55:00.000Z', last_error_code: 'DATABASE_TIMEOUT',
  };
  const stripe = event => ({ events: { async retrieve() { return event; } } });
  const options = { secretKey: 'sk_test_xert', now: new Date('2026-07-16T06:00:00.000Z') };

  await assert.rejects(
    retryStripeWebhookEvent(webhookRetryAdmin({
      ...base, last_error_code: 'PARTIAL_REFUND_REQUIRES_REVIEW',
    }), stripe(null), { eventId: base.event_id }, options),
    /STRIPE_RETRY_REQUIRES_OPERATOR_REVIEW/,
  );
  await assert.rejects(
    retryStripeWebhookEvent(webhookRetryAdmin({
      ...base, status: 'processing', last_received_at: '2026-07-16T05:59:00.000Z',
    }), stripe(null), { eventId: base.event_id }, options),
    /STRIPE_RETRY_STALE/,
  );
  await assert.rejects(
    retryStripeWebhookEvent(
      webhookRetryAdmin(base),
      stripe({ id: base.event_id, type: 'customer.updated', livemode: false }),
      { eventId: base.event_id }, options,
    ),
    /STRIPE_RETRY_IDENTITY_MISMATCH/,
  );
});

test('commerce health reconciles Stripe-linked and dynamic active products', async () => {
  const result = await inspectCommerceProducts([
    validProduct,
    { ...validProduct, slug: 'single', price_cents: 1500, stripe_price_id: null },
  ], async priceId => ({
    id: priceId,
    active: true,
    type: 'one_time',
    unit_amount: 4800,
    currency: 'aud',
    metadata: {
      xert_product_id: validProduct.id,
      xert_catalog_slug: validProduct.slug,
      xert_sessions: String(validProduct.sessions_count),
      xert_validity_days: String(validProduct.validity_days),
    },
  }));

  assert.deepEqual(result, {
    ready: true,
    active_product_count: 2,
    stripe_price_count: 1,
    dynamic_price_count: 1,
    issues: [],
  });
});

test('commerce health requires the complete production payment environment without exposing values', () => {
  assert.deepEqual(inspectCommerceEnvironment({}), {
    ready: false,
    missing: [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'APP_BASE_URL',
    ],
  });
  assert.deepEqual(inspectCommerceEnvironment({
    SUPABASE_URL: validCommerceEnvironment.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: validCommerceEnvironment.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY: 'sk_test_secret_value',
    STRIPE_WEBHOOK_SECRET: 'whsec_webhook_value',
    APP_BASE_URL: 'http://xert.example.com',
  }), {
    ready: false,
    missing: ['APP_BASE_URL'],
  });
  assert.deepEqual(inspectCommerceEnvironment(validCommerceEnvironment), { ready: true, missing: [] });

  for (const APP_BASE_URL of [
    'https://xert.example.com',
    'https://xert-fitness.vercel.app/checkout-return',
    'https://xert-fitness.vercel.app?preview=true',
  ]) {
    assert.deepEqual(inspectCommerceEnvironment({
      ...validCommerceEnvironment,
      APP_BASE_URL,
    }), { ready: false, missing: ['APP_BASE_URL'] });
  }

  assert.deepEqual(inspectCommerceEnvironment({
    ...validCommerceEnvironment,
    APP_BASE_URL: 'https://lookalike.example.com',
    EXPECTED_APP_HOST: 'lookalike.example.com',
  }), { ready: false, missing: ['APP_BASE_URL'] });

  assert.deepEqual(inspectCommerceEnvironment({
    ...validCommerceEnvironment,
    STRIPE_SECRET_KEY: 'secret-value',
    STRIPE_WEBHOOK_SECRET: 'webhook-value',
  }), { ready: false, missing: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] });
});

test('commerce health names invalid database values and Stripe mismatches', async () => {
  const result = await inspectCommerceProducts([
    { ...validProduct, slug: 'bad-db', sessions_count: 0 },
    { ...validProduct, slug: 'bad-stripe' },
    { ...validProduct, slug: 'missing-stripe', stripe_price_id: 'price_MISSING' },
  ], async priceId => {
    if (priceId === 'price_MISSING') throw new Error('No such price');
    return {
      id: priceId,
      active: true,
      type: 'one_time',
      unit_amount: 1200,
      currency: 'aud',
    };
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.issues, [
    { slug: 'bad-db', reason: 'Supabase product values are invalid.' },
    { slug: 'bad-stripe', reason: 'Stripe Price identity, terms, amount, currency, type, or active state does not match.' },
    { slug: 'missing-stripe', reason: 'Stripe Price ID could not be loaded.' },
  ]);
});

test('live commerce requires stable live-mode Stripe prices', async () => {
  const result = await inspectCommerceProducts([
    { ...validProduct, slug: 'linked' },
    { ...validProduct, slug: 'dynamic', stripe_price_id: null },
  ], async priceId => ({
    id: priceId,
    active: true,
    type: 'one_time',
    unit_amount: 4800,
    currency: 'aud',
    livemode: false,
  }), { requireLinkedPrices: true, expectedLivemode: true });

  assert.equal(result.ready, false);
  assert.deepEqual(result.issues, [
    { slug: 'linked', reason: 'Stripe Price identity, terms, amount, currency, type, or active state does not match.' },
    { slug: 'dynamic', reason: 'Live checkout requires a stable Stripe Price ID.' },
  ]);
});

test('commerce health verifies Australian charge and payout readiness', () => {
  assert.deepEqual(inspectStripeAccount({
    details_submitted: true,
    charges_enabled: true,
    payouts_enabled: true,
    country: 'AU',
    default_currency: 'aud',
  }), {
    ready: true,
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    country: 'AU',
    default_currency: 'aud',
    issues: [],
  });

  const result = inspectStripeAccount({
    details_submitted: false,
    charges_enabled: false,
    payouts_enabled: false,
    country: 'US',
    default_currency: 'usd',
  });
  assert.equal(result.ready, false);
  assert.equal(result.issues.length, 5);
});

test('commerce health requires checkout, refund, and dispute events on the canonical Stripe webhook', () => {
  const url = 'https://xert-fitness.vercel.app/api/stripe-webhook';
  assert.deepEqual(inspectStripeWebhookEndpoints([{
    url, status: 'enabled', enabled_events: [
      'checkout.session.completed', 'checkout.session.async_payment_succeeded',
      'checkout.session.expired', 'checkout.session.async_payment_failed', 'charge.refunded',
      'charge.dispute.created', 'charge.dispute.closed',
    ],
  }], 'https://xert-fitness.vercel.app'), { ready: true, missing_events: [], issue: null });

  const incomplete = inspectStripeWebhookEndpoints([{
    url, status: 'enabled', enabled_events: ['checkout.session.completed'],
  }], 'https://xert-fitness.vercel.app');
  assert.equal(incomplete.ready, false);
  assert.deepEqual(incomplete.missing_events, [
    'checkout.session.async_payment_succeeded', 'checkout.session.expired',
    'checkout.session.async_payment_failed', 'charge.refunded',
    'charge.dispute.created', 'charge.dispute.closed',
  ]);
  assert.match(incomplete.issue, /charge\.refunded/);

  assert.equal(inspectStripeWebhookEndpoints([], 'https://xert-fitness.vercel.app').ready, false);
  assert.equal(inspectStripeWebhookEndpoints([{ url, status: 'disabled', enabled_events: ['*'] }], 'https://xert-fitness.vercel.app').ready, false);
});

test('admin operations health calls the authenticated commerce endpoint', async () => {
  const source = await readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  assert.match(source, /fetch\('\/api\/admin-commerce-health'/);
  assert.match(source, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(source, /healthCheck\('commerce-config', 'Stripe checkout'/);
  assert.match(source, /Missing server settings:/);
  assert.match(source, /Set the missing values in Vercel/);
  assert.match(source, /payments \$\{paymentState\}/);
  assert.match(source, /immutable activation receipt verified/);
  assert.match(source, /action: 'resolve_stripe_review'/);
  assert.match(source, /confirmation: 'MARK HANDLED'/);
});

test('commerce health responses are explicitly private and non-cacheable', async () => {
  const source = await readFile(new URL('../api/admin-commerce-health.js', import.meta.url), 'utf8');
  const httpSource = await readFile(new URL('../api/http.js', import.meta.url), 'utf8');
  assert.match(httpSource, /'Cache-Control', 'private, no-store, max-age=0'/);
  assert.match(source, /profile\?\.role !== 'admin'/);
  assert.match(source, /environmentIssues\(environment\)/);
  assert.match(source, /request\.method === 'POST'/);
  assert.match(source, /if \(!health\.ready\)[\s\S]*Payments remain paused/);
  assert.match(source, /activateSessionPackPayments\(serverClient, user\.id, activation\)/);
  assert.match(source, /if \(reviewResolution\)[\s\S]*resolveStripeOperatorReview\(admin, reviewResolution\)[\s\S]*actorId: user\.id/);
  assert.match(source, /\.eq\('status', 'failed'\)[\s\S]*\.eq\('last_error_code', review\.errorCode\)/);
  // Delivery health surfaces unresolved rows regardless of age and
  // error code. The previous .in('last_error_code', STRIPE_OPERATOR_REVIEW_CODES)
  // rescue query only rescued operator-review incidents, so an aged generic
  // fulfilment failure jammed checkout while showing an empty incident list.
  assert.match(source, /\.eq\('status', 'failed'\)[\s\S]*?\.limit\(200\)/);
  assert.match(source, /\.eq\('status', 'processing'\)[\s\S]*?\.limit\(200\)/);
  assert.doesNotMatch(source, /\.in\('last_error_code', STRIPE_OPERATOR_REVIEW_CODES\)/);
  assert.match(source, /createClient\(SUPABASE_URL, SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /global: \{ headers: \{ Authorization: `Bearer \$\{token\}` \} \}/);
  assert.doesNotMatch(source, /environment:\s*process\.env/);
});

test('commerce health fails closed before authentication when runtime identity is invalid', async () => {
  const response = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await adminCommerceHealthHandler({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error, 'Commerce health service is unavailable.');
  assert.equal(response.body.request_id, response.headers['x-request-id']);
});
