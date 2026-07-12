import assert from 'node:assert/strict';
import test from 'node:test';
import { cancellationMessage, cancellationReturnsCredit } from '../src/lib/bookingCancellation.js';

test('uses the server cancellation credit policy for requests and confirmed bookings', () => {
  const now = Date.parse('2026-08-01T00:00:00.000Z');

  assert.equal(cancellationReturnsCredit({ status: 'requested', start_time: '2026-08-01T01:00:00.000Z' }, now), true);
  assert.equal(cancellationReturnsCredit({ status: 'confirmed', start_time: '2026-08-01T13:00:01.000Z' }, now), true);
  assert.equal(cancellationReturnsCredit({ status: 'confirmed', start_time: '2026-08-01T12:00:00.000Z' }, now), false);
});

test('explains the cancellation outcome before a member confirms', () => {
  const now = Date.parse('2026-08-01T00:00:00.000Z');

  assert.match(
    cancellationMessage({ title: 'XERT Strength', status: 'confirmed', start_time: '2026-08-01T08:00:00.000Z' }, now),
    /do not return a class credit/
  );
  assert.match(
    cancellationMessage({ title: 'XERT Strength', status: 'requested', start_time: '2026-08-01T01:00:00.000Z' }, now),
    /return your class credit/
  );
});
