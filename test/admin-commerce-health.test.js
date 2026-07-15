import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import adminCommerceHealthHandler, {
  inspectCommerceEnvironment,
  inspectCommerceProducts,
  inspectStripeAccount,
  inspectStripeWebhookEndpoints,
} from '../api/admin-commerce-health.js';

const validProduct = {
  slug: 'starter-4',
  price_cents: 4800,
  currency: 'aud',
  sessions_count: 4,
  validity_days: 28,
  stripe_price_id: 'price_STARTER4',
};

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
    { slug: 'bad-stripe', reason: 'Stripe amount, currency, type, or active state does not match.' },
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
    { slug: 'linked', reason: 'Stripe amount, currency, type, or active state does not match.' },
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
