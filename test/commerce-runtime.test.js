import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  inspectCommerceRuntimeEnvironment,
  stripeModeForSecret,
} from '../src/lib/commerceRuntime.js';

const validEnvironment = {
  SUPABASE_URL: 'https://ugmkwoapjcpiucsrxwzt.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-value',
  STRIPE_SECRET_KEY: 'sk_test_stripe-secret-value',
  STRIPE_WEBHOOK_SECRET: 'whsec_webhook_value',
  APP_BASE_URL: 'https://xert-fitness.vercel.app',
};

test('commerce runtime accepts canonical XERT payment infrastructure', () => {
  assert.deepEqual(inspectCommerceRuntimeEnvironment(validEnvironment), {
    ready: true,
    invalid: [],
  });
  assert.equal(stripeModeForSecret('sk_test_value'), 'test');
  assert.equal(stripeModeForSecret('rk_live_value'), 'live');
  assert.equal(stripeModeForSecret('pk_live_value'), 'unknown');
});

test('commerce runtime rejects wrong projects, public keys, whitespace, and unknown Stripe keys', () => {
  for (const [name, environment] of [
    ['SUPABASE_URL', { ...validEnvironment, SUPABASE_URL: 'https://another-project.supabase.co' }],
    ['SUPABASE_SERVICE_ROLE_KEY', { ...validEnvironment, SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_public' }],
    ['SUPABASE_SERVICE_ROLE_KEY', {
      ...validEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: 'same-public-key',
      VITE_SUPABASE_ANON_KEY: 'same-public-key',
    }],
    ['SUPABASE_SERVICE_ROLE_KEY', { ...validEnvironment, SUPABASE_SERVICE_ROLE_KEY: ' service-role-value' }],
    ['STRIPE_SECRET_KEY', { ...validEnvironment, STRIPE_SECRET_KEY: 'pk_test_public' }],
    ['STRIPE_SECRET_KEY', { ...validEnvironment, STRIPE_SECRET_KEY: 'sk_test_value\n' }],
  ]) {
    const result = inspectCommerceRuntimeEnvironment(environment);
    assert.equal(result.ready, false);
    assert.ok(result.invalid.includes(name));
    assert.doesNotMatch(JSON.stringify(result), /service-role-value|stripe-secret-value/);
  }
});

test('commerce runtime applies webhook and public URL requirements only when requested', () => {
  const emergencyOperations = {
    ...validEnvironment,
    STRIPE_WEBHOOK_SECRET: '',
    APP_BASE_URL: '',
  };
  assert.equal(inspectCommerceRuntimeEnvironment(emergencyOperations).ready, true);
  assert.deepEqual(
    inspectCommerceRuntimeEnvironment(emergencyOperations, {
      requireWebhookSecret: true,
      requireAppBaseURL: true,
    }).invalid,
    ['STRIPE_WEBHOOK_SECRET', 'APP_BASE_URL'],
  );
  assert.equal(inspectCommerceRuntimeEnvironment({
    SUPABASE_URL: validEnvironment.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: validEnvironment.SUPABASE_SERVICE_ROLE_KEY,
  }, { requireStripeSecret: false }).ready, true);
});

test('money-moving handlers enforce runtime identity before clients or authentication', async () => {
  for (const [path, guard] of [
    ['../api/checkout.js', 'inspectCheckoutEnvironment(process.env)'],
    ['../api/stripe-webhook.js', 'inspectCommerceRuntimeEnvironment(process.env'],
    ['../api/admin-refund-order.js', 'inspectCommerceRuntimeEnvironment(process.env)'],
    ['../api/admin-reconcile-order.js', 'inspectCommerceRuntimeEnvironment(process.env)'],
    ['../api/admin-commerce-health.js', 'inspectCommerceRuntimeEnvironment(process.env'],
  ]) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    const handler = source.slice(source.indexOf('export default async function handler'));
    const guardIndex = handler.indexOf(guard);
    const clientIndexes = [
      handler.indexOf('createClient('),
      handler.indexOf('new Stripe('),
      handler.indexOf("requestHeader(request, 'authorization')"),
    ].filter(index => index >= 0);
    assert.ok(guardIndex >= 0, `${path} has no commerce runtime guard`);
    assert.ok(clientIndexes.every(index => guardIndex < index), `${path} initializes a client before its guard`);
  }
});
