import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectStripeReadiness } from '../scripts/check-stripe-readiness.mjs';

const environment = {
  VERCEL_BASE_URL: 'https://xert-fitness.vercel.app',
  SUPABASE_URL: 'https://ugmkwoapjcpiucsrxwzt.supabase.co',
  SUPABASE_ANON_KEY: `sb_publishable_${'a'.repeat(24)}`,
};

function response(status, body = '') {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

function readinessFetch({ webhookStatus = 400, capabilities = [{ capability: 'stripe_payment_fulfillment' }] } = {}) {
  return async url => {
    const path = new URL(url).pathname;
    if (path === '/api/checkout') return response(401, { error: 'Not authenticated.' });
    if (path === '/api/admin-refund-order') return response(401, { error: 'Not authenticated.' });
    if (path === '/api/admin-reconcile-order') return response(401, { error: 'Not authenticated.' });
    if (path === '/api/stripe-webhook') return response(webhookStatus, webhookStatus === 400 ? 'Invalid signature' : 'Stripe is not configured.');
    if (path.endsWith('/xert_public_capabilities')) return response(200, capabilities);
    throw new Error(`Unexpected readiness URL: ${url}`);
  };
}

test('Stripe readiness requires every safe production boundary and atomic fulfillment', async () => {
  const report = await inspectStripeReadiness({ environment, fetchImpl: readinessFetch() });
  assert.equal(report.ready, true);
  assert.equal(report.checks.length, 5);
  assert.ok(report.checks.every(check => check.ready));
});

test('Stripe readiness names missing webhook configuration and fulfillment without exposing keys', async () => {
  const report = await inspectStripeReadiness({
    environment,
    fetchImpl: readinessFetch({ webhookStatus: 500, capabilities: [] }),
  });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find(check => check.key === 'webhook').ready, false);
  assert.match(report.checks.find(check => check.key === 'fulfillment').detail, /is missing/);
  assert.match(report.checks.find(check => check.key === 'webhook').remediation, /STRIPE_WEBHOOK_SECRET/);
  assert.match(report.checks.find(check => check.key === 'fulfillment').remediation, /20260715010000_stripe_payment_fulfillment\.sql/);
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
