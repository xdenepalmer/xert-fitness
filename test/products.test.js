import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPackPrice, formatPackValidity, packCta } from '../src/lib/products.js';

test('formats the administrator-managed product values for Australian members', () => {
  assert.equal(formatPackPrice(4800, 'aud'), '$48.00');
  assert.equal(formatPackValidity(28), 'Use within 4 weeks');
  assert.equal(formatPackValidity(10), 'Use within 10 days');
});

test('uses a clear fallback CTA for a product added after launch', () => {
  assert.equal(packCta('starter-4'), 'Start Your Training Block');
  assert.equal(packCta('seasonal-special'), 'View Pack');
});
