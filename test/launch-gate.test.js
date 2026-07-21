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

test('a partially enabled platform truthfully blocks launch', () => {
  const checks = readyChecks.map(check => check.key === 'platform-controls'
    ? { ...check, status: 'attention', action: 'Enable member switches.' }
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

test('push and content warnings do not block the core launch path', () => {
  const gate = resolveLaunchGate([
    ...readyChecks,
    { key: 'push-notifications', label: 'Member notifications', status: 'attention' },
    { key: 'cms', label: 'Site CMS content', status: 'attention' },
  ]);
  assert.equal(gate.state, 'preflight-ready');
  assert.equal(gate.warnings.length, 2);
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
  assert.match(adminData, /phase: 'live'/);
});
