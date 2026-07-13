import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCheckoutProduct, assertStripePriceMatchesProduct } from '../api/checkout.js';

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
