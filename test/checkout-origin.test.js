import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCheckoutOrigin, resolveCheckoutReturnURLs } from '../api/checkout.js';

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

test('uses a public app-return page for native checkout without changing web returns', () => {
  assert.deepEqual(resolveCheckoutReturnURLs('https://xertfitness.app', 'ios'), {
    success: 'https://xertfitness.app/checkout-return?status=success',
    cancel: 'https://xertfitness.app/checkout-return?status=cancelled',
  });
  assert.deepEqual(resolveCheckoutReturnURLs('https://xertfitness.app'), {
    success: 'https://xertfitness.app/account?purchase=success',
    cancel: 'https://xertfitness.app/booking?purchase=cancelled',
  });
  assert.throws(
    () => resolveCheckoutReturnURLs('https://xertfitness.app', 'javascript:alert(1)'),
    /unsupported checkout return target/i
  );
});
