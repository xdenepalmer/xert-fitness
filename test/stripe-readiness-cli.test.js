import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inspectStripeReadiness } from '../scripts/check-stripe-readiness.mjs';

const environment = {
  VERCEL_BASE_URL: 'https://xert-fitness.vercel.app',
  SUPABASE_URL: 'https://ugmkwoapjcpiucsrxwzt.supabase.co',
  SUPABASE_ANON_KEY: `sb_publishable_${'a'.repeat(24)}`,
};

function response(status, body = '') {
  const responseBody = [204, 205, 304].includes(status)
    ? null
    : typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(responseBody, { status });
}

function readinessFetch({ commerceStatus = 204, webhookStatus = 400, capabilities = [
  { capability: 'stripe_refund_reconciliation' },
  { capability: 'checkout_reconciliation' },
  { capability: 'stripe_payment_fulfillment' },
  { capability: 'guarded_payment_activation' },
  { capability: 'payment_activation_drift_guard' },
  { capability: 'admin_settings_singleton' },
  { capability: 'stripe_pending_order_guard' },
  { capability: 'stripe_order_terms_snapshot' },
  { capability: 'stripe_webhook_ledger' },
] } = {}) {
  return async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path === '/api/checkout' && options.method === 'HEAD') return response(commerceStatus);
    if (path === '/api/checkout') return response(401, { error: 'Not authenticated.' });
    if (path === '/api/admin-refund-order') return response(401, { error: 'Not authenticated.' });
    if (path === '/api/admin-reconcile-order') return response(401, { error: 'Not authenticated.' });
    if (path === '/api/stripe-webhook') return response(webhookStatus, webhookStatus === 400 ? 'Invalid signature' : 'Stripe is not configured.');
    if (path.endsWith('/xert_public_capabilities')) return response(200, capabilities);
    throw new Error(`Unexpected readiness URL: ${url}`);
  };
}

test('Stripe readiness requires every safe production boundary and database activation guard', async () => {
  const report = await inspectStripeReadiness({ environment, fetchImpl: readinessFetch() });
  assert.equal(report.ready, true);
  assert.equal(report.checks.length, 14);
  assert.ok(report.checks.every(check => check.ready));
});

test('Stripe readiness cannot pass when the private commerce environment is incomplete', async () => {
  const report = await inspectStripeReadiness({
    environment,
    fetchImpl: readinessFetch({ commerceStatus: 503 }),
  });
  const environmentCheck = report.checks.find(check => check.key === 'environment');
  assert.equal(report.ready, false);
  assert.equal(environmentCheck.ready, false);
  assert.match(environmentCheck.remediation, /APP_BASE_URL/);
  assert.doesNotMatch(JSON.stringify(report), /service-role-value|stripe-secret-value/);
});

test('Stripe readiness names missing webhook configuration and fulfillment without exposing keys', async () => {
  const report = await inspectStripeReadiness({
    environment,
    fetchImpl: readinessFetch({ webhookStatus: 503, capabilities: [] }),
  });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find(check => check.key === 'webhook').ready, false);
  assert.match(report.checks.find(check => check.key === 'fulfillment').detail, /is missing/);
  assert.match(report.checks.find(check => check.key === 'webhook').remediation, /STRIPE_WEBHOOK_SECRET/);
  assert.match(report.checks.find(check => check.key === 'fulfillment').remediation, /20260715010000_stripe_payment_fulfillment\.sql/);
  assert.match(report.checks.find(check => check.key === 'refund-reconciliation-contract').remediation, /20260713020000_stripe_refund_reconciliation\.sql/);
  assert.match(report.checks.find(check => check.key === 'checkout-reconciliation-contract').remediation, /20260713030000_checkout_reconciliation\.sql/);
  assert.match(report.checks.find(check => check.key === 'activation-guard').remediation, /20260716010000_guarded_payment_activation\.sql/);
  assert.match(report.checks.find(check => check.key === 'activation-drift-guard').remediation, /20260716060000_payment_activation_drift_guard\.sql/);
  assert.match(report.checks.find(check => check.key === 'settings-contract').remediation, /20260716020000_admin_settings_singleton\.sql/);
  assert.match(report.checks.find(check => check.key === 'pending-order-guard').remediation, /20260716030000_stripe_pending_order_guard\.sql/);
  assert.match(report.checks.find(check => check.key === 'order-terms').remediation, /20260716040000_stripe_order_terms_snapshot\.sql/);
  assert.match(report.checks.find(check => check.key === 'webhook-ledger').remediation, /20260716050000_stripe_webhook_ledger\.sql/);
  assert.doesNotMatch(JSON.stringify(report), /sb_publishable_/);
});

test('Stripe readiness rejects unsafe endpoints and malformed keys before network access', async () => {
  await assert.rejects(
    inspectStripeReadiness({ environment: { ...environment, VERCEL_BASE_URL: 'https://attacker.example' }, fetchImpl: readinessFetch() }),
    /canonical XERT service origin/,
  );
  await assert.rejects(
    inspectStripeReadiness({ environment: { ...environment, SUPABASE_ANON_KEY: 'bad key' }, fetchImpl: readinessFetch() }),
    /uninterrupted public key|publishable key/,
  );
  await assert.rejects(
    inspectStripeReadiness({
      environment: { ...environment, SUPABASE_ANON_KEY: `sb_secret_${'s'.repeat(24)}` },
      fetchImpl: readinessFetch(),
    }),
    /must never be embedded/,
  );
});

test('Codemagic requires the same body-free commerce environment gate before TestFlight', async () => {
  const yaml = await readFile(new URL('../codemagic.yaml', import.meta.url), 'utf8');
  assert.match(yaml, /--request HEAD "\$VERCEL_BASE_URL\/api\/checkout"/);
  assert.match(yaml, /COMMERCE_CODE" != "204"/);
  assert.match(yaml, /APP_BASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, and STRIPE_WEBHOOK_SECRET/);
});
