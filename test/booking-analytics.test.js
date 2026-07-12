import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bookingCsvRows,
  filterAdminBookings,
  summarizeAdminBookings,
} from '../src/lib/bookingAnalytics.js';

const NOW = Date.parse('2026-07-12T12:00:00+10:00');
const bookings = [
  {
    id: 'member-1', source: 'member', status: 'requested', full_name: 'Alex Runner',
    email: 'alex@example.com', phone: '0400 111 222', createdAt: '2026-07-11T00:00:00Z',
    credit_batch_id: 'credit-1', session: { title: 'Engine Room', coach_name: 'Byron', location_zone: 'Kingaroy' },
  },
  {
    id: 'enquiry-1', source: 'enquiry', status: 'confirmed', full_name: 'Sam Strong',
    email: 'sam@example.com', createdAt: '2026-05-01T00:00:00Z',
    session: { title: 'Strength Foundations', start_time: '2026-07-20T08:00:00Z' },
  },
  { id: 'member-2', source: 'member', status: 'attended', full_name: 'Jo', createdAt: '2026-07-10T00:00:00Z' },
];

test('filters the booking queue by source, age, status, and contact or session search', () => {
  assert.deepEqual(filterAdminBookings(bookings, { source: 'member', days: '30' }, NOW).map(row => row.id), ['member-1', 'member-2']);
  assert.deepEqual(filterAdminBookings(bookings, { status: 'confirmed', days: 'all' }, NOW).map(row => row.id), ['enquiry-1']);
  assert.deepEqual(filterAdminBookings(bookings, { search: 'KINGAROY', days: 'all' }, NOW).map(row => row.id), ['member-1']);
  assert.deepEqual(filterAdminBookings(bookings, { search: 'strength foundations', days: 'all' }, NOW).map(row => row.id), ['enquiry-1']);
});

test('summarizes the filtered booking workload', () => {
  assert.deepEqual(summarizeAdminBookings(bookings), { total: 3, requested: 1, confirmed: 1, attendance: 1 });
});

test('exports booking identity, class, source, and credit reservation fields', () => {
  const [row] = bookingCsvRows(bookings);
  assert.equal(row.source, 'Member credit booking');
  assert.equal(row.class, 'Engine Room');
  assert.equal(row.credit_reserved, 'Yes');
  assert.equal(row.email, 'alex@example.com');
});
