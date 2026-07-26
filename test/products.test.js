import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPackPrice, formatPackValidity, normalizeProductAdminInput, normalizeProductCreateInput, packCta, productStripeReadiness } from '../src/lib/products.js';

test('formats the administrator-managed product values for Australian members', () => {
  assert.equal(formatPackPrice(4800, 'aud'), '$48.00');
  assert.equal(formatPackValidity(28), 'Use within 4 weeks');
  assert.equal(formatPackValidity(10), 'Use within 10 days');
});

test('uses a clear fallback CTA for a product added after launch', () => {
  assert.equal(packCta('starter-4'), 'Start Your Training Block');
  assert.equal(packCta('seasonal-special'), 'View Pack');
});

test('normalizes the product editor payload without leaking database fields', () => {
  assert.deepEqual(normalizeProductAdminInput({
    id: 'database-id',
    slug: 'starter-4',
    name: ' Starter Pack ',
    description: ' Four coached sessions. ',
    price_dollars: '48.00',
    sessions_count: '4',
    validity_days: '28',
    currency: ' AUD ',
    sort_order: '2',
    featured: 1,
    active: true,
    stripe_price_id: ' price_ABC123 ',
  }), {
    name: 'Starter Pack',
    description: 'Four coached sessions.',
    price_cents: 4800,
    sessions_count: 4,
    validity_days: 28,
    currency: 'aud',
    sort_order: 2,
    featured: true,
    active: true,
    stripe_price_id: 'price_ABC123',
  });
});

test('normalizes a safe new product slug and complete checkout configuration', () => {
  const product = normalizeProductCreateInput({
    slug: ' Seasonal-8 ', name: 'Seasonal Pack', description: '', price_dollars: '88',
    sessions_count: 8, validity_days: 56, currency: 'aud', sort_order: 4,
    featured: false, active: false, stripe_price_id: '',
  });

  assert.equal(product.slug, 'seasonal-8');
  assert.equal(product.price_cents, 8800);
  assert.equal(product.currency, 'aud');
  assert.equal(product.active, false);
  assert.throws(() => normalizeProductCreateInput({ ...product, slug: '../unsafe', price_dollars: '88' }), /Slug/);
});

test('rejects ambiguous prices and malformed Stripe price IDs', () => {
  const valid = {
    name: 'Starter Pack', price_dollars: '48.00', sessions_count: 4,
    validity_days: 28, featured: false, active: true, stripe_price_id: '',
    currency: 'aud', sort_order: 0,
  };
  assert.throws(() => normalizeProductAdminInput({ ...valid, price_dollars: '48.009' }), /2 decimal places/);
  assert.throws(() => normalizeProductAdminInput({ ...valid, stripe_price_id: 'prod_ABC123' }), /price_/);
  assert.throws(() => normalizeProductAdminInput({ ...valid, currency: 'dollars' }), /3-letter|AUD/i);
  assert.throws(() => normalizeProductAdminInput({ ...valid, currency: 'nzd' }), /AUD/i);
  assert.throws(() => normalizeProductAdminInput({ ...valid, sort_order: -1 }), /Display order/);
});

test('reports the exact active packs blocking live Stripe checkout', () => {
  assert.deepEqual(productStripeReadiness([
    { slug: 'single', active: true, stripe_price_id: null },
    { slug: 'starter-4', active: true, stripe_price_id: ' price_STARTER4 ' },
    { slug: 'retired', active: false, stripe_price_id: null },
    { slug: 'invalid', active: true, stripe_price_id: 'prod_INVALID' },
  ]), {
    activeCount: 3,
    linkedCount: 1,
    missingCount: 2,
    missingSlugs: ['single', 'invalid'],
    readyForLive: false,
  });

  assert.equal(productStripeReadiness([{ slug: 'single', active: true, stripe_price_id: 'price_LIVE1' }]).readyForLive, true);
  assert.equal(productStripeReadiness([]).readyForLive, false);
});
