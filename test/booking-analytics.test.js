import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bookingActionKey,
  bulkBookingStatusOptions,
  bookingSelectionKey,
  classCapacityLine,
  classHasStarted,
  bookingCsvRows,
  filterAdminBookings,
  hiddenBookingCount,
  pendingBookingCount,
  selectedBookingKeys,
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
  const [row] = bookingCsvRows([{ ...bookings[0], admin_notes: 'Private staff note' }]);
  assert.equal(row.source, 'Member credit booking');
  assert.equal(row.class, 'Engine Room');
  assert.equal(row.credit_reserved, 'Yes');
  assert.equal(row.email, 'alex@example.com');
  assert.equal(Object.hasOwn(row, 'admin_notes'), false);
});

test('selects booking rows with collision-safe source keys', () => {
  const sameId = [
    { id: 'shared-id', source: 'member' },
    { id: 'shared-id', source: 'enquiry' },
  ];
  assert.equal(bookingSelectionKey(sameId[0]), 'member:shared-id');
  assert.deepEqual([...selectedBookingKeys(new Set(), sameId, true)], ['member:shared-id', 'enquiry:shared-id']);
  assert.deepEqual([...selectedBookingKeys(new Set(['member:shared-id', 'enquiry:shared-id']), [sameId[0]], false)], ['enquiry:shared-id']);
  assert.throws(() => bookingSelectionKey({ source: 'member' }), /booking ID is required/);
});

test('offers only valid bulk transitions for a consistent booking state', () => {
  assert.deepEqual(bulkBookingStatusOptions([{ status: 'requested' }, { status: 'requested' }]), ['confirmed', 'waitlisted', 'declined', 'cancelled']);
  assert.deepEqual(bulkBookingStatusOptions([{ status: 'confirmed' }]), ['attended', 'no_show', 'cancelled']);
  // Moving a whole waitlist into a class that just freed up is the most useful
  // bulk action there is, and the list used to offer only 'cancelled' for it.
  assert.deepEqual(bulkBookingStatusOptions([{ status: 'waitlisted' }]), ['confirmed', 'declined', 'cancelled']);
  assert.deepEqual(bulkBookingStatusOptions([{ status: 'requested' }, { status: 'confirmed' }]), []);
  assert.deepEqual(bulkBookingStatusOptions([{ status: 'attended' }]), ['confirmed']);
  assert.deepEqual(bulkBookingStatusOptions([{ status: 'no_show' }, { status: 'no_show' }]), ['confirmed']);
  assert.deepEqual(bulkBookingStatusOptions([{ status: 'declined' }]), ['requested']);
  assert.deepEqual(bulkBookingStatusOptions([{ status: 'cancelled' }]), ['requested']);
});

test('the queue can say how many requests its date filter is holding back', () => {
  const now = Date.parse('2026-09-06T00:00:00Z');
  const bookings = [
    { id: 'new', source: 'enquiry', status: 'requested', created_at: '2026-09-05T00:00:00Z' },
    { id: 'old', source: 'enquiry', status: 'requested', created_at: '2026-07-01T00:00:00Z' },
  ];
  // Someone who asked for a class six weeks out is still waiting for an answer.
  assert.equal(filterAdminBookings(bookings, { days: '30' }, now).length, 1);
  assert.equal(hiddenBookingCount(bookings, { days: '30' }, now), 1);
  assert.equal(hiddenBookingCount(bookings, { days: 'all' }, now), 0);
  assert.equal(pendingBookingCount(bookings), 2);
});

test('search reaches the notes staff actually typed', () => {
  const bookings = [
    { id: '1', source: 'enquiry', status: 'requested', full_name: 'Ada', admin_notes: 'called Tuesday' },
    { id: '2', source: 'enquiry', status: 'requested', full_name: 'Bo', notes: 'knee injury, first session' },
    { id: '3', source: 'enquiry', status: 'requested', full_name: 'Cy' },
  ];
  assert.deepEqual(filterAdminBookings(bookings, { search: 'tuesday', days: 'all' }).map(b => b.id), ['1']);
  assert.deepEqual(filterAdminBookings(bookings, { search: 'knee', days: 'all' }).map(b => b.id), ['2']);
});

test('the export carries the context the owner needs on the floor, in gym time', () => {
  const [row] = bookingCsvRows([{
    source: 'enquiry', status: 'confirmed', full_name: 'Walk-up', created_at: '2026-09-04T20:00:00Z',
    training_level: 'Beginner', notes: 'knee injury', admin_notes: 'called Tuesday',
    session: { title: '6am Engine', start_time: '2026-09-04T20:00:00Z' },
  }]);
  assert.equal(row.training_level, 'Beginner');
  assert.equal(row.their_note, 'knee injury');
  assert.equal(row.staff_note, 'called Tuesday');
  // Not the raw UTC string, which read as the previous evening in Excel.
  assert.equal(row.class_start, 'Sat 5 Sept, 6:00 am');
});

test('the queue tells staff what confirming would do to the room', () => {
  assert.equal(
    classCapacityLine({ taken: 8, capacity: 8, spotsLeft: 0, waiting: 2, bookingMode: 'instant_book' }),
    '8 / 8 in the class · full · 2 on the waitlist · sign-ups take a real spot',
  );
  assert.equal(
    classCapacityLine({ taken: 3, capacity: 12, spotsLeft: 9, waiting: 0, bookingMode: 'request_to_book' }),
    '3 / 12 in the class · 9 left · request to book',
  );
  // An interest-only registration is not a request for a place, and Confirm
  // used to look identical on both.
  assert.match(
    classCapacityLine({ taken: 0, capacity: 8, spotsLeft: 8, waiting: 0, bookingMode: 'interest_only' }),
    /does not give anyone a place/,
  );
  assert.equal(classCapacityLine(undefined), '');
});

test('attendance is only offered once the class has actually run', () => {
  const now = Date.parse('2026-09-06T00:00:00Z');
  assert.equal(classHasStarted({ session: { start_time: '2026-09-05T00:00:00Z' } }, now), true);
  assert.equal(classHasStarted({ session: { start_time: '2026-09-09T00:00:00Z' } }, now), false);
  assert.equal(classHasStarted({ session: {} }, now), false);
  assert.equal(classHasStarted({}, now), false);
});

test('each row is disabled on its own, not the whole queue', () => {
  assert.equal(bookingActionKey({ source: 'member', id: 'a' }), 'member-a');
  assert.equal(bookingActionKey({ source: 'enquiry', id: 'a' }), 'enquiry-a');
  assert.notEqual(bookingActionKey({ source: 'member', id: 'a' }), bookingActionKey({ source: 'enquiry', id: 'a' }));
});
