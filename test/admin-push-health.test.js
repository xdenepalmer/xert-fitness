import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import adminPushHealthHandler, { summarizePushOperations } from '../api/admin-push-health.js';

function count(value) {
  return { count: value, error: null };
}

function configuredEnvironment() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    APNS_KEY_ID: 'KEY123',
    APNS_TEAM_ID: 'TEAM123',
    APNS_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('push operations summary exposes bounded counts without credentials or tokens', () => {
  const result = summarizePushOperations([
    count(12), count(3), count(2), count(18), count(1), count(2),
    { data: { status: 'failed', reason: 'TooManyRequests', attempted_at: '2026-07-14T01:00:00Z' }, error: null },
    { data: { status: 'delivered', reason: 'OWNER_LAUNCH_TEST:DELIVERED', attempted_at: '2026-07-14T00:30:00Z' }, error: null },
  ], configuredEnvironment());

  assert.deepEqual(result, {
    ready: true,
    environment: { ready: true, missing: [] },
    subscriptions: { production: 12, sandbox: 3, disabled: 2 },
    deliveries_24h: { delivered: 18, failed: 1, invalid_token: 2 },
    last_attempt: { status: 'failed', reason: 'TooManyRequests', attempted_at: '2026-07-14T01:00:00Z' },
    owner_smoke_test: {
      status: 'delivered',
      reason: 'OWNER_LAUNCH_TEST:DELIVERED',
      attempted_at: '2026-07-14T00:30:00Z',
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /KEY123|TEAM123|PRIVATE KEY|device_token/i);
});

test('push operations summary names missing settings and propagates database failures', () => {
  const result = summarizePushOperations([
    count(0), count(0), count(0), count(0), count(0), count(0),
    { data: null, error: null }, { data: null, error: null },
  ], {});
  assert.equal(result.ready, false);
  assert.deepEqual(result.environment.missing, ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY']);
  assert.equal(result.last_attempt, null);
  assert.equal(result.owner_smoke_test, null);
  assert.throws(() => summarizePushOperations([
    { count: null, error: new Error('database unavailable') },
    count(0), count(0), count(0), count(0), count(0),
    { data: null, error: null }, { data: null, error: null },
  ], {}), /database unavailable/);
});

test('admin push health is authenticated, service-only, and integrated into operations health', async () => {
  const [endpoint, adminData, operations] = await Promise.all([
    readFile(new URL('../api/admin-push-health.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/adminData.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/OperationsHealth.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(endpoint, /profile\?\.role !== 'admin'/);
  assert.match(endpoint, /push_subscriptions/);
  assert.match(endpoint, /push_notification_deliveries/);
  assert.match(endpoint, /\.eq\('user_id', user\.id\)[\s\S]*\.like\('reason', 'OWNER_LAUNCH_TEST:%'\)/);
  assert.doesNotMatch(endpoint, /select\('.*device_token/);
  assert.match(adminData, /fetch\('\/api\/admin-push-health'/);
  assert.match(adminData, /healthCheck\('push-notifications', 'Member notifications'/);
  assert.match(adminData, /Missing APNs|missing APNs|missing APNs values|missing APNs values in the production Vercel project/i);
  assert.match(operations, /'push-notifications': 'announcements'/);
  assert.match(operations, /BellRing/);
});

test('admin push health authenticates before reporting server configuration', async () => {
  const response = responseRecorder();
  await adminPushHealthHandler({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Not authenticated.' });
});
