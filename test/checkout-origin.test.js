import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCheckoutOrigin } from '../api/checkout.js';

test('uses the configured canonical origin for Stripe return URLs', () => {
  assert.equal(
    resolveCheckoutOrigin('https://preview.xertfitness.app/api/checkout', 'https://xertfitness.app/welcome'),
    'https://xertfitness.app'
  );
});

test('falls back to the Vercel request URL without trusting a browser origin header', () => {
  assert.equal(
    resolveCheckoutOrigin('https://xert-fitness.vercel.app/api/checkout'),
    'https://xert-fitness.vercel.app'
  );
});

test('rejects non-web checkout return URLs', () => {
  assert.throws(
    () => resolveCheckoutOrigin('javascript:alert(1)'),
    /HTTP or HTTPS/
  );
});
