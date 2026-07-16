import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertCheckoutProduct,
  stripePendingOrderGuardIsReady,
  stripeOrderTermsSnapshotIsReady,
  stripeWebhookLedgerIsReady,
  assertStripePriceMatchesProduct,
  checkoutIdempotencyKey,
  inspectCheckoutEnvironment,
  normalizeCheckoutAttemptID,
  normalizeCheckoutRequest,
  pendingOrderForCheckout,
  paymentFulfillmentIsReady,
  publicCheckoutFailure,
  reusableCheckoutURL,
  sessionPackPaymentsAreEnabled,
  stripeModeForSecret,
} from '../api/checkout.js';

const checkoutAttemptID = '7b464e63-6e3f-4f7d-94be-d8ef4231d589';

const validProduct = {
  price_cents: 4800,
  currency: 'aud',
  sessions_count: 4,
  validity_days: 28,
};

const productWithStripePrice = {
  ...validProduct,
  id: '00000000-0000-4000-8000-000000000004',
  slug: 'starter-4',
  stripe_price_id: 'price_XERT4800',
};

const matchingStripePrice = {
  id: 'price_XERT4800',
  active: true,
  type: 'one_time',
  unit_amount: 4800,
  currency: 'aud',
  metadata: {
    xert_product_id: productWithStripePrice.id,
    xert_catalog_slug: productWithStripePrice.slug,
    xert_sessions: String(productWithStripePrice.sessions_count),
    xert_validity_days: String(productWithStripePrice.validity_days),
  },
};

test('checkout fails closed until atomic payment fulfillment is installed', async () => {
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() {
      return { data: { capability: 'stripe_payment_fulfillment' }, error: null };
    },
  };
  assert.equal(await paymentFulfillmentIsReady({ from() { return query; } }), true);

  query.maybeSingle = async () => ({ data: null, error: null });
  assert.equal(await paymentFulfillmentIsReady({ from() { return query; } }), false);
  query.maybeSingle = async () => ({ data: null, error: new Error('schema unavailable') });
  assert.equal(await paymentFulfillmentIsReady({ from() { return query; } }), false);

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  const authenticationGate = source.indexOf("if (!token) return json({ error: 'Not authenticated.' }, 401)");
  const gate = source.indexOf('paymentFulfillmentIsReady(admin)');
  const stripeConfigurationGate = source.indexOf('if (!process.env.STRIPE_SECRET_KEY)');
  const sessionCreation = source.indexOf('stripe.checkout.sessions.create');
  assert.ok(authenticationGate >= 0 && stripeConfigurationGate > authenticationGate);
  assert.ok(gate >= 0 && stripeConfigurationGate > gate);
  assert.ok(gate >= 0 && sessionCreation > gate);
  assert.match(source, /payment services are being upgraded[\s\S]*503/);
});

test('checkout fails closed until Stripe fulfillment requires its pending order', async () => {
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() {
      return { data: { capability: 'stripe_pending_order_guard' }, error: null };
    },
  };
  assert.equal(await stripePendingOrderGuardIsReady({ from() { return query; } }), true);
  query.maybeSingle = async () => ({ data: null, error: null });
  assert.equal(await stripePendingOrderGuardIsReady({ from() { return query; } }), false);

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  const guard = source.indexOf('stripePendingOrderGuardIsReady(admin)');
  const paymentSwitch = source.indexOf('sessionPackPaymentsAreEnabled(admin)');
  const sessionCreation = source.indexOf('stripe.checkout.sessions.create');
  assert.ok(guard >= 0 && paymentSwitch > guard && sessionCreation > paymentSwitch);
  assert.match(source, /payment order safeguards are being upgraded[\s\S]*503/);
});

test('checkout fails closed until purchased credit terms are snapshotted', async () => {
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() {
      return { data: { capability: 'stripe_order_terms_snapshot' }, error: null };
    },
  };
  assert.equal(await stripeOrderTermsSnapshotIsReady({ from() { return query; } }), true);
  query.maybeSingle = async () => ({ data: null, error: null });
  assert.equal(await stripeOrderTermsSnapshotIsReady({ from() { return query; } }), false);

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  const guard = source.indexOf('stripeOrderTermsSnapshotIsReady(admin)');
  const paymentSwitch = source.indexOf('sessionPackPaymentsAreEnabled(admin)');
  const sessionCreation = source.indexOf('stripe.checkout.sessions.create');
  assert.ok(guard >= 0 && paymentSwitch > guard && sessionCreation > paymentSwitch);
  assert.match(source, /purchased pack terms are being secured[\s\S]*503/);
});

test('checkout fails closed until Stripe delivery monitoring is installed', async () => {
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() {
      return { data: { capability: 'stripe_webhook_ledger' }, error: null };
    },
  };
  assert.equal(await stripeWebhookLedgerIsReady({ from() { return query; } }), true);
  query.maybeSingle = async () => ({ data: null, error: null });
  assert.equal(await stripeWebhookLedgerIsReady({ from() { return query; } }), false);

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  const guard = source.indexOf('stripeWebhookLedgerIsReady(admin)');
  const paymentSwitch = source.indexOf('sessionPackPaymentsAreEnabled(admin)');
  const sessionCreation = source.indexOf('stripe.checkout.sessions.create');
  assert.ok(guard >= 0 && paymentSwitch > guard && sessionCreation > paymentSwitch);
  assert.match(source, /payment delivery monitoring is being installed[\s\S]*503/);
});

test('checkout has a fail-closed owner payment switch before any Stripe operation', async () => {
  let result = { data: [{ payments_enabled: true }], error: null };
  const query = {
    select() { return query; },
    async limit() { return result; },
  };
  assert.equal(await sessionPackPaymentsAreEnabled({ from() { return query; } }), true);

  result = { data: [{ payments_enabled: false }], error: null };
  assert.equal(await sessionPackPaymentsAreEnabled({ from() { return query; } }), false);
  result = { data: [], error: null };
  assert.equal(await sessionPackPaymentsAreEnabled({ from() { return query; } }), false);
  result = { data: [{ payments_enabled: true }, { payments_enabled: true }], error: null };
  assert.equal(await sessionPackPaymentsAreEnabled({ from() { return query; } }), false);
  result = { data: null, error: new Error('settings unavailable') };
  assert.equal(await sessionPackPaymentsAreEnabled({ from() { return query; } }), false);

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  const authenticationGate = source.indexOf("if (!token) return json({ error: 'Not authenticated.' }, 401)");
  const paymentGate = source.indexOf('if (!await sessionPackPaymentsAreEnabled(admin))');
  const stripeConfigurationGate = source.indexOf('if (!process.env.STRIPE_SECRET_KEY)');
  const sessionCreation = source.indexOf('stripe.checkout.sessions.create');
  assert.ok(paymentGate > authenticationGate);
  assert.ok(stripeConfigurationGate > paymentGate);
  assert.ok(sessionCreation > paymentGate);
  assert.match(source, /Session pack purchases are temporarily unavailable[\s\S]*503/);
});

test('checkout exposes a value-free gate for the complete canonical payment environment', () => {
  const validEnvironment = {
    SUPABASE_URL: 'https://ugmkwoapjcpiucsrxwzt.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-value',
    STRIPE_SECRET_KEY: 'sk_test_stripe-secret-value',
    STRIPE_WEBHOOK_SECRET: 'whsec_webhook_value',
    APP_BASE_URL: 'https://xert-fitness.vercel.app',
  };
  assert.deepEqual(inspectCheckoutEnvironment(validEnvironment), { ready: true, invalid: [] });

  for (const [name, value] of [
    ['SUPABASE_URL', 'https://another-project.supabase.co'],
    ['SUPABASE_SERVICE_ROLE_KEY', ''],
    ['STRIPE_SECRET_KEY', 'secret-value'],
    ['STRIPE_WEBHOOK_SECRET', 'webhook-value'],
    ['APP_BASE_URL', 'https://preview-xert.vercel.app'],
  ]) {
    const result = inspectCheckoutEnvironment({ ...validEnvironment, [name]: value });
    assert.equal(result.ready, false);
    assert.ok(result.invalid.includes(name));
    assert.doesNotMatch(JSON.stringify(result), /service-role-value|stripe-secret-value|webhook_value/);
  }

  for (const environment of [
    { ...validEnvironment, SUPABASE_SERVICE_ROLE_KEY: ` ${validEnvironment.SUPABASE_SERVICE_ROLE_KEY}` },
    { ...validEnvironment, STRIPE_SECRET_KEY: `${validEnvironment.STRIPE_SECRET_KEY}\n` },
    { ...validEnvironment, STRIPE_WEBHOOK_SECRET: `${validEnvironment.STRIPE_WEBHOOK_SECRET} ` },
    {
      ...validEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: 'public-key-reused-by-mistake',
      SUPABASE_ANON_KEY: 'public-key-reused-by-mistake',
    },
  ]) {
    assert.equal(inspectCheckoutEnvironment(environment).ready, false);
  }
});

test('accepts a valid product before creating Stripe Checkout', () => {
  assert.doesNotThrow(() => assertCheckoutProduct(validProduct));
});

test('scopes Stripe idempotency to one member pack target and checkout attempt', () => {
  const base = {
    attemptID: checkoutAttemptID,
    userID: 'member-xert',
    productID: 'product-xert',
    returnTarget: 'web',
  };
  assert.equal(normalizeCheckoutAttemptID(checkoutAttemptID.toUpperCase()), checkoutAttemptID);
  assert.equal(checkoutIdempotencyKey(base), checkoutIdempotencyKey(base));
  assert.notEqual(checkoutIdempotencyKey(base), checkoutIdempotencyKey({ ...base, userID: 'another-member' }));
  assert.notEqual(checkoutIdempotencyKey(base), checkoutIdempotencyKey({ ...base, productID: 'another-product' }));
  assert.notEqual(checkoutIdempotencyKey(base), checkoutIdempotencyKey({ ...base, returnTarget: 'ios' }));
  assert.throws(() => normalizeCheckoutAttemptID('shared-or-guessable'), /identifier is invalid/i);
});

test('normalizes a bounded checkout request before any database or Stripe operation', () => {
  assert.deepEqual(normalizeCheckoutRequest({
    product_slug: ' Starter-4 ',
    return_target: 'ios',
    checkout_attempt_id: checkoutAttemptID,
    ignored_amount: 1,
  }), {
    productSlug: 'starter-4',
    returnTarget: 'ios',
    suppliedAttemptID: checkoutAttemptID,
  });
  assert.deepEqual(normalizeCheckoutRequest({ product_slug: 'single' }), {
    productSlug: 'single',
    returnTarget: 'web',
    suppliedAttemptID: undefined,
  });
  for (const input of [
    null,
    [],
    {},
    { product_slug: '../admin' },
    { product_slug: 'a'.repeat(81) },
    { product_slug: 'single', return_target: 'external' },
  ]) assert.throws(() => normalizeCheckoutRequest(input), /request|product identifier|return target/i);
});

test('checkout never exposes raw provider errors to members', async () => {
  const secretBearingError = Object.assign(new Error('Stripe sk_live_private failed at Supabase'), {
    code: 'api_connection_error',
    requestId: 'req_xert',
  });
  assert.deepEqual(publicCheckoutFailure(secretBearingError), {
    status: 500,
    message: 'Checkout could not be started. Please try again.',
  });
  assert.doesNotMatch(JSON.stringify(publicCheckoutFailure(secretBearingError)), /sk_live|Supabase|req_xert/);
  assert.deepEqual(publicCheckoutFailure({ code: 'CHECKOUT_RECORDING_FAILED' }), {
    status: 503,
    message: 'Checkout could not be recorded. No payment was taken; please try again.',
  });

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /json\(\{ error: e\.message/);
  assert.match(source, /return json\(\{ error: failure\.message \}, failure\.status\)/);
});

test('accepts only an active one-time Stripe price matching the configured pack', () => {
  assert.doesNotThrow(() => assertStripePriceMatchesProduct(productWithStripePrice, matchingStripePrice));

  for (const stripePrice of [
    { ...matchingStripePrice, id: 'price_OTHER' },
    { ...matchingStripePrice, active: false },
    { ...matchingStripePrice, type: 'recurring' },
    { ...matchingStripePrice, unit_amount: 1200 },
    { ...matchingStripePrice, currency: 'usd' },
    { ...matchingStripePrice, metadata: { ...matchingStripePrice.metadata, xert_product_id: 'another-product' } },
    { ...matchingStripePrice, metadata: { ...matchingStripePrice.metadata, xert_catalog_slug: 'another-pack' } },
    { ...matchingStripePrice, metadata: { ...matchingStripePrice.metadata, xert_sessions: '99' } },
    { ...matchingStripePrice, metadata: { ...matchingStripePrice.metadata, xert_validity_days: '365' } },
    { id: matchingStripePrice.id, deleted: true },
  ]) {
    assert.throws(
      () => assertStripePriceMatchesProduct(productWithStripePrice, stripePrice),
      /does not match the product configuration/i
    );
  }
});

test('keeps test and live Stripe objects in the same payment environment', () => {
  assert.equal(stripeModeForSecret('sk_test_example'), 'test');
  assert.equal(stripeModeForSecret('rk_live_example'), 'live');
  assert.equal(stripeModeForSecret('secret-value'), 'unknown');
  assert.doesNotThrow(() => assertStripePriceMatchesProduct(
    productWithStripePrice,
    { ...matchingStripePrice, livemode: true },
    true,
  ));
  assert.throws(() => assertStripePriceMatchesProduct(
    productWithStripePrice,
    { ...matchingStripePrice, livemode: false },
    true,
  ), /does not match/i);
});

test('reuses only the current same-platform pack snapshot from an open unpaid Checkout session', () => {
  const user = { id: 'member-xert' };
  const product = { id: 'product-xert', ...validProduct };
  const checkout = {
    status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/c/pay/cs_test_xert',
    amount_total: 4800, currency: 'aud', livemode: false,
    metadata: {
      user_id: user.id,
      product_id: product.id,
      product_slug: product.slug,
      sessions_count: String(product.sessions_count),
      validity_days: String(product.validity_days),
      return_target: 'ios',
    },
  };
  const options = { returnTarget: 'ios', stripeMode: 'test' };
  assert.equal(reusableCheckoutURL(checkout, user, product, options), checkout.url);
  for (const invalid of [
    { ...checkout, status: 'complete' },
    { ...checkout, payment_status: 'paid' },
    { ...checkout, livemode: true },
    { ...checkout, amount_total: 4900 },
    { ...checkout, url: 'javascript:alert(1)' },
    { ...checkout, metadata: { ...checkout.metadata, user_id: 'another-member' } },
    { ...checkout, metadata: { ...checkout.metadata, product_id: 'another-product' } },
    { ...checkout, metadata: { ...checkout.metadata, product_slug: 'another-pack' } },
    { ...checkout, metadata: { ...checkout.metadata, sessions_count: '99' } },
    { ...checkout, metadata: { ...checkout.metadata, validity_days: '365' } },
    { ...checkout, metadata: { ...checkout.metadata, return_target: 'web' } },
  ]) assert.equal(reusableCheckoutURL(invalid, user, product, options), null);
});

test('rejects invalid pricing, credits, expiry, and currency before Checkout', () => {
  for (const product of [
    { ...validProduct, price_cents: 0 },
    { ...validProduct, sessions_count: 0 },
    { ...validProduct, validity_days: 0 },
    { ...validProduct, currency: 'australian-dollars' },
  ]) {
    assert.throws(() => assertCheckoutProduct(product), /configuration is invalid/i);
  }
});

test('records a member-bound pending order before handing off to Stripe', async () => {
  const order = pendingOrderForCheckout(
    { id: 'cs_xert', amount_total: 4800, currency: 'aud', payment_intent: null },
    { id: 'member-xert', email: 'member@example.com' },
    { id: 'product-xert', ...validProduct },
  );
  assert.deepEqual(order, {
    user_id: 'member-xert',
    product_id: 'product-xert',
    email: 'member@example.com',
    amount_cents: 4800,
    currency: 'aud',
    status: 'pending',
    credit_total: 4,
    credit_validity_days: 28,
    stripe_checkout_session_id: 'cs_xert',
    stripe_payment_intent_id: null,
  });

  const source = await readFile(new URL('../api/checkout.js', import.meta.url), 'utf8');
  assert.match(source, /from\('orders'\)[\s\S]*upsert\(pendingOrderForCheckout/);
  assert.match(source, /catch \{[\s\S]*checkout\.sessions\.expire\(session\.id\)/);
  assert.match(source, /findReusableCheckout/);
  assert.match(source, /stripeMode === 'live' && !product\.stripe_price_id/);
  assert.match(source, /customer_creation: 'always'/);
  assert.match(source, /payment_intent_data:/);
  assert.match(source, /checkout\.sessions\.create\(checkoutParameters, \{[\s\S]*idempotencyKey:/);
  assert.equal(
    (source.match(/xert_checkout_attempt_id: checkoutAttemptID/g) || []).length,
    2,
    'Checkout Session and PaymentIntent must carry the XERT attempt identity',
  );
  assert.throws(
    () => pendingOrderForCheckout(
      { id: 'cs_xert', amount_total: 4700, currency: 'aud' },
      { id: 'member-xert' },
      { id: 'product-xert', ...validProduct },
    ),
    /does not match the product/i,
  );
});
