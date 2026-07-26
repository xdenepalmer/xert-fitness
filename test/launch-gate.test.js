import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REQUIRED_LAUNCH_CHECKS, resolveLaunchGate } from '../src/lib/launchGate.js';

const readyChecks = REQUIRED_LAUNCH_CHECKS.map(key => ({
  key,
  label: key,
  status: 'ok',
  ...(key === 'platform-controls' ? { phase: 'preflight' } : {}),
}));

test('paused switches produce a truthful preflight-ready state', () => {
  const checks = readyChecks.map(check => check.key === 'platform-controls' ? { ...check, phase: 'preflight' } : check);
  const gate = resolveLaunchGate(checks);
  assert.equal(gate.state, 'preflight-ready');
  assert.equal(gate.completed, gate.total);
  assert.deepEqual(gate.blockers, []);
});

test('bookings can open while guarded payments remain paused', () => {
  const checks = readyChecks.map(check => check.key === 'platform-controls'
    ? { ...check, phase: 'bookings-open', action: 'Activate payments after the smoke test.' }
    : check);
  const gate = resolveLaunchGate(checks);
  assert.equal(gate.state, 'bookings-open');
  assert.equal(gate.completed, gate.total);
  assert.equal(gate.next.key, 'platform-controls');
});

test('payments without bookings remain an unsafe blocker', () => {
  const checks = readyChecks.map(check => check.key === 'platform-controls'
    ? { ...check, status: 'attention', phase: 'unsafe', action: 'Pause payments.' }
    : check);
  const gate = resolveLaunchGate(checks);
  assert.equal(gate.state, 'blocked');
  assert.equal(gate.next.key, 'platform-controls');
});

test('missing or failed required evidence cannot produce a ready result', () => {
  assert.equal(resolveLaunchGate(readyChecks.slice(1)).state, 'verifying');
  const failed = readyChecks.map(check => check.key === 'commerce-config' ? { ...check, status: 'error' } : check);
  assert.equal(resolveLaunchGate(failed).state, 'verifying');
});

test('production push is required while content remains an optional warning', () => {
  const pushBlocked = resolveLaunchGate(readyChecks.map(check => (
    check.key === 'push-notifications' ? { ...check, status: 'attention' } : check
  )));
  assert.equal(pushBlocked.state, 'blocked');
  assert.equal(pushBlocked.next.key, 'push-notifications');

  const gate = resolveLaunchGate([
    ...readyChecks,
    { key: 'cms', label: 'Site CMS content', status: 'attention' },
  ]);
  assert.equal(gate.state, 'preflight-ready');
  assert.equal(gate.warnings.length, 1);

  const deliveredWithHistoricalFailures = resolveLaunchGate(readyChecks.map(check => (
    check.key === 'push-notifications'
      ? { ...check, status: 'attention', launchReady: true }
      : check
  )));
  assert.equal(deliveredWithHistoricalFailures.state, 'preflight-ready');
  assert.equal(deliveredWithHistoricalFailures.warnings[0].key, 'push-notifications');
});

test('enabled switches produce a distinct live-ready state', () => {
  const checks = readyChecks.map(check => check.key === 'platform-controls' ? { ...check, phase: 'live' } : check);
  assert.equal(resolveLaunchGate(checks).state, 'live-ready');
});

test('missing or unknown switch phase fails closed', () => {
  const missing = readyChecks.map(check => check.key === 'platform-controls' ? { key: check.key, label: check.label, status: 'ok' } : check);
  assert.equal(resolveLaunchGate(missing).state, 'verifying');
  const unknown = readyChecks.map(check => check.key === 'platform-controls' ? { ...check, phase: 'unknown' } : check);
  assert.equal(resolveLaunchGate(unknown).state, 'verifying');
});

test('operations health requires a real member-bookable class and models both switch phases', () => {
  const adminData = readFileSync(new URL('../src/lib/adminData.js', import.meta.url), 'utf8');
  assert.match(adminData, /\['instant_book', 'request_to_book'\]\.includes/);
  assert.match(adminData, /Number\.isInteger\(session\.capacity\)/);
  assert.match(adminData, /session\.capacity > 0/);
  assert.match(adminData, /phase: 'preflight'/);
  assert.match(adminData, /phase: 'bookings-open'/);
  assert.match(adminData, /phase: 'live'/);
  assert.match(adminData, /Open member bookings before enabling session-pack payments/);
  assert.match(adminData, /ownerSmokeTest\?\.status === 'delivered'/);
  assert.match(adminData, /smokeTestAge <= 24 \* 60 \* 60 \* 1000/);
});
