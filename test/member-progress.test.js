import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeMemberProgress } from '../src/lib/memberProgress.js';

test('member progress counts recorded attendance only and deduplicates a class session', () => {
  const now = new Date('2026-07-21T02:00:00Z'); // Tuesday midday in Brisbane.
  const bookings = [
    { booking_id: 'a', session_id: 'session-1', status: 'attended', start_time: '2026-07-20T08:00:00Z' },
    { booking_id: 'duplicate', session_id: 'session-1', status: 'attended', start_time: '2026-07-20T08:00:00Z' },
    { booking_id: 'b', session_id: 'session-2', status: 'attended', start_time: '2026-07-13T08:00:00Z' },
    { booking_id: 'c', session_id: 'session-3', status: 'attended', start_time: '2026-06-01T08:00:00Z' },
    { booking_id: 'confirmed', session_id: 'session-4', status: 'confirmed', start_time: '2026-07-19T08:00:00Z' },
    { booking_id: 'no-show', session_id: 'session-5', status: 'no_show', start_time: '2026-07-12T08:00:00Z' },
    { booking_id: 'cancelled', session_id: 'session-6', status: 'cancelled', start_time: '2026-07-10T08:00:00Z' },
    { booking_id: 'future', session_id: 'session-7', status: 'attended', start_time: '2026-07-22T08:00:00Z' },
  ];

  const summary = summarizeMemberProgress(bookings, now);

  assert.equal(summary.totalAttended, 3);
  assert.equal(summary.attendedLast30Days, 2);
  assert.equal(summary.activeWeeksLastFour, 2);
  assert.equal(summary.lastAttendedAt.toISOString(), '2026-07-20T08:00:00.000Z');
});

test('member progress uses Monday Brisbane week boundaries', () => {
  const now = new Date('2026-07-19T15:30:00Z'); // Monday 1:30am Brisbane.
  const summary = summarizeMemberProgress([
    { session_id: 'sunday', status: 'attended', start_time: '2026-07-19T13:30:00Z' }, // Sunday Brisbane.
    { session_id: 'monday', status: 'attended', start_time: '2026-07-19T14:30:00Z' }, // Monday Brisbane.
    { session_id: 'four-weeks-old', status: 'attended', start_time: '2026-06-21T13:30:00Z' },
  ], now);

  assert.equal(summary.activeWeeksLastFour, 2);
  assert.equal(summary.attendedLast30Days, 3);
});

test('member progress has an honest empty state', () => {
  assert.deepEqual(summarizeMemberProgress([], new Date('2026-07-21T02:00:00Z')), {
    totalAttended: 0,
    attendedLast30Days: 0,
    activeWeeksLastFour: 0,
    lastAttendedAt: null,
  });
});
