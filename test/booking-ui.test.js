import assert from 'node:assert/strict';
import test from 'node:test';
import { activeBookingsBySession, bookingTimeConflict, classActionLabel, classHasStarted } from '../src/lib/bookingUi.js';

test('treats requested, confirmed, and waitlisted class places as active', () => {
  const map = activeBookingsBySession([
    { session_id: 'a', status: 'requested' },
    { session_id: 'b', status: 'confirmed' },
    { session_id: 'c', status: 'waitlisted' },
    { session_id: 'd', status: 'cancelled' },
  ]);
  assert.deepEqual([...map.keys()], ['a', 'b', 'c']);
});

test('describes the actual class action state before availability fallbacks', () => {
  assert.equal(classActionLabel({ booking: { status: 'waitlisted' }, full: false }), 'Waitlisted');
  assert.equal(classActionLabel({ booking: null, full: true }), 'Join waitlist');
  assert.equal(classActionLabel({ booking: null, conflict: {}, full: false }), 'Time conflict');
  assert.equal(classActionLabel({ booking: null, full: false, bookingMode: 'request_to_book' }), 'Request spot');
});

test('marks a class as started only once its start time has passed', () => {
  const now = Date.parse('2026-08-01T08:30:00.000Z');
  assert.equal(classHasStarted({ start_time: '2026-08-01T08:00:00.000Z' }, now), true);
  assert.equal(classHasStarted({ start_time: '2026-08-01T09:00:00.000Z' }, now), false);
  assert.equal(classHasStarted({ start_time: null }, now), false);
  assert.equal(classHasStarted({ start_time: 'not-a-date' }, now), false);
});

test('uses the real duration when a booking has no end_time so a non-60 class is judged correctly', () => {
  // my_bookings() can return a null end_time; the overlap must then use the
  // class duration, matching the server trigger, instead of a 60-minute guess.
  const target = { id: 'target', start_time: '2026-08-01T08:00:00.000Z', duration_minutes: 60 };

  const ninetyMinuteConflict = {
    session_id: 'other', status: 'confirmed', title: 'Engine',
    start_time: '2026-08-01T07:00:00.000Z', end_time: null, duration_minutes: 90,
  };
  // 07:00 + 90m = 08:30 overlaps the 08:00 target; a 60-minute fallback (ends
  // 08:00) would miss it.
  assert.equal(bookingTimeConflict(target, [ninetyMinuteConflict]), ninetyMinuteConflict);

  const fortyFiveMinuteBooking = {
    session_id: 'other', status: 'confirmed', title: 'Foundation',
    start_time: '2026-08-01T07:00:00.000Z', end_time: null, duration_minutes: 45,
  };
  // 07:00 + 45m = 07:45 ends before the target; a 60-minute fallback (ends
  // 08:00) would raise a false conflict.
  assert.equal(bookingTimeConflict(target, [fortyFiveMinuteBooking]), null);
});

test('detects active class time conflicts while allowing waitlists and back-to-back sessions', () => {
  const target = {
    id: 'target', start_time: '2026-08-01T08:00:00.000Z', duration_minutes: 60,
  };
  const conflict = {
    session_id: 'other', status: 'confirmed', title: 'Strength',
    start_time: '2026-08-01T08:30:00.000Z', end_time: '2026-08-01T09:30:00.000Z',
  };
  assert.equal(bookingTimeConflict(target, [conflict]), conflict);
  assert.equal(bookingTimeConflict(target, [{ ...conflict, status: 'waitlisted' }]), null);
  assert.equal(bookingTimeConflict(target, [{
    ...conflict, status: 'requested', start_time: '2026-08-01T09:00:00.000Z', end_time: '2026-08-01T10:00:00.000Z',
  }]), null);
  assert.equal(bookingTimeConflict(target, [{ ...conflict, session_id: 'target' }]), null);
});
