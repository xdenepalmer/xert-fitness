import assert from 'node:assert/strict';
import test from 'node:test';
import { activityFromSettled, readinessFromSettled } from '../src/lib/adminOverview.js';

test('distinguishes missing launch setup from unavailable readiness data', () => {
  const result = readinessFromSettled([
    { status: 'fulfilled', value: [{ id: 'coach' }] },
    { status: 'fulfilled', value: [] },
    { status: 'rejected', reason: new Error('permission denied') },
    { status: 'fulfilled', value: [{ id: 'class' }] },
  ]);
  assert.deepEqual(result.launch, { coaches: true, events: false, content: null, classes: true });
  assert.equal(result.data.content, null);
  assert.match(result.errors[0], /content: permission denied/);
});

test('keeps successful activity when one feed source fails', () => {
  const result = activityFromSettled([
    { status: 'rejected', reason: new Error('orders offline') },
    { status: 'fulfilled', value: [{ id: 'member', full_name: 'Alex', joined_at: '2026-07-12T00:00:00Z' }] },
  ]);
  assert.equal(result.feed.length, 1);
  assert.equal(result.feed[0].title, 'Alex');
  assert.match(result.errors[0], /orders offline/);
});
