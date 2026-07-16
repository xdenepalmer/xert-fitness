import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { orderOperationsHealthChecks } from '../src/lib/adminHealth.js';

const monitor = readFileSync(new URL('../src/components/admin/OperationsHealth.jsx', import.meta.url), 'utf8');

test('operations health retains results and rejects stale refresh responses', () => {
  assert.match(monitor, /requestInFlightRef\.current/);
  assert.match(monitor, /const requestId = \+\+requestIdRef\.current/);
  assert.match(monitor, /requestId !== requestIdRef\.current/);
  assert.doesNotMatch(monitor, /catch \(error\) \{\s*setChecks\(\[\]\)/);
  assert.match(monitor, /setRefreshing\(true\)/);
  assert.match(monitor, /setLastUpdated\(new Date\(\)\)/);
});

test('operations health refreshes stale visible tabs without polling hidden tabs', () => {
  assert.match(monitor, /shouldRefreshAdminData\(\{/);
  assert.match(monitor, /visibilityState: document\.visibilityState/);
  assert.match(monitor, /ADMIN_OVERVIEW_REFRESH_INTERVAL_MS/);
  assert.match(monitor, /document\.addEventListener\('visibilitychange', refreshWhenVisible\)/);
  assert.match(monitor, /document\.removeEventListener\('visibilitychange', refreshWhenVisible\)/);
});

test('operations health prioritizes errors and warnings while keeping fix targets accessible', () => {
  const checks = [
    { key: 'ready-a', status: 'ok' },
    { key: 'warning-a', status: 'attention' },
    { key: 'error-a', status: 'error' },
    { key: 'warning-b', status: 'attention' },
    { key: 'ready-b', status: 'ok' },
  ];
  assert.deepEqual(orderOperationsHealthChecks(checks).map(check => check.key), [
    'error-a', 'warning-a', 'warning-b', 'ready-a', 'ready-b',
  ]);
  assert.match(monitor, /orderedChecks\.map\(check/);
  assert.match(monitor, /min-h-11[\s\S]*Open section/);
  assert.match(monitor, /role="status" aria-live="polite"/);
});

test('operations health exposes bounded Stripe incidents with an accessible copy action', () => {
  assert.match(monitor, /check\.incidents\?\.length > 0/);
  assert.match(monitor, /Unresolved Stripe webhook incidents/);
  assert.match(monitor, /navigator\.clipboard\.writeText\(eventId\)/);
  assert.match(monitor, /Copy Stripe Event ID/);
  assert.match(monitor, /incident\.resolution/);
  assert.match(monitor, /resolveStripeOperatorReview/);
  assert.match(monitor, /Mark handled/);
  assert.match(monitor, /AdminConfirmDialog/);
});
