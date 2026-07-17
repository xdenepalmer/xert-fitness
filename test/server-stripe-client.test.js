import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Stripe from 'stripe';
import {
  createXertStripeClient,
  XERT_STRIPE_API_VERSION,
  XERT_STRIPE_MAX_NETWORK_RETRIES,
  XERT_STRIPE_TIMEOUT_MS,
  xertStripeClientOptions,
} from '../src/lib/serverStripeClient.js';

test('all server Stripe clients share the lockfile API and bounded network policy', () => {
  assert.equal(XERT_STRIPE_API_VERSION, Stripe.API_VERSION);
  assert.equal(XERT_STRIPE_MAX_NETWORK_RETRIES, 2);
  assert.equal(XERT_STRIPE_TIMEOUT_MS, 20_000);

  const options = xertStripeClientOptions();
  assert.deepEqual(options, {
    apiVersion: Stripe.API_VERSION,
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: {
      name: 'XERT Fitness',
      url: 'https://xert-fitness.vercel.app',
    },
  });

  options.appInfo.name = 'mutated';
  assert.equal(xertStripeClientOptions().appInfo.name, 'XERT Fitness');

  let constructorArguments;
  class StripeProbe {
    constructor(secretKey, clientOptions) {
      constructorArguments = { secretKey, clientOptions };
    }
  }
  createXertStripeClient('sk_test_redacted', StripeProbe);
  assert.equal(constructorArguments.secretKey, 'sk_test_redacted');
  assert.deepEqual(constructorArguments.clientOptions, xertStripeClientOptions());
});

test('money movement and launch tooling cannot drift to ad hoc Stripe clients', async () => {
  const paths = [
    '../api/checkout.js',
    '../api/stripe-webhook.js',
    '../api/admin-refund-order.js',
    '../api/admin-reconcile-order.js',
    '../api/admin-commerce-health.js',
    '../scripts/link-stripe-catalog.mjs',
    '../scripts/stripe-launch-preflight.mjs',
  ];

  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /import \{ createXertStripeClient \} from '\.\.\/src\/lib\/serverStripeClient\.js';/);
    assert.match(source, /createXertStripeClient\(/);
    assert.doesNotMatch(source, /import Stripe from 'stripe'/);
    assert.doesNotMatch(source, /new Stripe\(/);
  }
});
