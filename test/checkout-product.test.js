import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertCheckoutProduct,
  assertStripePriceMatchesProduct,
  pendingOrderForCheckout,
  paymentFulfillmentIsReady,
  reusableCheckoutURL,
  stripeModeForSecret,
} from '../api/checkout.js';

const validProduct = {
  price_cents: 4800,
  currency: 'aud',
  sessions_count: 4,
  validity_days: 28,
};

const productWithStripePrice = {
  ...validProduct,
  stripe_price_id: 'price_XERT4800',
};

const matchingStripePrice = {
  id: 'price_XERT4800',
  active: true,
  type: 'one_time',
  unit_amount: 4800,
  currency: 'aud',
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

test('accepts a valid product before creating Stripe Checkout', () => {
  assert.doesNotThrow(() => assertCheckoutProduct(validProduct));
});

test('accepts only an active one-time Stripe price matching the configured pack', () => {
  assert.doesNotThrow(() => assertStripePriceMatchesProduct(productWithStripePrice, matchingStripePrice));

  for (const stripePrice of [
    { ...matchingStripePrice, id: 'price_OTHER' },
    { ...matchingStripePrice, active: false },
    { ...matchingStripePrice, type: 'recurring' },
    { ...matchingStripePrice, unit_amount: 1200 },
    { ...matchingStripePrice, currency: 'usd' },
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

test('reuses only the same member pack and amount from an open unpaid Checkout session', () => {
  const user = { id: 'member-xert' };
  const product = { id: 'product-xert', ...validProduct };
  const checkout = {
    status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/c/pay/cs_test_xert',
    amount_total: 4800, currency: 'aud',
    metadata: { user_id: user.id, product_id: product.id },
  };
  assert.equal(reusableCheckoutURL(checkout, user, product), checkout.url);
  for (const invalid of [
    { ...checkout, status: 'complete' },
    { ...checkout, payment_status: 'paid' },
    { ...checkout, amount_total: 4900 },
    { ...checkout, url: 'javascript:alert(1)' },
    { ...checkout, metadata: { ...checkout.metadata, user_id: 'another-member' } },
    { ...checkout, metadata: { ...checkout.metadata, product_id: 'another-product' } },
  ]) assert.equal(reusableCheckoutURL(invalid, user, product), null);
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
  assert.throws(
    () => pendingOrderForCheckout(
      { id: 'cs_xert', amount_total: 4700, currency: 'aud' },
      { id: 'member-xert' },
      { id: 'product-xert', ...validProduct },
    ),
    /does not match the product/i,
  );
});
