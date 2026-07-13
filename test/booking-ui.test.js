import assert from 'node:assert/strict';
import test from 'node:test';
import { activeBookingsBySession, classActionLabel } from '../src/lib/bookingUi.js';

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
  assert.equal(classActionLabel({ booking: null, full: false, bookingMode: 'request_to_book' }), 'Request spot');
});
