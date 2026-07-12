import assert from 'node:assert/strict';
import test from 'node:test';

import { partitionAccountBookings } from '../src/lib/accountBookings.js';

test('partitions every booking into one account timeline section', () => {
  const now = new Date('2026-07-12T02:00:00Z');
  const bookings = [
    { booking_id: 'requested', status: 'requested', start_time: '2026-07-13T02:00:00Z' },
    { booking_id: 'waitlisted', status: 'waitlisted', start_time: '2026-07-13T02:00:00Z' },
    { booking_id: 'confirmed', status: 'confirmed', start_time: '2026-07-13T02:00:00Z' },
    { booking_id: 'past-confirmed', status: 'confirmed', start_time: '2026-07-11T02:00:00Z' },
    { booking_id: 'cancelled', status: 'cancelled', start_time: '2026-07-13T02:00:00Z' },
    { booking_id: 'invalid-date', status: 'requested', start_time: null },
  ];

  const groups = partitionAccountBookings(bookings, now);

  assert.deepEqual(groups.pending.map(item => item.booking_id), ['requested', 'waitlisted']);
  assert.deepEqual(groups.upcoming.map(item => item.booking_id), ['confirmed']);
  assert.deepEqual(groups.history.map(item => item.booking_id), ['past-confirmed', 'cancelled', 'invalid-date']);
  assert.equal([...groups.pending, ...groups.upcoming, ...groups.history].length, bookings.length);
});
