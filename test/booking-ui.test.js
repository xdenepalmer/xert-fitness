import assert from 'node:assert/strict';
import test from 'node:test';
import { activeBookingsBySession, bookingTimeConflict, classActionLabel } from '../src/lib/bookingUi.js';

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
