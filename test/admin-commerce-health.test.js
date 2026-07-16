import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import adminCommerceHealthHandler, {
  activateSessionPackPayments,
  inspectCommerceEnvironment,
  inspectCommerceHealth,
  inspectCommerceProducts,
  inspectStripeAccount,
  inspectStripeWebhookEndpoints,
  inspectWebhookDeliveryHealth,
  normalizePaymentActivationRequest,
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

function capabilityAdmin(capabilities, webhookRows = []) {
  return {
    from(table) {
      if (table === 'stripe_webhook_events') {
        const query = {
          select() { return query; },
          gte() { return query; },
          order() { return query; },
          async limit() { return { data: webhookRows, error: null }; },
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
  const environment = {
    STRIPE_SECRET_KEY: 'sk_test_secret_value',
    STRIPE_WEBHOOK_SECRET: 'whsec_webhook_value',
    APP_BASE_URL: 'https://xert-fitness.vercel.app',
  };
  const products = [validProduct];
  const complete = await inspectCommerceHealth({
    admin: capabilityAdmin(new Set(['stripe_payment_fulfillment', 'guarded_payment_activation', 'admin_settings_singleton', 'stripe_pending_order_guard', 'stripe_order_terms_snapshot', 'stripe_webhook_ledger'])),
    products,
    environment,
    stripe: readyStripe(),
  });
  assert.equal(complete.ready, true);
  assert.equal(complete.fulfillment_ready, true);
  assert.equal(complete.activation_guard_ready, true);
  assert.equal(complete.settings_contract_ready, true);
  assert.equal(complete.pending_order_guard_ready, true);
  assert.equal(complete.order_terms_ready, true);
  assert.equal(complete.webhook_ledger_ready, true);
  assert.equal(complete.webhook_delivery.ready, true);

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

  const missingPendingOrderGuard = await inspectCommerceHealth({
    admin: capabilityAdmin(new Set(['stripe_payment_fulfillment', 'guarded_payment_activation', 'admin_settings_singleton'])),
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
    admin: capabilityAdmin(new Set(['stripe_payment_fulfillment', 'guarded_payment_activation', 'admin_settings_singleton', 'stripe_pending_order_guard'])),
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
    admin: capabilityAdmin(new Set(['stripe_payment_fulfillment', 'guarded_payment_activation', 'admin_settings_singleton', 'stripe_pending_order_guard', 'stripe_order_terms_snapshot'])),
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
    stale_processing: 0, retries: 1, issue: null,
  });

  const unhealthy = await inspectWebhookDeliveryHealth(capabilityAdmin(new Set(), [
    { status: 'failed', attempts: 3, last_received_at: '2026-07-16T05:59:00.000Z' },
    { status: 'processing', attempts: 1, last_received_at: '2026-07-16T05:30:00.000Z' },
  ]), now);
  assert.equal(unhealthy.ready, false);
  assert.equal(unhealthy.failed, 1);
  assert.equal(unhealthy.stale_processing, 1);
  assert.equal(unhealthy.retries, 2);
  assert.match(unhealthy.issue, /unresolved failure/);
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
    missing: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'APP_BASE_URL'],
  });
  assert.deepEqual(inspectCommerceEnvironment({
    STRIPE_SECRET_KEY: 'sk_test_secret_value',
    STRIPE_WEBHOOK_SECRET: 'whsec_webhook_value',
    APP_BASE_URL: 'http://xert.example.com',
  }), {
    ready: false,
    missing: ['APP_BASE_URL'],
  });
  assert.deepEqual(inspectCommerceEnvironment({
    STRIPE_SECRET_KEY: 'sk_test_secret_value',
    STRIPE_WEBHOOK_SECRET: 'whsec_webhook_value',
    APP_BASE_URL: 'https://xert-fitness.vercel.app',
  }), { ready: true, missing: [] });

  for (const APP_BASE_URL of [
    'https://xert.example.com',
    'https://xert-fitness.vercel.app/checkout-return',
    'https://xert-fitness.vercel.app?preview=true',
  ]) {
    assert.deepEqual(inspectCommerceEnvironment({
      STRIPE_SECRET_KEY: 'sk_test_secret_value',
      STRIPE_WEBHOOK_SECRET: 'whsec_webhook_value',
      APP_BASE_URL,
    }), { ready: false, missing: ['APP_BASE_URL'] });
  }

  assert.deepEqual(inspectCommerceEnvironment({
    STRIPE_SECRET_KEY: 'sk_test_secret_value',
    STRIPE_WEBHOOK_SECRET: 'whsec_webhook_value',
    APP_BASE_URL: 'https://lookalike.example.com',
    EXPECTED_APP_HOST: 'lookalike.example.com',
  }), { ready: false, missing: ['APP_BASE_URL'] });

  assert.deepEqual(inspectCommerceEnvironment({
    STRIPE_SECRET_KEY: 'secret-value',
    STRIPE_WEBHOOK_SECRET: 'webhook-value',
    APP_BASE_URL: 'https://xert-fitness.vercel.app',
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

test('commerce health requires checkout and refund events on the canonical Stripe webhook', () => {
  const url = 'https://xert-fitness.vercel.app/api/stripe-webhook';
  assert.deepEqual(inspectStripeWebhookEndpoints([{
    url, status: 'enabled', enabled_events: [
      'checkout.session.completed', 'checkout.session.async_payment_succeeded',
      'checkout.session.expired', 'checkout.session.async_payment_failed', 'charge.refunded',
    ],
  }], 'https://xert-fitness.vercel.app'), { ready: true, missing_events: [], issue: null });

  const incomplete = inspectStripeWebhookEndpoints([{
    url, status: 'enabled', enabled_events: ['checkout.session.completed'],
  }], 'https://xert-fitness.vercel.app');
  assert.equal(incomplete.ready, false);
  assert.deepEqual(incomplete.missing_events, [
    'checkout.session.async_payment_succeeded', 'checkout.session.expired',
    'checkout.session.async_payment_failed', 'charge.refunded',
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
  assert.match(source, /createClient\(SUPABASE_URL, SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /global: \{ headers: \{ Authorization: `Bearer \$\{token\}` \} \}/);
  assert.doesNotMatch(source, /environment:\s*process\.env/);
});

test('commerce health authenticates before reporting server configuration', async () => {
  const response = {
    statusCode: 200,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await adminCommerceHealthHandler({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Not authenticated.' });
});
