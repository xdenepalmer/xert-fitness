import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPackPrice, formatPackValidity, normalizeProductAdminInput, packCta } from '../src/lib/products.js';

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
    featured: 1,
    active: true,
    stripe_price_id: ' price_ABC123 ',
  }), {
    name: 'Starter Pack',
    description: 'Four coached sessions.',
    price_cents: 4800,
    sessions_count: 4,
    validity_days: 28,
    featured: true,
    active: true,
    stripe_price_id: 'price_ABC123',
  });
});

test('rejects ambiguous prices and malformed Stripe price IDs', () => {
  const valid = {
    name: 'Starter Pack', price_dollars: '48.00', sessions_count: 4,
    validity_days: 28, featured: false, active: true, stripe_price_id: '',
  };
  assert.throws(() => normalizeProductAdminInput({ ...valid, price_dollars: '48.009' }), /2 decimal places/);
  assert.throws(() => normalizeProductAdminInput({ ...valid, stripe_price_id: 'prod_ABC123' }), /price_/);
});
